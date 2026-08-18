'use strict';

// Token 统计纯计算模块：可在主进程 worker 线程中运行，不阻塞 UI。
// 数据源：$DSH_HOME/sessions/**/session.jsonl(.zstd)（Harness 会话日志）

const fs = require('fs');
const path = require('path');

const ZSTD_MAGIC = 0xFD2FB528;
const CACHE_VERSION = 3;

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
      const chunks = frames.map(f => zlib.zstdDecompressSync(buf.subarray(f.start, f.end)));
      return Buffer.concat(chunks).toString('utf8');
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

function loadStatsCache(cachePath, sessionsRoot) {
  if (!cachePath) return { entries: {} };
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (cached.version !== CACHE_VERSION || cached.sessionsRoot !== sessionsRoot || !cached.entries || typeof cached.entries !== 'object') {
      return { entries: {} };
    }
    return cached;
  } catch { return { entries: {} }; }
}

function saveStatsCache(cachePath, sessionsRoot, entries) {
  if (!cachePath) return;
  const dir = path.dirname(cachePath);
  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tempPath, JSON.stringify({ version: CACHE_VERSION, sessionsRoot, entries }));
    try {
      fs.renameSync(tempPath, cachePath);
    } catch {
      fs.rmSync(cachePath, { force: true });
      fs.renameSync(tempPath, cachePath);
    }
  } catch {
    try { fs.rmSync(tempPath, { force: true }); } catch { /* ignore cache cleanup errors */ }
  }
}

function eventTimestamp(event, fallbackTimestamp) {
  const data = event && event.data;
  const candidates = [
    event && event.timestamp, event && event.createdAt, event && event.time, event && event.ts,
    data && data.timestamp, data && data.createdAt, data && data.time, data && data.ts
  ];
  for (const value of candidates) {
    if (value == null || value === '') continue;
    let timestamp;
    if (typeof value === 'number') timestamp = value < 1e12 ? value * 1000 : value;
    else if (/^\d+(?:\.\d+)?$/.test(String(value))) {
      const numeric = Number(value);
      timestamp = numeric < 1e12 ? numeric * 1000 : numeric;
    } else timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return fallbackTimestamp;
}

function localHourKey(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`;
}

function parseSessionFile(filePath, fallbackTimestamp = Date.now()) {
  const plain = readSessionFile(filePath);
  if (!plain) return null;

  const zero = () => ({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 });
  const n = v => (Number.isFinite(v) && v > 0) ? v : 0;
  const addRec = (a, b) => { for (const k of Object.keys(a)) a[k] += b[k] || 0; };
  const summary = {
    plainBytes: Buffer.byteLength(plain), sessions: 1, turns: 0, steps: 0,
    userMessages: 0, toolCalls: 0, llmCalls: 0, tokens: zero(), models: {}, timeline: {}
  };
  const modelOf = model => summary.models[model] || (summary.models[model] = { calls: 0, tokens: zero() });
  const hourOf = hour => summary.timeline[hour] || (summary.timeline[hour] = { calls: 0, tokens: zero() });
  let currentModel = null;
  let start = 0;

  while (start < plain.length) {
    const newline = plain.indexOf('\n', start);
    const end = newline === -1 ? plain.length : newline;
    const line = plain.slice(start, end);
    start = newline === -1 ? plain.length : newline + 1;
    if (!line) continue;

    let j;
    try { j = JSON.parse(line); } catch { continue; }
    switch (j.type) {
      case 'turn/start': summary.turns++; break;
      case 'step/start': summary.steps++; break;
      case 'user/message': summary.userMessages++; break;
      case 'tool/call': summary.toolCalls++; break;
      case 'request/context':
        if (j.data && j.data.model) { currentModel = j.data.model; modelOf(currentModel); }
        break;
      case 'assistant/message': {
        const u = j.data && j.data.usage;
        if (!u) break;
        summary.llmCalls++;
        const rec = {
          input: n(u.inputTokens), cacheRead: n(u.cacheReadTokens), cacheWrite: n(u.cacheWriteTokens),
          output: n(u.outputTokens), reasoning: n(u.reasoningTokens)
        };
        addRec(summary.tokens, rec);
        const model = modelOf(currentModel || 'unknown');
        model.calls++;
        addRec(model.tokens, rec);
        const hour = localHourKey(eventTimestamp(j, fallbackTimestamp));
        if (hour) {
          const timelineHour = hourOf(hour);
          timelineHour.calls++;
          addRec(timelineHour.tokens, rec);
        }
        break;
      }
    }
  }
  return summary;
}

/**
 * 聚合统计。历史文件按 size + mtime 复用持久化摘要，仅解析新增或变化的文件。
 * maxBytes 限制本次聚合的解压字节总量，避免超大会话拖垮性能。
 */
function computeStats({ dshHome, pricing = DEFAULT_PRICING, maxBytes = 256 * 1024 * 1024, cachePath, onProgress } = {}) {
  const zero = () => ({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 });
  const addRec = (a, b) => { for (const k of Object.keys(a)) a[k] += b[k] || 0; };
  const sumTokens = t => t.input + t.cacheRead + t.cacheWrite + t.output + t.reasoning;
  const computeCost = (t, price) => (t.input * price.input + t.cacheRead * price.cacheRead +
    t.cacheWrite * price.cacheWrite + (t.output + t.reasoning) * price.output) / 1e6;
  const progress = payload => {
    if (typeof onProgress === 'function') {
      try { onProgress(payload); } catch { /* progress reporting must not stop aggregation */ }
    }
  };

  const sessionsRoot = path.join(dshHome, 'sessions');
  const files = [];
  progress({ phase: 'scanning', percent: 0, processed: 0, total: 0, hits: 0, parsed: 0 });
  collectSessionFiles(sessionsRoot, files);
  files.sort();
  const previousCache = loadStatsCache(cachePath, sessionsRoot);
  const nextEntries = {};

  const agg = {
    sessions: 0, turns: 0, steps: 0, userMessages: 0, toolCalls: 0, llmCalls: 0,
    tokens: zero(), models: {}, timeline: {}, truncated: false
  };
  const modelOf = m => agg.models[m] || (agg.models[m] = { calls: 0, tokens: zero() });
  const hourOf = hour => agg.timeline[hour] || (agg.timeline[hour] = { calls: 0, tokens: zero() });
  let plainBytes = 0;
  let cacheHits = 0;
  let parsedFiles = 0;
  let processedFiles = 0;
  let lastPercent = -1;
  progress({ phase: 'processing', percent: files.length ? 5 : 95, processed: 0, total: files.length, hits: 0, parsed: 0 });
  const reportFileProcessed = () => {
    processedFiles++;
    const percent = 5 + Math.round(processedFiles / files.length * 90);
    if (percent !== lastPercent) {
      lastPercent = percent;
      progress({ phase: 'processing', percent, processed: processedFiles, total: files.length, hits: cacheHits, parsed: parsedFiles });
    }
  };

  for (const f of files) {
    let stat;
    try { stat = fs.statSync(f); } catch { reportFileProcessed(); continue; }
    const cached = previousCache.entries[f];
    let summary;
    if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs && cached.summary) {
      summary = cached.summary;
      cacheHits++;
    } else {
      summary = parseSessionFile(f, stat.mtimeMs);
      parsedFiles++;
    }
    if (!summary) { reportFileProcessed(); continue; }
    nextEntries[f] = { size: stat.size, mtimeMs: stat.mtimeMs, summary };
    plainBytes += summary.plainBytes || 0;
    reportFileProcessed();
    if (plainBytes > maxBytes) { agg.truncated = true; break; }

    for (const key of ['sessions', 'turns', 'steps', 'userMessages', 'toolCalls', 'llmCalls']) agg[key] += summary[key] || 0;
    addRec(agg.tokens, summary.tokens || {});
    for (const [modelName, modelSummary] of Object.entries(summary.models || {})) {
      const model = modelOf(modelName);
      model.calls += modelSummary.calls || 0;
      addRec(model.tokens, modelSummary.tokens || {});
    }
    for (const [hour, hourSummary] of Object.entries(summary.timeline || {})) {
      const timelineHour = hourOf(hour);
      timelineHour.calls += hourSummary.calls || 0;
      addRec(timelineHour.tokens, hourSummary.tokens || {});
    }
  }
  progress({ phase: 'saving', percent: 98, processed: processedFiles, total: files.length, hits: cacheHits, parsed: parsedFiles });
  saveStatsCache(cachePath, sessionsRoot, nextEntries);

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
  const timeline = Object.entries(agg.timeline).map(([time, hour]) => ({
    time,
    calls: hour.calls,
    tokens: hour.tokens,
    totalTokens: sumTokens(hour.tokens)
  })).sort((a, b) => a.time.localeCompare(b.time));
  progress({ phase: 'done', percent: 100, processed: processedFiles, total: files.length, hits: cacheHits, parsed: parsedFiles });

  return {
    updatedAt: Date.now(),
    sessionsRoot,
    sessions: agg.sessions, turns: agg.turns, steps: agg.steps,
    userMessages: agg.userMessages, toolCalls: agg.toolCalls, llmCalls: agg.llmCalls,
    tokens: agg.tokens, totalTokens, hitRate,
    cost: computeCost(agg.tokens, pricing['*']),
    models, timeline, estimated: true, truncated: agg.truncated,
    cache: { files: files.length, hits: cacheHits, parsed: parsedFiles }
  };
}

module.exports = { computeStats, DEFAULT_PRICING, zstdFrames, parseSessionFile };
