'use strict';

// 纯 Node 服务层：不依赖 Electron，便于单元测试。
// 负责：状态检测、启动/停止 Harness、版本检查与更新。

const { EventEmitter } = require('events');
const { spawn, execFile } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const YAML = require('yaml');

const DEFAULT_CHECKOUT = process.env.DSH_CHECKOUT || path.join(os.homedir(), 'deepseek-harness');
const DEFAULT_PORT = 3080;
const DEFAULT_URL = 'http://127.0.0.1:3080';
const DEFAULT_REPO = 'https://github.com/deepseek-ai/deepseek-harness.git';
const DEFAULT_DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const DEFAULT_PLATFORM_URL = 'https://platform.deepseek.com/api_keys';
const DEFAULT_DEPLOY_MIRROR = 'https://ghfast.top/https://github.com/deepseek-ai/deepseek-harness.git';
const DEFAULT_NPM_MIRROR = 'https://registry.npmmirror.com';
const { DEFAULT_PRICING } = require('./stats.js');

function execCapture(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) { err.stdout = stdout || ''; err.stderr = stderr || ''; reject(err); }
      else resolve({ stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Harness 需要 Node ^22.19.0 || >=24.0.0
function isNodeVersionOk(v) {
  const m = String(v || '').match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return false;
  const major = Number(m[1]), minor = Number(m[2]);
  if (major > 24) return true;
  if (major === 24) return true;
  if (major === 22) return minor >= 19;
  return false;
}

class Service extends EventEmitter {
  constructor({ configPath } = {}) {
    super();
    this.configPath = configPath || path.join(os.tmpdir(), 'dsh-manager-config.json');
    this.config = this._loadConfig();
    this.child = null; // 由本应用启动的 Harness 子进程
    this._state = 'stopped'; // stopped | starting | running | stopping | updating | deploying
    this._logBuf = [];
    this._prereqCache = null;
  }

  get state() { return this._state; }
  set state(v) { this._state = v; this.emit('state', v); }

  _loadConfig() {
    const def = {
      checkout: DEFAULT_CHECKOUT,
      port: DEFAULT_PORT,
      openAfterStart: true,
      deployUrl: DEFAULT_REPO,
      deployMirrorUrl: DEFAULT_DEPLOY_MIRROR,
      dshHome: DEFAULT_DSH_HOME,
      apiPlatformUrl: DEFAULT_PLATFORM_URL,
      language: 'zh-CN',
      profile: 'web',
      startCommand: ['cmd', '/c', 'pnpm', 'dsh', 'web']
    };
    try {
      const j = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      return { ...def, ...j };
    } catch { return def; }
  }

  saveConfig() {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (e) {
      this._log('warn', this._m('保存配置失败: ', 'Unable to save settings: ') + e.message);
    }
  }

  setConfig(patch) {
    this.config = { ...this.config, ...patch };
    this.saveConfig();
    this.emit('config', this.config);
  }

  _checkoutMeta(checkout = this.config.checkout) {
    const raw = String(checkout || '').trim().replace(/^"|"$/g, '');
    if (!raw) return { ok: false, reason: 'path-empty' };
    let dir;
    try {
      dir = fs.realpathSync(path.resolve(raw));
      if (!fs.statSync(dir).isDirectory()) return { ok: false, reason: 'not-directory', path: dir };
    } catch { return { ok: false, reason: 'path-not-found', path: path.resolve(raw) }; }

    const packagePath = path.join(dir, 'package.json');
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')); }
    catch { return { ok: false, reason: 'package-invalid', path: dir }; }

    const name = String(pkg.name || '').toLowerCase();
    const hasDshScript = typeof pkg.scripts?.dsh === 'string';
    const hasSourceLayout = fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) &&
      (fs.existsSync(path.join(dir, 'apps', 'cli')) || fs.existsSync(path.join(dir, 'packages')));
    const packageMarker = name === '@deepseek-ai/dsh-root' ||
      (name.includes('deepseek') && (name.includes('dsh') || name.includes('harness')));
    if (!packageMarker && !hasDshScript && !hasSourceLayout) {
      return { ok: false, reason: 'not-harness', path: dir, packageName: pkg.name || '' };
    }
    return {
      ok: true,
      path: dir,
      packageName: pkg.name || '',
      version: pkg.version || '未知',
      dependenciesReady: fs.existsSync(path.join(dir, 'node_modules'))
    };
  }

  checkoutExists(checkout = this.config.checkout) { return this._checkoutMeta(checkout).ok; }

  async inspectCheckout(checkout) {
    const meta = this._checkoutMeta(checkout);
    if (!meta.ok) return meta;
    let head = '(非 git 目录)', branch = '', remote = '', gitOk = false;
    try {
      head = (await execCapture('git', ['rev-parse', '--short', 'HEAD'], { cwd: meta.path })).stdout.trim();
      branch = (await execCapture('git', ['branch', '--show-current'], { cwd: meta.path })).stdout.trim();
      try { remote = (await execCapture('git', ['remote', 'get-url', 'origin'], { cwd: meta.path })).stdout.trim(); } catch { /* optional */ }
      gitOk = true;
    } catch { /* a source archive can still be started, but cannot be updated */ }
    return { ...meta, head, branch, remote, gitOk };
  }

  async bindCheckout(checkout) {
    const inspected = await this.inspectCheckout(checkout);
    if (!inspected.ok) return inspected;
    const current = path.resolve(String(this.config.checkout || ''));
    if (this.child && path.resolve(inspected.path) !== current) return { ok: false, reason: 'service-running' };
    this.setConfig({ checkout: inspected.path });
    this._log('info', this._m(
      `✅ 已绑定现有 Harness：${inspected.path}（版本 ${inspected.version} @ ${inspected.head}）`,
      `✅ Existing Harness bound: ${inspected.path} (version ${inspected.version} @ ${inspected.head})`));
    return inspected;
  }

  _log(level, line) {
    const entry = {
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      level,
      line: String(line).replace(/\r?\n$/, '')
    };
    this._logBuf.push(entry);
    if (this._logBuf.length > 2000) this._logBuf.shift();
    this.emit('log', entry);
  }

  _m(zh, en) { return this.config.language === 'en-US' ? en : zh; }

  getLogs() { return this._logBuf.slice(); }

  async versionInfo(checkout = this.config.checkout) {
    const info = { version: '未知', head: '未知', gitOk: false };
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(checkout, 'package.json'), 'utf8'));
      info.version = pkg.version || '未知';
    } catch { /* ignore */ }
    try {
      const r = await execCapture('git', ['rev-parse', '--short', 'HEAD'], { cwd: checkout });
      info.head = r.stdout.trim();
      info.gitOk = true;
    } catch { info.head = '(非 git 目录)'; }
    return info;
  }

  isPortInUse(port) {
    return new Promise(resolve => {
      const srv = net.createServer();
      srv.once('error', () => resolve(true));
      srv.once('listening', () => srv.close(() => resolve(false)));
      srv.listen(port, '127.0.0.1');
    });
  }

  async getStatus() {
    const inUse = await this.isPortInUse(this.config.port);
    let state = this._state;
    if (state === 'stopped' && inUse) state = 'running-external';
    if (state === 'starting' && inUse) state = 'running';
    return {
      state,
      port: this.config.port,
      inUse,
      checkout: this.config.checkout,
      checkoutsOk: this.checkoutExists(),
      deploy: await this.checkDeploy(),
      ...(await this.versionInfo())
    };
  }

  // 部署环境检查：目标目录是否已有 Harness、Git/Node/pnpm 是否可用
  async checkDeploy({ force = false } = {}) {
    const probe = async (cmd, args) => {
      try { await execCapture(cmd, args, { timeout: 8000 }); return true; } catch { return false; }
    };
    const now = Date.now();
    let prereq = this._prereqCache && !force && now - this._prereqCache.at < 15000
      ? this._prereqCache.data
      : null;
    if (!prereq) {
      // 三项检查互不依赖；并行执行可显著缩短首次状态加载时间。
      const [git, pnpm, nodeInfo] = await Promise.all([
        probe('git', ['--version']),
        // Windows 上 pnpm 是 .cmd 壳，execFile 无法直接执行，需经 cmd /c
        probe('cmd', ['/c', 'pnpm', '--version']),
        (async () => {
          try {
            const r = await execCapture('node', ['--version'], { timeout: 8000 });
            const nodeVersion = r.stdout.trim();
            return { node: true, nodeVersion, nodeOk: isNodeVersionOk(nodeVersion) };
          } catch { return { node: false, nodeVersion: '', nodeOk: false }; }
        })()
      ]);
      prereq = { git, pnpm, ...nodeInfo };
      this._prereqCache = { at: now, data: prereq };
    }
    return {
      deployed: this.checkoutExists(),
      ...prereq,
      checkout: this.config.checkout,
      deployUrl: this.config.deployUrl || DEFAULT_REPO
    };
  }

  // 一键部署：浅克隆官方仓库 → 依赖缓存放到部署目录（不占 C 盘）→ 安装依赖
  // force=true 时用于重新部署：停止服务、清空目录后重新克隆
  async deploy({ force = false } = {}) {
    if (this._state === 'deploying') return { ok: false, reason: 'deploying' };
    if (this.checkoutExists() && !force) return { ok: false, reason: 'already-deployed' };
    const prereq = await this.checkDeploy();
    if (!prereq.git) return { ok: false, reason: 'missing-git' };
    if (!prereq.node) return { ok: false, reason: 'missing-node' };
    if (!prereq.pnpm) return { ok: false, reason: 'missing-pnpm' };

    const dir = this.config.checkout;
    if (force) {
      this._log('info', this._m('重新部署：先停止服务并清空旧目录…', 'Redeploying: stopping the service and removing the old directory…'));
      await this.stop();
      if (fs.existsSync(dir)) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {
          this._log('error', this._m('清空目录失败: ', 'Unable to remove the old directory: ') + e.message);
          return { ok: false, reason: 'rm-failed' };
        }
      }
    }
    if (fs.existsSync(dir)) {
      const items = fs.readdirSync(dir);
      if (items.length) return { ok: false, reason: 'dir-not-empty' };
    } else {
      try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { return { ok: false, reason: 'mkdir-failed' }; }
    }

    this.state = 'deploying';
    this._log('info', this._m(`开始部署 Harness → ${dir}`, `Deploying Harness → ${dir}`));

    // 克隆：主源失败自动切换国内镜像（镜像地址可在设置中修改）
    const sources = [this.config.deployUrl || DEFAULT_REPO];
    const mirror = (this.config.deployMirrorUrl || '').trim();
    if (mirror && mirror !== sources[0]) sources.push(mirror);
    let cloneCode = -1, usedSource = '';
    for (const src of sources) {
      this._log('info', this._m(`克隆官方仓库（浅克隆 ${src}）…`, `Cloning the repository (shallow clone from ${src})…`));
      cloneCode = await this._runLogged(['git', 'clone', '--depth', '1', src, dir], path.dirname(dir), 'git clone');
      if (cloneCode === 0 && this.checkoutExists()) { usedSource = src; break; }
      if (src !== sources[sources.length - 1]) {
        this._log('warn', this._m('主源下载失败，自动切换到国内镜像重试…', 'The primary source failed; trying the configured mirror…'));
        // 清掉主源失败的残留目录，避免 git clone 报非空
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    }
    if (cloneCode !== 0 || !this.checkoutExists()) {
      this._log('error', this._m(
        `克隆仓库失败（已尝试 ${sources.length} 个源），请检查网络，或到「设置」更换镜像地址后重试`,
        `Unable to clone the repository after trying ${sources.length} source(s). Check your network or change the mirror in Settings.`));
      this.state = 'stopped';
      return { ok: false, reason: 'clone-failed' };
    }
    if (usedSource && usedSource !== sources[0]) {
      this._log('info', this._m('已通过国内镜像下载成功，后续「检查更新」将自动使用该镜像源', 'Downloaded successfully from the mirror; future update checks will use it.'));
    }

    // 把 pnpm store（依赖缓存）放到部署目录内，避免占用 C 盘系统空间
    const storeDir = path.join(dir, '.pnpm-store');
    try {
      fs.writeFileSync(path.join(dir, '.npmrc'), 'store-dir=' + storeDir.replace(/\\/g, '/') + '\n');
      this._log('info', this._m(`依赖缓存目录：${storeDir}（已写入 .npmrc，不占 C 盘）`, `Dependency cache: ${storeDir} (configured in .npmrc)`));
    } catch (e) {
      this._log('warn', this._m('写入 .npmrc 失败: ', 'Unable to write .npmrc: ') + e.message);
    }

    // 安装依赖：默认源失败自动切国内 npm 镜像重试
    this._log('info', this._m('安装依赖（pnpm install，首次可能需要几分钟）…', 'Installing dependencies with pnpm (the first run may take several minutes)…'));
    let installCode = await this._runLogged(
      ['cmd', '/c', 'pnpm', 'install', '--store-dir', storeDir],
      dir, 'pnpm install');
    if (installCode !== 0) {
      this._log('warn', this._m(`依赖下载失败，自动切换到国内 npm 镜像（${DEFAULT_NPM_MIRROR}）重试…`, `Dependency download failed; retrying with ${DEFAULT_NPM_MIRROR}…`));
      installCode = await this._runLogged(
        ['cmd', '/c', 'pnpm', 'install', '--store-dir', storeDir, '--registry', DEFAULT_NPM_MIRROR],
        dir, this._m('pnpm install（镜像源）', 'pnpm install (mirror)'));
      if (installCode === 0) this._log('info', this._m('✅ 已通过国内 npm 镜像完成依赖安装', '✅ Dependencies installed successfully from the mirror'));
    }
    if (installCode !== 0) {
      this._log('error', this._m('依赖安装失败（默认源与国内镜像均失败），请检查网络后重试', 'Dependency installation failed with both the default registry and mirror. Check your network and try again.'));
      this.state = 'stopped';
      return { ok: false, reason: 'install-failed' };
    }
    if (!this.checkoutExists()) {
      this._log('error', this._m('部署后未找到 package.json', 'Deployment verification failed: package.json was not found.'));
      this.state = 'stopped';
      return { ok: false, reason: 'verify-failed' };
    }
    const v = await this.versionInfo();
    this._log('info', this._m(`✅ Harness 部署完成：版本 ${v.version} @ ${v.head}`, `✅ Harness deployed: version ${v.version} @ ${v.head}`));
    this.state = 'stopped';
    return { ok: true, version: v.version, head: v.head };
  }

  // ---------- API 绑定（写入 $DSH_HOME 官方配置，热更新生效） ----------

  _apiPaths() {
    const home = this.config.dshHome || DEFAULT_DSH_HOME;
    return { home, settings: path.join(home, 'settings.yaml'), credentials: path.join(home, '.credentials.yaml') };
  }

  _readYaml(p) {
    try { return YAML.parseDocument(fs.readFileSync(p, 'utf8')); }
    catch { return YAML.parseDocument(''); }
  }

  _maskKey(key) {
    const k = String(key || '');
    if (k.length <= 8) return k ? '****' : '';
    return k.slice(0, 3) + '****' + k.slice(-4);
  }

  async getApiBinding() {
    const { home, settings, credentials } = this._apiPaths();
    let baseURL = '', apiKey = '', keySource = '未绑定';
    const sDoc = this._readYaml(settings);
    const ns = sDoc.get('llm-deepseek');
    if (ns && typeof ns === 'object') {
      const get = typeof ns.get === 'function' ? k => ns.get(k) : k => ns[k];
      baseURL = get('baseURL') || '';
      apiKey = get('apiKey') || '';
    }
    const cDoc = this._readYaml(credentials);
    const envKey = cDoc.get('DEEPSEEK_API_KEY') || '';
    if (envKey) { apiKey = apiKey || envKey; }
    const bound = !!(apiKey || envKey);
    if (bound) keySource = '已绑定';
    return {
      ok: true,
      dshHome: home,
      settingsPath: settings,
      credentialsPath: credentials,
      baseURL: baseURL || '',
      apiKeyMasked: bound ? this._maskKey(apiKey || envKey) : '',
      keySource,
      bound,
      platformUrl: this.config.apiPlatformUrl || DEFAULT_PLATFORM_URL
    };
  }

  async saveApiBinding({ baseURL, apiKey, platformUrl } = {}) {
    const { home, settings, credentials } = this._apiPaths();
    try { fs.mkdirSync(home, { recursive: true }); } catch (e) {
      this._log('error', this._m(`创建 ${home} 失败: ${e.message}`, `Unable to create ${home}: ${e.message}`));
      return { ok: false, reason: 'mkdir-failed' };
    }
    try {
      // settings.yaml：llm-deepseek 命名空间写入 apiKey / baseURL（热更新）
      const sDoc = this._readYaml(settings);
      sDoc.setIn(['llm-deepseek', 'apiKey'], String(apiKey || ''));
      if (baseURL) sDoc.setIn(['llm-deepseek', 'baseURL'], String(baseURL));
      fs.writeFileSync(settings, sDoc.toString());
      // .credentials.yaml：DEEPSEEK_API_KEY（环境变量方式同样可用，热更新）
      const cDoc = this._readYaml(credentials);
      cDoc.set('DEEPSEEK_API_KEY', String(apiKey || ''));
      fs.writeFileSync(credentials, cDoc.toString());
    } catch (e) {
      this._log('error', this._m('保存 API 配置失败: ', 'Unable to save API settings: ') + e.message);
      return { ok: false, reason: 'write-failed' };
    }
    if (platformUrl) {
      this.config.apiPlatformUrl = String(platformUrl);
      this.saveConfig();
    }
    this._log('info', this._m(`✅ API 已保存 → ${home}（settings.yaml / .credentials.yaml，运行中即刻生效）`, `✅ API settings saved to ${home} and applied immediately`));
    return { ok: true, ...(await this.getApiBinding()) };
  }

  // ---------- Token 统计（worker 线程计算，不阻塞主进程 UI） ----------

  async getStats({ force = false } = {}) {
    if (!force && this._statsCache && Date.now() - this._statsCacheAt < 60000) return this._statsCache;
    if (this._statsInFlight) return this._statsInFlight;

    this._statsInFlight = new Promise(resolve => {
      const { Worker } = require('worker_threads');
      const worker = new Worker(path.join(__dirname, 'stats-worker.js'), {
        workerData: {
          dshHome: this.config.dshHome || DEFAULT_DSH_HOME,
          pricing: { ...DEFAULT_PRICING, ...(this.config.apiPricing || {}) }
        }
      });
      const timer = setTimeout(() => {
        worker.terminate();
        this._statsInFlight = null;
        resolve({ ok: false, error: 'timeout' });
      }, 120000);
      worker.on('message', m => {
        clearTimeout(timer);
        this._statsInFlight = null;
        this._statsCache = m;
        this._statsCacheAt = Date.now();
        resolve(m);
      });
      worker.on('error', e => {
        clearTimeout(timer);
        this._statsInFlight = null;
        resolve({ ok: false, error: String((e && e.message) || e) });
      });
      worker.on('exit', code => {
        if (this._statsInFlight) {
          clearTimeout(timer);
          this._statsInFlight = null;
          resolve({ ok: false, error: 'worker-exit:' + code });
        }
      });
    });
    return this._statsInFlight;
  }

  // ---------- 插件管理（官方 dsh plugin --profile 机制：转发 pnpm 到 profile 目录） ----------

  _profileDir() {
    return path.join(this.config.dshHome || DEFAULT_DSH_HOME, 'profiles', this.config.profile || 'web');
  }

  _resolvePackageMeta(profileDir, name) {
    const candidates = [
      path.join(profileDir, 'node_modules', ...name.split('/'), 'package.json'),
      path.join(path.dirname(profileDir), 'node_modules', ...name.split('/'), 'package.json')
    ];
    for (const p of candidates) {
      try {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        return { version: j.version || '', description: j.description || '', bundle: !!(j.dsh && j.dsh.bundle && j.dsh.bundle.patch) };
      } catch { /* try next */ }
    }
    return { version: '', description: '', bundle: false };
  }

  async getPlugins() {
    const profileDir = this._profileDir();
    const manifestPath = path.join(profileDir, 'package.json');
    if (!fs.existsSync(manifestPath)) {
      return { ok: true, profile: this.config.profile || 'web', profileDir, initialized: false, plugins: [] };
    }
    let manifest = {};
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { /* ignore */ }
    const deps = manifest.dependencies || {};
    const bundles = (manifest.dsh && manifest.dsh.profile && manifest.dsh.profile.bundles) || [];

    const seen = new Set();
    const plugins = [];
    for (const name of bundles) {
      if (seen.has(name)) continue;
      seen.add(name);
      const meta = this._resolvePackageMeta(profileDir, name);
      plugins.push({
        name, version: meta.version, description: meta.description,
        bundle: true, isDependency: name in deps, inBundles: true
      });
    }
    for (const name of Object.keys(deps)) {
      if (seen.has(name)) continue;
      seen.add(name);
      const meta = this._resolvePackageMeta(profileDir, name);
      plugins.push({
        name, version: meta.version, description: meta.description,
        bundle: meta.bundle, isDependency: true, inBundles: bundles.includes(name)
      });
    }
    return {
      ok: true, profile: this.config.profile || 'web', profileDir, initialized: true,
      plugins
    };
  }

  _pluginCommand(args) {
    return ['cmd', '/c', 'pnpm', 'dsh', 'plugin', '--profile', this.config.profile || 'web', ...args];
  }

  async pluginInstall(spec) {
    if (!this.checkoutExists()) return { ok: false, reason: 'checkout-not-found' };
    const s = String(spec || '').trim();
    if (!s) return { ok: false, reason: 'empty-spec' };
    this._log('info', this._m(`安装插件：${s}（dsh plugin add，需要联网）…`, `Installing plugin ${s} with dsh plugin add…`));
    const code = await this._runLogged(this._pluginCommand(['add', s]), this.config.checkout, this._m('插件安装', 'Plugin install'));
    if (code !== 0) {
      this._log('error', this._m('插件安装失败，请查看上方日志', 'Plugin installation failed. See the output above.'));
      return { ok: false, reason: 'install-failed' };
    }
    this._log('info', this._m(`✅ 插件已安装：${s}（重启 Harness 后生效）`, `✅ Plugin installed: ${s}. Restart Harness to apply it.`));
    return { ok: true, ...(await this.getPlugins()) };
  }

  async pluginUninstall(name) {
    if (!this.checkoutExists()) return { ok: false, reason: 'checkout-not-found' };
    const n = String(name || '').trim();
    if (!n) return { ok: false, reason: 'empty-name' };
    this._log('info', this._m(`卸载插件：${n}（dsh plugin remove）…`, `Removing plugin ${n} with dsh plugin remove…`));
    const code = await this._runLogged(this._pluginCommand(['remove', n]), this.config.checkout, this._m('插件卸载', 'Plugin removal'));
    if (code !== 0) {
      this._log('error', this._m('插件卸载失败，请查看上方日志', 'Plugin removal failed. See the output above.'));
      return { ok: false, reason: 'uninstall-failed' };
    }
    this._log('info', this._m(`✅ 插件已卸载：${n}（重启 Harness 后生效）`, `✅ Plugin removed: ${n}. Restart Harness to apply it.`));
    return { ok: true, ...(await this.getPlugins()) };
  }

  _findListenerPids(port) {
    return new Promise(resolve => {
      execFile('netstat', ['-ano'], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
        if (err) return resolve([]);
        const pids = new Set();
        for (const line of String(stdout).split(/\r?\n/)) {
          const m = line.match(/TCP\s+[\d.]+:(\d+)\s+[\d.]+:\d+\s+LISTENING\s+(\d+)/i);
          if (m && Number(m[1]) === port) pids.add(Number(m[2]));
        }
        resolve([...pids]);
      });
    });
  }

  async _processMap() {
    try {
      const { stdout } = await execCapture('powershell', ['-NoProfile', '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress']);
      const arr = JSON.parse(stdout);
      const map = new Map();
      for (const p of (Array.isArray(arr) ? arr : [arr])) map.set(p.ProcessId, { ppid: p.ParentProcessId, name: p.Name });
      return map;
    } catch { return new Map(); }
  }

  async _killTree(pid) {
    try {
      await execCapture('taskkill', ['/PID', String(pid), '/T', '/F']);
    } catch (e) {
      this._log('warn', `taskkill ${pid}: ${String(e.stderr || e.message).trim()}`);
    }
  }

  // 终止监听端口的外部实例：先向上找 pnpm/cmd 包装进程链，自上而下整树终止
  async _killChain(listenerPid) {
    const map = await this._processMap();
    const parentNames = new Set(['node.exe', 'pnpm.cmd', 'cmd.exe', 'conhost.exe', 'powershell.exe']);
    const chain = [];
    let cur = listenerPid, guard = 0;
    while (cur && guard++ < 20) {
      const p = map.get(cur);
      if (!p) break;
      chain.push(cur);
      if (parentNames.has(String(p.name || '').toLowerCase())) cur = p.ppid; else break;
    }
    for (const pid of chain.reverse()) await this._killTree(pid);
    const pids = await this._findListenerPids(this.config.port);
    for (const pid of pids) await this._killTree(pid);
  }

  async start() {
    if (this._state === 'starting' || this._state === 'running') return { ok: false, reason: 'running' };
    if (!this.checkoutExists()) {
      this._log('error', this._m(`未找到 Harness：${this.config.checkout}`, `Harness was not found at ${this.config.checkout}`));
      return { ok: false, reason: 'checkout-not-found' };
    }
    // 启动前先检查环境，避免“启动失败却不知道原因”
    const env = await this.checkDeploy();
    const missing = [];
    if (!env.git) missing.push('Git');
    if (!env.node) missing.push('Node.js');
    if (!env.pnpm) missing.push('pnpm');
    if (env.node && !env.nodeOk) missing.push(this._m('Node.js 版本过低（需 ^22.19.0 或 >=24）', 'Node.js is too old (requires ^22.19.0 or >=24)'));
    if (missing.length) {
      this._log('error', this._m(
        `启动失败：环境缺少 ${missing.join('、')}。请在「概览」页查看环境检查结果并处理后再试。`,
        `Startup failed. Missing requirements: ${missing.join(', ')}. Check Environment & Deployment on the Overview page.`));
      return { ok: false, reason: 'missing-env' };
    }
    if (await this.isPortInUse(this.config.port)) {
      this._log('info', this._m(`端口 ${this.config.port} 已被占用，检测到 Harness 已在运行`, `Port ${this.config.port} is in use; Harness appears to be running already.`));
      this.state = 'running';
      return { ok: true, already: true };
    }

    this.state = 'starting';
    this._log('info', this._m(`正在启动 Harness（${path.join(this.config.checkout)}）…`, `Starting Harness in ${path.join(this.config.checkout)}…`));
    const [cmd, ...args] = this.config.startCommand;
    const child = spawn(cmd, args, { cwd: this.config.checkout, windowsHide: true, env: process.env });
    this.child = child;
    child.stdout.on('data', d => this._log('info', d.toString()));
    child.stderr.on('data', d => this._log('warn', d.toString()));
    child.on('error', err => {
      this._log('error', this._m('启动失败: ', 'Startup failed: ') + err.message);
      if (this.child === child) { this.child = null; this.state = 'stopped'; }
    });
    child.on('exit', (code, sig) => {
      this._log(code === 0 ? 'info' : 'warn', this._m(
        `Harness 进程已退出（code=${code}${sig ? ', ' + sig : ''}）`,
        `Harness exited (code=${code}${sig ? ', ' + sig : ''})`));
      if (this.child === child) {
        this.child = null;
        if (this._state !== 'stopping') this.state = 'stopped';
      }
    });

    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      if (!this.child) break;
      if (await this.isPortInUse(this.config.port)) {
        this.state = 'running';
        this._log('info', this._m(`✅ Harness 已启动：${DEFAULT_URL}`, `✅ Harness started: ${DEFAULT_URL}`));
        return { ok: true };
      }
      await sleep(1000);
    }
    this._log('warn', this._m('等待端口超时，Harness 可能未能启动，请查看上方日志', 'Timed out waiting for the service port. Harness may not have started; check the logs above.'));
    this.state = 'stopped';
    return { ok: false, reason: 'timeout' };
  }

  async stop() {
    if (this._state === 'stopping') return { ok: false, reason: 'stopping' };
    this.state = 'stopping';
    const pids = await this._findListenerPids(this.config.port);
    if (this.child) {
      this._log('info', this._m(`正在停止 Harness（PID ${this.child.pid}）…`, `Stopping Harness (PID ${this.child.pid})…`));
      await this._killTree(this.child.pid);
      this.child = null;
    } else if (pids.length) {
      this._log('info', this._m(
        `检测到外部实例占用端口 ${this.config.port}（PID: ${pids.join(', ')}），正在终止…`,
        `An external process is listening on port ${this.config.port} (PID: ${pids.join(', ')}). Terminating it…`));
      await this._killChain(pids[0]);
    } else {
      this._log('info', this._m('未检测到运行中的 Harness', 'No running Harness instance was detected.'));
    }
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (!(await this.isPortInUse(this.config.port))) break;
      await sleep(500);
    }
    this.state = 'stopped';
    this._log('info', this._m('Harness 已停止', 'Harness stopped.'));
    return { ok: true };
  }

  async checkUpdate() {
    if (this._state === 'updating') return { ok: false, reason: 'updating' };
    if (!this.checkoutExists()) return { ok: false, reason: 'checkout-not-found' };
    this._log('info', this._m('正在检查远程更新…', 'Checking the remote repository for updates…'));
    try {
      await execCapture('git', ['fetch', 'origin', '--prune'], { cwd: this.config.checkout });
      const remoteRef = await this._resolveRemoteRef();
      if (!remoteRef) throw new Error(this._m('未找到可用的远程跟踪分支', 'No remote tracking branch was found'));
      const localHead = (await execCapture('git', ['rev-parse', 'HEAD'], { cwd: this.config.checkout })).stdout.trim();
      const remoteHead = (await execCapture('git', ['rev-parse', remoteRef], { cwd: this.config.checkout })).stdout.trim();
      const behind = Number((await execCapture('git', ['rev-list', '--count', `HEAD..${remoteRef}`], { cwd: this.config.checkout })).stdout.trim() || 0);
      const ahead = Number((await execCapture('git', ['rev-list', '--count', `${remoteRef}..HEAD`], { cwd: this.config.checkout })).stdout.trim() || 0);
      const res = { ok: true, behind, ahead, remoteRef, localHead: localHead.slice(0, 7), remoteHead: remoteHead.slice(0, 7) };
      this._log('info', behind > 0
        ? this._m(`发现 ${behind} 个新提交（${res.localHead} → ${res.remoteHead}）`, `${behind} new commit(s) found (${res.localHead} → ${res.remoteHead})`)
        : this._m(`已是最新版本（${res.localHead}）`, `Already up to date (${res.localHead})`));
      return res;
    } catch (e) {
      this._log('error', this._m('检查更新失败: ', 'Update check failed: ') + String(e.stderr || e.message).trim());
      return { ok: false, reason: String(e.stderr || e.message).trim() };
    }
  }

  async _resolveRemoteRef() {
    const cwd = this.config.checkout;
    const candidates = [];
    try {
      candidates.push((await execCapture('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { cwd })).stdout.trim());
    } catch { /* branch may not have an upstream */ }
    try {
      candidates.push((await execCapture('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd })).stdout.trim());
    } catch { /* origin/HEAD may not be configured */ }
    try {
      const branch = (await execCapture('git', ['branch', '--show-current'], { cwd })).stdout.trim();
      if (branch) candidates.push(`origin/${branch}`);
    } catch { /* ignore */ }
    candidates.push('origin/master', 'origin/main');
    for (const ref of [...new Set(candidates.filter(Boolean))]) {
      try { await execCapture('git', ['rev-parse', '--verify', ref], { cwd }); return ref; } catch { /* try next */ }
    }
    return '';
  }

  _fileHash(p) {
    try { const s = fs.statSync(p); return `${s.size}:${s.mtimeMs}`; } catch { return null; }
  }

  _runLogged(cmdArgs, cwd, label = '') {
    return new Promise(resolve => {
      const [cmd, ...args] = cmdArgs;
      const child = spawn(cmd, args, { cwd, windowsHide: true, env: process.env });
      child.stdout.on('data', d => this._log('info', d.toString()));
      child.stderr.on('data', d => this._log('warn', d.toString()));
      child.on('error', e => this._log('error', e.message));
      child.on('exit', code => { if (label) this._log('info', this._m(`${label} 完成（code=${code}）`, `${label} finished (code=${code})`)); resolve(code); });
    });
  }

  async update() {
    if (this._state === 'updating') return { ok: false, reason: 'updating' };
    const prevLock = this._fileHash(path.join(this.config.checkout, 'pnpm-lock.yaml'));
    this.state = 'updating';
    this._log('info', this._m('正在获取并快进到上游最新版本…', 'Fetching and fast-forwarding to the latest upstream version…'));
    try {
      await execCapture('git', ['fetch', 'origin', '--prune'], { cwd: this.config.checkout });
      const remoteRef = await this._resolveRemoteRef();
      if (!remoteRef) throw new Error(this._m('未找到可用的远程跟踪分支', 'No remote tracking branch was found'));
      const r = await execCapture('git', ['merge', '--ff-only', remoteRef], { cwd: this.config.checkout });
      if (r.stdout) this._log('info', r.stdout.trim());
      if (r.stderr) this._log('warn', r.stderr.trim());
    } catch (e) {
      this._log('error', this._m('更新失败: ', 'Update failed: ') + String(e.stderr || e.message).trim());
      this.state = 'stopped';
      return { ok: false, reason: String(e.stderr || e.message).trim() };
    }
    const newLock = this._fileHash(path.join(this.config.checkout, 'pnpm-lock.yaml'));
    if (prevLock && newLock && prevLock !== newLock) {
      this._log('info', this._m('检测到依赖变化，正在安装依赖（pnpm install --frozen-lockfile）…', 'Dependencies changed; running pnpm install --frozen-lockfile…'));
      await this._runLogged(['cmd', '/c', 'pnpm', 'install', '--frozen-lockfile'], this.config.checkout, 'pnpm install');
    }
    const v = await this.versionInfo();
    this._log('info', this._m(`✅ 更新完成：版本 ${v.version} @ ${v.head}`, `✅ Update complete: version ${v.version} @ ${v.head}`));
    this.state = 'stopped';
    return { ok: true, version: v.version, head: v.head };
  }
}

module.exports = { Service, DEFAULT_CHECKOUT, DEFAULT_PORT, DEFAULT_URL, DEFAULT_REPO };
