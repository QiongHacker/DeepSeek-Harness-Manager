'use strict';

window.__errs = [];
window.addEventListener('error', e => window.__errs.push(String(e.message || e)));

const $ = s => document.querySelector(s);
const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });

const THEME_KEY = 'dsh-manager-theme';

function savedTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch { /* localStorage may be unavailable in restricted environments */ }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const els = {
  pill: $('#statusPill'), statusText: $('#statusText'),
  verText: $('#verText'), headText: $('#headText'), portText: $('#portText'), pathText: $('#pathText'),
  curVerText: $('#curVerText'), curHeadText: $('#curHeadText'), curPortText: $('#curPortText'),
  miniDot: $('#miniDot'), miniStatus: $('#miniStatus'),
  btnStart: $('#btnStart'), btnStop: $('#btnStop'),
  heroCard: $('#heroCard'), actionCard: $('#actionCard'),
  envDeployState: $('#envDeployState'), envPath: $('#envPath'), envWarn: $('#envWarn'),
  prereqGit: $('#prereqGit'), prereqNode: $('#prereqNode'), prereqPnpm: $('#prereqPnpm'),
  btnDeploy: $('#btnDeploy'), btnRedeploy: $('#btnRedeploy'), btnEnvCheck: $('#btnEnvCheck'),
  btnCheck: $('#btnCheck'), btnUpdate: $('#btnUpdate'), updateHint: $('#updateHint'),
  pathInput: $('#pathInput'), btnSavePath: $('#btnSavePath'), btnOpenDir: $('#btnOpenDir'),
  mirrorInput: $('#mirrorInput'), btnSaveMirror: $('#btnSaveMirror'),
  chkOpen: $('#chkOpen'), log: $('#log'), btnClear: $('#btnClear'), chkAutoScroll: $('#chkAutoScroll'),
  btnOpen: $('#btnOpen'), btnTheme: $('#btnTheme'), themeLabel: $('#themeLabel'), btnQuit: $('#btnQuit'), toast: $('#toast'),
  apiBound: $('#apiBound'), apiPathText: $('#apiPathText'), apiProvider: $('#apiProvider'),
  apiBaseUrl: $('#apiBaseUrl'), apiKey: $('#apiKey'), btnKeyToggle: $('#btnKeyToggle'),
  apiPlatformUrl: $('#apiPlatformUrl'), btnOpenPlatform: $('#btnOpenPlatform'),
  btnSaveApi: $('#btnSaveApi'), apiHint: $('#apiHint'),
  btnStatsRefresh: $('#btnStatsRefresh'),
  stTotalTokens: $('#stTotalTokens'), stHitRate: $('#stHitRate'), stCost: $('#stCost'), stLlmCalls: $('#stLlmCalls'),
  tokenBar: $('#tokenBar'), tokenLegend: $('#tokenLegend'),
  statsGrid: $('#statsGrid'), modelTableBody: $('#modelTableBody'), statsNote: $('#statsNote'),
  btnPluginsRefresh: $('#btnPluginsRefresh'), pluginSpec: $('#pluginSpec'),
  btnPluginInstall: $('#btnPluginInstall'), pluginList: $('#pluginList'),
  pluginCount: $('#pluginCount'), pluginNote: $('#pluginNote')
};

let busy = false;
let status = null;

function applyTheme(theme, persist = false) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  els.btnTheme.setAttribute('aria-pressed', String(next === 'dark'));
  els.btnTheme.title = next === 'dark' ? '切换到浅色模式' : '切换到深色模式';
  els.themeLabel.textContent = next === 'dark' ? '浅色模式' : '深色模式';
  if (persist) {
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  }
}

applyTheme(savedTheme());

const STYLE = {
  running: ['运行中', 'green'],
  'running-external': ['运行中 · 外部实例', 'green'],
  starting: ['启动中…', 'amber'],
  stopping: ['停止中…', 'amber'],
  updating: ['更新中…', 'amber'],
  deploying: ['部署中…', 'amber'],
  stopped: ['已停止', 'gray']
};

/* ---------- 菜单切换 ---------- */
function switchTab(name) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'stats') loadStats();
  if (name === 'plugins') loadPlugins();
}
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

/* ---------- 状态渲染 ---------- */
function setBusy(b) {
  busy = b;
  [els.btnStart, els.btnStop, els.btnCheck, els.btnUpdate, els.btnSavePath, els.btnDeploy, els.btnRedeploy, els.btnEnvCheck].forEach(x => { x.disabled = b; });
}

function renderPrereq(chipEl, ok) {
  chipEl.className = 'chip ' + (ok ? 'ok' : 'bad');
}

function renderStatus(s) {
  const wasRunning = status && (status.state === 'running' || status.state === 'running-external');
  status = s;
  const [txt, cls] = STYLE[s.state] || ['未知', 'gray'];

  const d = s.deploy || {};
  const deployed = !!d.deployed;
  const envOk = d.git && d.nodeOk && d.pnpm;

  // 环境与部署面板：始终展示
  els.envDeployState.textContent = deployed
    ? `已部署 · 版本 ${s.version || '—'} @ ${s.head || '—'}`
    : '未部署';
  els.envPath.textContent = d.checkout || '—';
  els.prereqGit.textContent = 'Git ' + (d.git ? '✓' : '✗');
  els.prereqNode.textContent = 'Node.js ' + (d.node ? (d.nodeOk ? '✓' : '✗') : '✗') + (d.node ? ' ' + d.nodeVersion : '');
  els.prereqPnpm.textContent = 'pnpm ' + (d.pnpm ? '✓' : '✗');
  renderPrereq(els.prereqGit, d.git);
  renderPrereq(els.prereqNode, d.node && d.nodeOk);
  renderPrereq(els.prereqPnpm, d.pnpm);

  // 部署按钮：未部署时显示“一键下载并部署”；已部署时显示“重新部署”
  els.btnDeploy.hidden = deployed;
  els.btnRedeploy.hidden = !deployed;

  // 提示信息
  let warn = '';
  if (!deployed) {
    warn = '尚未部署 Harness。点击「一键下载并部署」即可自动完成 下载 → 安装依赖 → 启动。首次部署需要联网；GitHub 下载失败会自动切换到国内镜像重试（可在「设置」中改镜像地址）。';
  } else if (!envOk) {
    const missing = [];
    if (!d.git) missing.push('Git');
    if (!d.node) missing.push('Node.js');
    else if (!d.nodeOk) missing.push('Node.js 版本过低（需 ^22.19.0 或 >=24）');
    if (!d.pnpm) missing.push('pnpm');
    warn = `⚠ 环境异常：缺少 ${missing.join('、')}，可能导致启动失败。请安装所需工具后点击「环境检查」，或点击「重新部署」。`;
  }
  els.envWarn.textContent = warn;
  els.envWarn.classList.toggle('hidden', !warn);
  els.envWarn.classList.toggle('warn', !!warn && deployed && !envOk);

  els.pill.className = 'pill ' + cls;
  els.statusText.textContent = txt;
  els.verText.textContent = s.version || '—';
  els.headText.textContent = s.head || '—';
  els.portText.textContent = s.port;
  els.pathText.textContent = s.checkout || '—';

  els.curVerText.textContent = s.version || '—';
  els.curHeadText.textContent = s.head || '—';
  els.curPortText.textContent = s.port;

  els.miniDot.className = 'dot ' + (cls === 'gray' ? 'gray' : cls);
  els.miniStatus.textContent = txt;

  const isRunning = s.state === 'running' || s.state === 'running-external';
  const deployedNow = !!(s.deploy || {}).deployed;
  els.btnStart.disabled = busy || isRunning || !deployedNow ||
    s.state === 'starting' || s.state === 'stopping' || s.state === 'updating' || s.state === 'deploying';
  els.btnStop.disabled = busy || (!isRunning && !s.inUse);
  if (!s.checkoutsOk && !wasRunning) toast('⚠ 未找到 Harness 目录，请检查路径设置', 'error');
}

/* ---------- 日志 ---------- */
function addLog(e) {
  const row = document.createElement('div');
  row.className = 'line ' + (e.level || 'info');
  const t = document.createElement('span'); t.className = 't'; t.textContent = e.time || '';
  const m = document.createElement('span'); m.className = 'm'; m.textContent = e.line || '';
  row.append(t, m);
  els.log.appendChild(row);
  while (els.log.childNodes.length > 1200) els.log.removeChild(els.log.firstChild);
  if (els.chkAutoScroll.checked) els.log.scrollTop = els.log.scrollHeight;
}

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg, type = 'info') {
  els.toast.textContent = msg;
  els.toast.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.className = 'toast'; }, 3500);
}

const PRESETS = {
  deepseek: { baseURL: 'https://api.deepseek.com', platform: 'https://platform.deepseek.com/api_keys' },
  custom: { baseURL: '', platform: '' }
};

function renderApiBinding(a) {
  if (!a) return;
  els.apiPathText.textContent = a.dshHome || '—';
  els.apiBound.textContent = a.bound ? '已绑定 ' + a.apiKeyMasked : '未绑定';
  els.apiBound.className = 'chip ' + (a.bound ? 'ok' : 'bad');
  if (!els.apiBaseUrl.value) els.apiBaseUrl.value = a.baseURL || '';
  if (!els.apiPlatformUrl.value) els.apiPlatformUrl.value = a.platformUrl || '';
  els.apiProvider.value = PRESETS[a.baseURL] && a.baseURL === PRESETS.deepseek.baseURL ? 'deepseek' : 'custom';
  if (a.bound && !els.apiKey.value) els.apiKey.placeholder = '已绑定 ' + a.apiKeyMasked;
}

async function refresh() {
  try { renderStatus(await window.dsh.getState()); } catch (e) { /* ignore */ }
}

async function init() {
  const cfg = await window.dsh.getConfig();
  els.pathInput.value = cfg.checkout;
  els.mirrorInput.value = cfg.deployMirrorUrl || '';
  els.chkOpen.checked = cfg.openAfterStart !== false;
  (await window.dsh.getLogs()).forEach(addLog);
  window.dsh.on('log', addLog);
  window.dsh.on('state', refresh);
  await refresh();
  setInterval(refresh, 3000);
  renderApiBinding(await window.dsh.getApiBinding());
}

/* ---------- Token 统计 ---------- */
const fmtNum = n => (Number(n) || 0).toLocaleString('zh-CN');
const fmtCompact = n => {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
};
const fmtUsd = n => '$' + (Number(n) || 0).toFixed(4);

const BAR_COLORS = [
  ['input', '#4176e6', '输入（未缓存）'],
  ['cacheRead', '#22c55e', '缓存命中'],
  ['cacheWrite', '#f59e0b', '缓存写入'],
  ['output', '#8b5cf6', '输出'],
  ['reasoning', '#ec4899', '推理']
];

async function loadStats(force) {
  try {
    els.statsNote.textContent = '统计计算中…';
    const s = await window.dsh.getStats({ force: !!force });
    if (!s || !s.ok) { els.statsNote.textContent = '统计读取失败：' + (s && s.error || ''); return; }
    const t = s.tokens || {};
    els.stTotalTokens.textContent = fmtCompact(s.totalTokens);
    els.stHitRate.textContent = (s.hitRate * 100).toFixed(1) + '%';
    els.stCost.textContent = fmtUsd(s.cost);
    els.stLlmCalls.textContent = fmtNum(s.llmCalls);

    // Token 构成条
    const parts = BAR_COLORS.map(([key, color, label]) => ({ key, color, label, v: t[key] || 0 }))
      .filter(p => p.v > 0);
    const total = parts.reduce((a, p) => a + p.v, 0) || 1;
    els.tokenBar.innerHTML = parts.map(p =>
      `<span class="bar-seg" style="width:${(p.v / total * 100).toFixed(2)}%;background:${p.color}" title="${p.label}: ${fmtNum(p.v)}"></span>`).join('');
    els.tokenLegend.innerHTML = parts.map(p =>
      `<span class="lg"><i style="background:${p.color}"></i>${p.label} <b>${fmtCompact(p.v)}</b> (${(p.v / total * 100).toFixed(1)}%)</span>`).join('');

    // 用量明细
    const rows = [
      ['会话数', fmtNum(s.sessions)], ['对话轮次', fmtNum(s.turns)], ['步骤数', fmtNum(s.steps)],
      ['用户消息', fmtNum(s.userMessages)], ['工具调用', fmtNum(s.toolCalls)], ['LLM 调用', fmtNum(s.llmCalls)],
      ['输入（未缓存）', fmtNum(t.input)], ['缓存命中', fmtNum(t.cacheRead)], ['缓存写入', fmtNum(t.cacheWrite)],
      ['输出', fmtNum(t.output)], ['推理', fmtNum(t.reasoning)], ['合计', fmtNum(s.totalTokens)]
    ];
    els.statsGrid.innerHTML = rows.map(([k, v]) => `<div class="sg-item"><span>${k}</span><b>${v}</b></div>`).join('');

    // 按模型
    els.modelTableBody.innerHTML = (s.models || []).map(m =>
      `<tr><td>${m.model}</td><td>${fmtNum(m.calls)}</td><td>${fmtCompact(m.tokens.input)}</td>` +
      `<td>${fmtCompact(m.tokens.cacheRead)}</td><td>${fmtCompact(m.tokens.cacheWrite)}</td>` +
      `<td>${fmtCompact(m.tokens.output + m.tokens.reasoning)}</td><td><b>${fmtCompact(m.totalTokens)}</b></td>` +
      `<td>${fmtUsd(m.cost)}</td></tr>`).join('') ||
      '<tr><td colspan="8" class="dim-cell">暂无数据</td></tr>';

    els.statsNote.textContent = `数据目录：${s.sessionsRoot} · 更新于 ${new Date(s.updatedAt).toLocaleTimeString('zh-CN', { hour12: false })} · 费用为按公开定价的估算值`;
  } catch (e) {
    els.statsNote.textContent = '统计读取失败：' + String(e);
  }
}

els.btnStatsRefresh.addEventListener('click', () => loadStats(true));
setInterval(() => {
  const active = document.querySelector('.tab-panel.active');
  if (active && active.id === 'tab-stats') loadStats();
}, 60000);

/* ---------- 插件管理 ---------- */
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function loadPlugins() {
  try {
    els.pluginNote.textContent = '加载中…';
    const r = await window.dsh.getPlugins();
    if (!r || !r.ok) { els.pluginNote.textContent = '读取失败'; return; }
    if (!r.initialized) {
      els.pluginList.innerHTML = '<div class="dim-cell" style="padding:12px">profile 尚未初始化，安装第一个插件时会自动创建</div>';
      els.pluginCount.textContent = '0';
      els.pluginNote.textContent = 'profile：' + r.profile + '（' + r.profileDir + '）';
      return;
    }
    const plugins = r.plugins || [];
    els.pluginCount.textContent = String(plugins.length);
    els.pluginList.innerHTML = plugins.map(p => `
      <div class="plugin-item">
        <div class="plugin-main">
          <div class="plugin-name">${escapeHtml(p.name)} ${p.bundle ? '<span class="badge">已启用</span>' : '<span class="badge dim-badge">普通依赖</span>'}${!p.isDependency ? '<span class="badge blue-badge">内置</span>' : ''}</div>
          <div class="plugin-desc">${escapeHtml(p.description || (p.version ? 'v' + p.version : '—'))}</div>
        </div>
        <div class="plugin-side">
          ${p.version ? '<span class="plugin-ver">v' + escapeHtml(p.version) + '</span>' : ''}
          ${p.isDependency ? `<button class="btn small danger ghost" data-uninstall="${escapeHtml(p.name)}">卸载</button>` : ''}
        </div>
      </div>`).join('') ||
      '<div class="dim-cell" style="padding:12px">暂无已安装的第三方插件</div>';
    els.pluginNote.textContent = 'profile：' + r.profile + ' · 目录：' + r.profileDir + ' · 卸载后需重启 Harness 生效';
  } catch (e) {
    els.pluginNote.textContent = '插件列表读取失败：' + String(e);
  }
}

els.btnPluginsRefresh.addEventListener('click', () => loadPlugins());

els.btnPluginInstall.addEventListener('click', async () => {
  const spec = els.pluginSpec.value.trim();
  if (!spec) { toast('请输入插件包名', 'error'); return; }
  if (!confirm(`将安装插件：${spec}\n\n安装过程需要联网，完成后需重启 Harness 生效，继续吗？`)) return;
  setBusy(true);
  addLog({ time: now(), level: 'info', line: '—— 用户点击：安装插件 ' + spec + ' ——' });
  const r = await window.dsh.pluginInstall(spec);
  setBusy(false);
  if (r.ok) {
    toast('✅ 插件安装完成，重启 Harness 后生效');
    els.pluginSpec.value = '';
    loadPlugins();
  } else if (r.reason === 'checkout-not-found') toast('⚠ 未部署 Harness，无法管理插件', 'error');
  else toast('安装失败，请查看日志', 'error');
});

els.pluginList.addEventListener('click', async e => {
  const btn = e.target.closest('[data-uninstall]');
  if (!btn) return;
  const name = btn.dataset.uninstall;
  if (!confirm(`确定卸载插件 ${name} 吗？卸载后需重启 Harness 生效。`)) return;
  setBusy(true);
  addLog({ time: now(), level: 'info', line: '—— 用户点击：卸载插件 ' + name + ' ——' });
  const r = await window.dsh.pluginUninstall(name);
  setBusy(false);
  if (r.ok) {
    toast('✅ 插件已卸载，重启 Harness 后生效');
    loadPlugins();
  } else if (r.reason === 'checkout-not-found') toast('⚠ 未部署 Harness，无法管理插件', 'error');
  else toast('卸载失败，请查看日志', 'error');
});

els.pluginSpec.addEventListener('keydown', e => { if (e.key === 'Enter') els.btnPluginInstall.click(); });

/* ---------- 事件绑定 ---------- */
els.btnStart.addEventListener('click', async () => {
  setBusy(true);
  addLog({ time: now(), level: 'info', line: '—— 用户点击：启动 ——' });
  const r = await window.dsh.start();
  setBusy(false);
  if (r.ok) {
    if (r.already) toast('Harness 已在运行');
    else if (els.chkOpen.checked) { toast('✅ 启动成功，正在打开网页…'); setTimeout(() => window.dsh.open(), 1500); }
    else toast('✅ 启动成功');
  } else if (r.reason === 'checkout-not-found') toast('⚠ 未找到 Harness 目录，请检查路径设置', 'error');
  else if (r.reason === 'missing-env') toast('⚠ 环境缺少必要工具，请查看「环境与部署」面板', 'error');
  else toast('启动失败，请查看日志', 'error');
  await refresh();
});

els.btnStop.addEventListener('click', async () => {
  const ext = status && status.state === 'running-external';
  if (ext && !confirm('检测到由外部启动的 Harness 实例，确定要终止它吗？')) return;
  setBusy(true);
  addLog({ time: now(), level: 'info', line: '—— 用户点击：停止 ——' });
  await window.dsh.stop();
  setBusy(false);
  toast('已停止');
  await refresh();
});

async function runDeploy(force) {
  const d = (status && status.deploy) || {};
  const missing = !d.git ? 'Git' : (!d.node ? 'Node.js' : (!d.pnpm ? 'pnpm' : null));
  if (missing) {
    const urls = {
      Git: 'https://git-scm.com/download/win',
      'Node.js': 'https://nodejs.org/zh-cn/download',
      pnpm: 'https://pnpm.io/zh-CN/installation'
    };
    toast(`缺少 ${missing}，正在打开下载页面…`, 'warn');
    window.dsh.openUrl(urls[missing]);
    return;
  }
  setBusy(true);
  addLog({ time: now(), level: 'info', line: '—— 用户点击：' + (force ? '重新部署' : '一键下载并部署') + ' ——' });
  const r = await window.dsh.deploy({ force });
  setBusy(false);
  if (r.ok) {
    toast('✅ 部署完成，正在启动…');
    const s2 = await window.dsh.start();
    if (s2.ok) {
      if (els.chkOpen.checked) { toast('✅ 部署完成，正在打开网页…'); setTimeout(() => window.dsh.open(), 1500); }
      else toast('✅ 部署完成，Harness 已启动');
    } else {
      toast('部署完成，但启动失败，请查看日志', 'error');
    }
  } else if (r.reason === 'dir-not-empty') toast('⚠ 部署目录非空且不是 Harness 仓库，请在设置中更换目录', 'error');
  else if (r.reason === 'clone-failed') toast('下载仓库失败，请检查网络后重试', 'error');
  else if (r.reason === 'install-failed') toast('依赖安装失败，请查看日志', 'error');
  else if (r.reason === 'already-deployed') toast('Harness 已存在');
  else toast('部署失败：' + (r.reason || '未知原因'), 'error');
  await refresh();
}

els.btnDeploy.addEventListener('click', () => runDeploy(false));

els.btnRedeploy.addEventListener('click', async () => {
  if (!confirm('重新部署将停止服务、删除现有目录并重新下载安装，确定继续吗？')) return;
  await runDeploy(true);
});

els.btnEnvCheck.addEventListener('click', async () => {
  setBusy(true);
  const d = await window.dsh.checkDeploy();
  setBusy(false);
  if (!d) { toast('环境检查失败', 'error'); return; }
  const missing = [];
  if (!d.git) missing.push('Git');
  if (!d.node) missing.push('Node.js');
  else if (!d.nodeOk) missing.push('Node.js 版本过低');
  if (!d.pnpm) missing.push('pnpm');
  if (!d.deployed) missing.push('Harness 未部署');
  toast(missing.length ? '环境检查：' + missing.join('、') : '✅ 环境检查通过', missing.length ? 'warn' : 'info');
  await refresh();
});

els.btnCheck.addEventListener('click', async () => {
  setBusy(true);
  els.updateHint.textContent = '正在检查…';
  const r = await window.dsh.checkUpdate();
  setBusy(false);
  if (r.ok) {
    if (r.behind > 0) {
      els.updateHint.textContent = `发现 ${r.behind} 个新提交（${r.localHead} → ${r.remoteHead}）`;
      els.btnUpdate.disabled = false;
      toast('发现新版本，可点击「立即更新」');
    } else {
      els.updateHint.textContent = `已是最新（${r.localHead}）`;
      els.btnUpdate.disabled = true;
      toast('✅ 已是最新版本');
    }
  } else {
    els.updateHint.textContent = '检查失败';
    toast('检查更新失败，请查看日志', 'error');
  }
});

els.btnUpdate.addEventListener('click', async () => {
  const wasRunning = status && (status.state === 'running' || status.state === 'running-external');
  setBusy(true);
  els.updateHint.textContent = '更新中…';
  const r = await window.dsh.runUpdate();
  setBusy(false);
  els.updateHint.textContent = '—';
  els.btnUpdate.disabled = true;
  if (r.ok) {
    if (wasRunning) {
      toast('更新完成，正在重启服务…');
      await window.dsh.stop();
      const s2 = await window.dsh.start();
      if (s2.ok) toast('✅ 更新并重启成功'); else toast('重启失败，请手动点击启动', 'error');
    } else {
      toast('✅ 更新完成');
    }
  } else {
    toast('更新失败，请查看日志', 'error');
  }
  await refresh();
});

els.btnSavePath.addEventListener('click', async () => {
  const p = els.pathInput.value.trim();
  if (!p) return;
  await window.dsh.setConfig({ checkout: p });
  toast('已保存路径：' + p);
  await refresh();
});

els.btnSaveMirror.addEventListener('click', async () => {
  const m = els.mirrorInput.value.trim();
  await window.dsh.setConfig({ deployMirrorUrl: m });
  toast(m ? '已保存下载镜像：' + m : '已清除下载镜像（将使用默认镜像）');
});

els.btnOpenDir.addEventListener('click', () => window.dsh.openCheckout());
els.btnOpen.addEventListener('click', () => window.dsh.open());
els.btnTheme.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
});
els.btnQuit.addEventListener('click', () => window.dsh.quit());
els.btnClear.addEventListener('click', () => { els.log.innerHTML = ''; });
els.pathInput.addEventListener('keydown', e => { if (e.key === 'Enter') els.btnSavePath.click(); });
els.chkOpen.addEventListener('change', () => window.dsh.setConfig({ openAfterStart: els.chkOpen.checked }));

/* ---------- API 绑定 ---------- */
els.apiProvider.addEventListener('change', () => {
  const p = PRESETS[els.apiProvider.value];
  if (p) {
    els.apiBaseUrl.value = p.baseURL;
    if (p.platform) els.apiPlatformUrl.value = p.platform;
  }
});

els.btnKeyToggle.addEventListener('click', () => {
  els.apiKey.type = els.apiKey.type === 'password' ? 'text' : 'password';
});

els.btnOpenPlatform.addEventListener('click', () => {
  const url = els.apiPlatformUrl.value.trim() || 'https://platform.deepseek.com/api_keys';
  window.dsh.openUrl(url);
  toast('正在打开 API 管理平台…');
});

els.btnSaveApi.addEventListener('click', async () => {
  const baseURL = els.apiBaseUrl.value.trim();
  const apiKey = els.apiKey.value.trim();
  const platformUrl = els.apiPlatformUrl.value.trim();
  if (!apiKey) { toast('⚠ 请填写 API Key', 'error'); return; }
  if (!baseURL) { toast('⚠ 请填写 Base URL', 'error'); return; }
  setBusy(true);
  const r = await window.dsh.saveApiBinding({ baseURL, apiKey, platformUrl });
  setBusy(false);
  if (r.ok) {
    toast('✅ API 已保存，立即生效');
    renderApiBinding(r);
  } else {
    toast('保存失败：' + (r.reason || '未知原因'), 'error');
  }
});

init();
