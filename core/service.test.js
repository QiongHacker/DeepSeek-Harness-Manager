'use strict';

// 核心逻辑端到端测试：用临时 git 仓库 + 假 web 服务模拟 Harness，
// 验证 启动 / 停止 / 检查更新 / 更新 全流程。用法：node core/service.test.js

const { execFileSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { Service } = require('./service');

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const allocatedPorts = new Set();
async function allocatePort() {
  for (;;) {
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const selected = server.address().port;
        server.close(error => error ? reject(error) : resolve(selected));
      });
    });
    if (!allocatedPorts.has(port)) {
      allocatedPorts.add(port);
      return port;
    }
  }
}

async function removeTestDirectory(base) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(base, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (error) {
      if (!['EBUSY', 'ENOTEMPTY', 'EPERM'].includes(error.code) || attempt === 9) throw error;
      await sleep(250);
    }
  }
}

async function main() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dshmgr-test-'));
  const checkout = path.join(base, 'harness');
  const remote = path.join(base, 'remote.git');
  const tmp2 = path.join(base, 'remote-wk');
  const configPath = path.join(base, 'config.json');
  const PORT = await allocatePort();
  const DEPLOY_PORT = await allocatePort();
  const MIRROR_PORT = await allocatePort();
  const I18N_PORT = await allocatePort();

  console.log('[setup] 创建临时 git 仓库与假服务…');
  sh('git', ['init', '--bare', '-q', remote]);
  fs.mkdirSync(checkout);
  sh('git', ['init', '-q'], { cwd: checkout });
  sh('git', ['config', 'user.email', 't@t'], { cwd: checkout });
  sh('git', ['config', 'user.name', 't'], { cwd: checkout });
  fs.writeFileSync(path.join(checkout, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-root', version: '1.0.0', scripts: { dsh: 'node server.js' } }));
  fs.writeFileSync(path.join(checkout, 'server.js'),
    `require('http').createServer((q,s)=>s.end('ok')).listen(${PORT},'127.0.0.1'); setInterval(()=>{},1000);`);
  sh('git', ['add', '-A'], { cwd: checkout });
  sh('git', ['commit', '-q', '-m', 'v1'], { cwd: checkout });
  sh('git', ['remote', 'add', 'origin', remote], { cwd: checkout });
  sh('git', ['push', '-q', '-u', 'origin', 'HEAD:master'], { cwd: checkout });

  const svc = new Service({ configPath });
  svc.setConfig({ checkout, port: PORT, startCommand: [process.execPath, 'server.js'] });
  svc.on('log', e => console.log(`  [${e.level}] ${e.line}`));
  const results = {};

  // 已有 Harness 目录：识别、绑定并读取版本 / Git 信息；普通 Node 项目必须拒绝
  const bindSvc = new Service({ configPath: path.join(base, 'bind-config.json') });
  const rBind = await bindSvc.bindCheckout(checkout);
  const invalidCheckout = path.join(base, 'not-harness');
  fs.mkdirSync(invalidCheckout);
  fs.writeFileSync(path.join(invalidCheckout, 'package.json'), JSON.stringify({ name: 'ordinary-app', version: '1.0.0' }));
  const rBindInvalid = await bindSvc.bindCheckout(invalidCheckout);
  results.bindExisting = rBind.ok && rBind.path === fs.realpathSync(checkout) && rBind.version === '1.0.0' && rBind.gitOk;
  results.bindRejectsInvalid = !rBindInvalid.ok && rBindInvalid.reason === 'not-harness' && bindSvc.config.checkout === fs.realpathSync(checkout);

  // 1) 启动
  console.log('[test] 启动…');
  const rStart = await svc.start();
  results.start = { ok: rStart.ok, already: !!rStart.already };
  await sleep(1500);
  const st = await svc.getStatus();
  results.statusRunning = st.state === 'running' && st.inUse;

  // 2) 推送 v2 到远程，测试检查更新
  console.log('[test] 推送 v2 并检查更新…');
  sh('git', ['clone', '-q', remote, tmp2]);
  sh('git', ['config', 'user.email', 't@t'], { cwd: tmp2 });
  sh('git', ['config', 'user.name', 't'], { cwd: tmp2 });
  fs.writeFileSync(path.join(tmp2, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-root', version: '2.0.0', scripts: { dsh: 'node server.js' } }));
  sh('git', ['add', '-A'], { cwd: tmp2 });
  sh('git', ['commit', '-q', '-m', 'v2'], { cwd: tmp2 });
  sh('git', ['push', '-q', 'origin', 'HEAD:master'], { cwd: tmp2 });
  const rCheck = await svc.checkUpdate();
  results.checkUpdate = { ok: rCheck.ok, behind: rCheck.behind, ahead: rCheck.ahead };

  // 3) 停止
  console.log('[test] 停止…');
  const rStop = await svc.stop();
  results.stop = { ok: rStop.ok };
  await sleep(1000);
  results.portFree = !(await svc.isPortInUse(PORT));

  // 4) 更新（应拉取 v2）
  console.log('[test] 更新…');
  const rUpd = await svc.update();
  results.update = { ok: rUpd.ok, version: rUpd.version };
  const pkgNow = JSON.parse(fs.readFileSync(path.join(checkout, 'package.json'), 'utf8'));
  results.versionApplied = pkgNow.version === '2.0.0';

  // 5) 一键部署（全新目标目录 + 本地远端仓库模拟，验证克隆与缓存落位）
  console.log('[test] 一键部署…');
  const deployTarget = path.join(base, 'deploy-target');
  const svc2 = new Service({ configPath: path.join(base, 'config2.json') });
  svc2.on('log', e => console.log(`  [d${e.level}] ${e.line}`));
  svc2.setConfig({ checkout: deployTarget, port: DEPLOY_PORT, deployUrl: remote });
  const rDeploy = await svc2.deploy();
  results.deploy = { ok: rDeploy.ok, reason: rDeploy.reason };
  results.deployCheckout = svc2.checkoutExists();
  results.deployNpmrc = fs.existsSync(path.join(deployTarget, '.npmrc')) &&
    fs.readFileSync(path.join(deployTarget, '.npmrc'), 'utf8').includes('store-dir=');
  results.deployStore = fs.existsSync(path.join(deployTarget, '.pnpm-store'));

  // 已部署时应拒绝
  const rDeployAgain = await svc2.deploy();
  results.deployAlready = rDeployAgain.ok === false && rDeployAgain.reason === 'already-deployed';

  // 强制重新部署（force=true 应清空并重新克隆）
  console.log('[test] 重新部署（force）…');
  const vBefore = JSON.parse(fs.readFileSync(path.join(deployTarget, 'package.json'), 'utf8')).version;
  const rRedeploy = await svc2.deploy({ force: true });
  results.redeploy = { ok: rRedeploy.ok, reason: rRedeploy.reason };
  const vAfter = JSON.parse(fs.readFileSync(path.join(deployTarget, 'package.json'), 'utf8')).version;
  results.redeployFresh = vBefore === vAfter; // 重新克隆后版本一致（同一远端）
  results.redeployStore = fs.existsSync(path.join(deployTarget, '.pnpm-store'));

  // 非空目录应拒绝
  const target2 = path.join(base, 'deploy-target2');
  fs.mkdirSync(target2);
  fs.writeFileSync(path.join(target2, 'x.txt'), 'x');
  const svc3 = new Service({ configPath: path.join(base, 'config3.json') });
  svc3.setConfig({ checkout: target2, port: PORT + 2, deployUrl: remote });
  const rDeploy2 = await svc3.deploy();
  results.deployNotEmpty = rDeploy2.ok === false && rDeploy2.reason === 'dir-not-empty';

  // 6) API 绑定（临时 DSH_HOME 模拟 ~/.dsh，验证 settings.yaml + .credentials.yaml 落盘与读取）
  console.log('[test] API 绑定…');
  const dshHome = path.join(base, 'fake-dsh');
  const svc4 = new Service({ configPath: path.join(base, 'config4.json') });
  svc4.setConfig({ dshHome, apiPlatformUrl: 'https://platform.deepseek.com/api_keys' });
  const before = await svc4.getApiBinding();
  results.apiBefore = { bound: before.bound };
  const rApi = await svc4.saveApiBinding({ baseURL: 'https://api.deepseek.com', apiKey: 'sk-test-secret-123456', platformUrl: 'https://platform.deepseek.com/api_keys' });
  results.apiSave = { ok: rApi.ok, bound: rApi.bound };
  results.apiMasked = rApi.apiKeyMasked === 'sk-****3456';
  const settingsText = fs.readFileSync(path.join(dshHome, 'settings.yaml'), 'utf8');
  const credText = fs.readFileSync(path.join(dshHome, '.credentials.yaml'), 'utf8');
  results.apiSettings = settingsText.includes('sk-test-secret-123456') && settingsText.includes('https://api.deepseek.com');
  results.apiCredentials = credText.includes('DEEPSEEK_API_KEY: sk-test-secret-123456');
  // 读取回环（不泄露明文）
  const after = await svc4.getApiBinding();
  results.apiRead = after.bound && after.apiKeyMasked === 'sk-****3456' && after.baseURL === 'https://api.deepseek.com';

  // 7) Token 统计（合成会话：明文 jsonl + zstd 压缩各一个，验证聚合/命中率/费用）
  console.log('[test] Token 统计…');
  const statsHome = path.join(base, 'stats-dsh');
  const sr = path.join(statsHome, 'sessions', '--tmp--');
  fs.mkdirSync(path.join(sr, 'session-a'), { recursive: true });
  fs.mkdirSync(path.join(sr, 'session-b'), { recursive: true });
  const mkRecs = (model, u1, u2) => [
    { type: 'session', id: 'x' },
    { type: 'turn/start', data: {} },
    { type: 'step/start', data: {} },
    { type: 'user/message', data: {} },
    { type: 'request/context', data: { model } },
    { type: 'assistant/message', data: { usage: u1 } },
    { type: 'assistant/chunk', data: { chunk: { type: 'usage', usage: u1 } } }, // 应被忽略，防重复计数
    { type: 'tool/call', data: {} },
    { type: 'assistant/message', data: { usage: u2 } }
  ].map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(path.join(sr, 'session-a', 'session.jsonl'),
    mkRecs('deepseek-chat', { inputTokens: 100, outputTokens: 50, cacheReadTokens: 200, reasoningTokens: 10 }, { inputTokens: 10, outputTokens: 5 }));
  const zlib = require('node:zlib');
  fs.writeFileSync(path.join(sr, 'session-b', 'session.jsonl.zstd'),
    zlib.zstdCompressSync(Buffer.from(mkRecs('deepseek-reasoner', { inputTokens: 10, outputTokens: 5, cacheReadTokens: 20 }, { inputTokens: 20, outputTokens: 15, cacheWriteTokens: 4 }))));
  const svc5 = new Service({ configPath: path.join(base, 'config5.json') });
  svc5.setConfig({ dshHome: statsHome });
  const stats = await svc5.getStats({ force: true });
  results.stats = {
    sessions: stats.sessions, turns: stats.turns, steps: stats.steps, userMessages: stats.userMessages,
    toolCalls: stats.toolCalls, llmCalls: stats.llmCalls,
    input: stats.tokens.input, cacheRead: stats.tokens.cacheRead, cacheWrite: stats.tokens.cacheWrite,
    output: stats.tokens.output, reasoning: stats.tokens.reasoning, total: stats.totalTokens
  };
  results.statsOk = stats.sessions === 2 && stats.turns === 2 && stats.steps === 2 && stats.userMessages === 2 &&
    stats.toolCalls === 2 && stats.llmCalls === 4 &&
    stats.tokens.input === 140 && stats.tokens.cacheRead === 220 && stats.tokens.cacheWrite === 4 &&
    stats.tokens.output === 75 && stats.tokens.reasoning === 10 && stats.totalTokens === 449;
  // 命中率 = cacheRead / (input+cacheRead+cacheWrite) = 220/364 ≈ 60.44%
  results.hitRate = stats.hitRate;
  results.hitRateOk = Math.abs(stats.hitRate - 220 / 364) < 1e-9;
  results.statsCostOk = stats.cost > 0 && stats.models.length === 2;
  results.statsCache = (await svc5.getStats()).updatedAt === stats.updatedAt; // 15s 缓存命中

  // 8) 插件管理（getPlugins 解析 profile manifest）
  console.log('[test] 插件…');
  const pluginsHome = path.join(base, 'plugin-dsh');
  const profileDir = path.join(pluginsHome, 'profiles', 'web');
  fs.mkdirSync(path.join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-fake-plugin'), { recursive: true });
  fs.mkdirSync(path.join(profileDir, 'node_modules', 'plain-lib'), { recursive: true });
  fs.writeFileSync(path.join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-fake-plugin', 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/dsh-fake-plugin', version: '1.2.3', description: '测试插件', dsh: { bundle: { patch: {} } } }));
  fs.writeFileSync(path.join(profileDir, 'node_modules', 'plain-lib', 'package.json'),
    JSON.stringify({ name: 'plain-lib', version: '2.0.1' }));
  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    dependencies: { '@deepseek-ai/dsh-fake-plugin': '^1.0.0', 'plain-lib': '^2.0.0' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-fake-plugin'] } }
  }));
  const svc6 = new Service({ configPath: path.join(base, 'config6.json') });
  svc6.setConfig({ dshHome: pluginsHome });
  const pg = await svc6.getPlugins();
  const byName = Object.fromEntries(pg.plugins.map(p => [p.name, p]));
  results.pluginsOk = pg.ok && pg.initialized && pg.plugins.length === 3 &&
    byName['@deepseek-ai/dsh-fake-plugin']?.version === '1.2.3' &&
    byName['@deepseek-ai/dsh-fake-plugin']?.bundle === true &&
    byName['@deepseek-ai/dsh-fake-plugin']?.inBundles === true &&
    byName['@deepseek-ai/dsh-fake-plugin']?.isDependency === true &&
    byName['plain-lib']?.bundle === false && byName['plain-lib']?.isDependency === true &&
    byName['@deepseek-ai/dsh-base']?.isDependency === false && byName['@deepseek-ai/dsh-base']?.bundle === true;
  const svc7 = new Service({ configPath: path.join(base, 'config7.json') });
  svc7.setConfig({ dshHome: path.join(base, 'empty-dsh') });
  const pg2 = await svc7.getPlugins();
  results.pluginsUninit = pg2.ok && pg2.initialized === false && pg2.plugins.length === 0;

  // 9) 部署镜像回退：主源失败自动切换镜像源
  console.log('[test] 镜像回退…');
  const mirrorTarget = path.join(base, 'mirror-target');
  const svc8 = new Service({ configPath: path.join(base, 'config8.json') });
  svc8.on('log', e => { if (e.level !== 'info') console.log(`  [m${e.level}] ${e.line}`); });
  svc8.setConfig({
    checkout: mirrorTarget, port: MIRROR_PORT,
    deployUrl: path.join(base, 'nonexistent-remote.git'), // 主源必定失败
    deployMirrorUrl: remote                            // 镜像 = 本地有效仓库
  });
  const rMirror = await svc8.deploy();
  results.mirrorFallback = { ok: rMirror.ok, reason: rMirror.reason, deployed: svc8.checkoutExists() };
  results.mirrorOk = rMirror.ok && svc8.checkoutExists();

  // 10) 英文日志（语言配置应作用于服务层输出）
  console.log('[test] 中英文切换…');
  const svc9 = new Service({ configPath: path.join(base, 'config9.json') });
  svc9.setConfig({ language: 'en-US', port: I18N_PORT });
  const englishLogs = [];
  svc9.on('log', e => englishLogs.push(e.line));
  await svc9.stop();
  results.i18n = svc9.config.language === 'en-US' &&
    englishLogs.includes('No running Harness instance was detected.') &&
    englishLogs.includes('Harness stopped.');

  // 清理
  await svc.stop();
  await removeTestDirectory(base);

  console.log('RESULT ' + JSON.stringify(results));
  const pass = results.bindExisting && results.bindRejectsInvalid &&
    results.start.ok && !results.start.already && results.statusRunning &&
    results.checkUpdate.ok && results.checkUpdate.behind === 1 && results.checkUpdate.ahead === 0 &&
    results.stop.ok && results.portFree && results.update.ok && results.versionApplied &&
    results.deploy.ok && results.deployCheckout && results.deployNpmrc &&
    results.deployAlready && results.deployNotEmpty &&
    results.redeploy.ok && results.redeployFresh && results.redeployStore &&
    results.apiSave.ok && results.apiSave.bound && results.apiMasked &&
    results.apiSettings && results.apiCredentials && results.apiRead && !results.apiBefore.bound &&
    results.statsOk && results.hitRateOk && results.statsCostOk && results.statsCache &&
    results.pluginsOk && results.pluginsUninit &&
    results.mirrorOk && results.i18n;
  console.log(pass ? 'ALL PASS ✅' : 'TEST FAILED ❌');
  process.exit(pass ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
