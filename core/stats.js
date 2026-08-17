'use strict';

// Token 统计纯计算模块：可在主进程 worker 线程中运行，不阻塞 UI。
// 数据源：$DSH_HOME/sessions/**/session.jsonl(.zstd)（Harness 会话日志）

const fs = require('fs');
const path = require('path');

const ZSTD_MAGIC = 0xFD2FB528;

// DeepSeek 公开定价（USD / 每百万 tokens，估算用；可在配置 apiPricing 中覆盖）
const DEFAULT_PRICING = {
  'deepseek-chat': { input: 0.27, cacheRead: 0.07, cacheWrite: 0.27, output: 1.1 },
  'deepseek-reasoner': { input: 0.55, cacheRead: 0.14, cacheWrite: 0.55, output: 2.19 },
  '*': { input: 0.27, cacheRead: 0.07, cacheWrite: 0.27, output: 1.1 }
};

// 扫描拼接的 Zstandard 帧边界（与 Harness 持久化格式一致）
function zstdFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) break;
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) break;
    offset += 4;
    if (offset === buffer.length) break;
    const descriptor = buffer.readUInt8(offset); offset += 1;
    if ((descriptor & 0x18) !== 0) break;
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 0x20) !== 0;
    const checksum = (descriptor & 0x04) !== 0;
    const dictionaryFlag = descriptor & 0x03;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag;
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) break;
    offset += remainingHeaderBytes;
    for (;;) {
      if (buffer.length - offset < 3) break;
      const blockHeader = buffer.readUIntLE(offset, 3); offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = (blockHeader >>> 1) & 0x03;
      const blockSize = blockHeader >>> 3;
      if (blockType === 0x03) break;
      const payloadBytes = blockType === 0x01 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) break;
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (checksum) { if (buffer.length - offset < 4) break; offset += 4; }
    frames.push({ start, end: offset });
  }
  return frames;
}

function readSessionFile(filePath) {
  try {
    if (filePath.endsWith('.zstd')) {
      const buf = fs.readFileSync(filePath);
      const zlib = require('node:zlib');
      const frames = zstdFrames(buf);
      if (!frames.length) return null;
      let plain = Buffer.alloc(0);
      for (const f of frames) plain = Buffer.concat([plain, zlib.zstdDecompressSync(buf.subarray(f.start, f.end))]);
      return plain.toString('utf8');
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch { return null; }
}

function collectSessionFiles(dir, out) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectSessionFiles(p, out);
    else if (/session\.jsonl(\.zstd)?$/.test(e.name)) out.push(p);
  }
}

/**
 * 聚合统计。maxBytes 限制本次扫描的解压字节总量，避免超大会话拖垮性能。
 */
function computeStats({ dshHome, pricing = DEFAULT_PRICING, maxBytes = 256 * 1024 * 1024 } = {}) {
  const zero = () => ({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 });
  const n = v => (Number.isFinite(v) && v > 0) ? v : 0;
  const addRec = (a, b) => { for (const k of Object.keys(a)) a[k] += b[k] || 0; };
  const sumTokens = t => t.input + t.cacheRead + t.cacheWrite + t.output + t.reasoning;
  const computeCost = (t, price) => (t.input * price.input + t.cacheRead * price.cacheRead +
    t.cacheWrite * price.cacheWrite + (t.output + t.reasoning) * price.output) / 1e6;

  const sessionsRoot = path.join(dshHome, 'sessions');
  const files = [];
  collectSessionFiles(sessionsRoot, files);

  const agg = {
    sessions: 0, turns: 0, steps: 0, userMessages: 0, toolCalls: 0, llmCalls: 0,
    tokens: zero(), models: {}, truncated: false
  };
  const modelOf = m => agg.models[m] || (agg.models[m] = { calls: 0, tokens: zero() });
  let currentModel = null;
  let plainBytes = 0;

  for (const f of files) {
    const plain = readSessionFile(f);
    if (!plain) continue;
    plainBytes += plain.length;
    if (plainBytes > maxBytes) { agg.truncated = true; break; }
    agg.sessions++;
    for (const line of plain.split('\n')) {
      if (!line) continue;
      let j;
      try { j = JSON.parse(line); } catch { continue; }
      switch (j.type) {
        case 'turn/start': agg.turns++; break;
        case 'step/start': agg.steps++; break;
        case 'user/message': agg.userMessages++; break;
        case 'tool/call': agg.toolCalls++; break;
        case 'request/context':
          if (j.data && j.data.model) { currentModel = j.data.model; modelOf(currentModel); }
          break;
        case 'assistant/message': {
          const u = j.data && j.data.usage;
          if (!u) break;
          agg.llmCalls++;
          const rec = { input: n(u.inputTokens), cacheRead: n(u.cacheReadTokens), cacheWrite: n(u.cacheWriteTokens), output: n(u.outputTokens), reasoning: n(u.reasoningTokens) };
          addRec(agg.tokens, rec);
          const m = modelOf(currentModel || 'unknown');
          m.calls++; addRec(m.tokens, rec);
          break;
        }
      }
    }
  }

  const totalTokens = sumTokens(agg.tokens);
  const billedInput = agg.tokens.input + agg.tokens.cacheRead + agg.tokens.cacheWrite;
  const hitRate = billedInput > 0 ? agg.tokens.cacheRead / billedInput : 0;
  const models = Object.entries(agg.models).map(([model, m]) => ({
    model,
    calls: m.calls,
    tokens: m.tokens,
    totalTokens: sumTokens(m.tokens),
    cost: computeCost(m.tokens, pricing[model] || pricing['*'])
  })).sort((a, b) => b.totalTokens - a.totalTokens);

  return {
    updatedAt: Date.now(),
    sessionsRoot,
    sessions: agg.sessions, turns: agg.turns, steps: agg.steps,
    userMessages: agg.userMessages, toolCalls: agg.toolCalls, llmCalls: agg.llmCalls,
    tokens: agg.tokens, totalTokens, hitRate,
    cost: computeCost(agg.tokens, pricing['*']),
    models, estimated: true, truncated: agg.truncated
  };
}

module.exports = { computeStats, DEFAULT_PRICING, zstdFrames };
