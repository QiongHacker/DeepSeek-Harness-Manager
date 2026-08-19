'use strict';

const { app, BrowserWindow, ipcMain, shell, screen, dialog, protocol, net } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { Service, DEFAULT_URL } = require('./core/service');
const { sanitizeExternalUrl, sanitizeRendererConfigPatch, sanitizeStoredServiceConfig } = require('./core/security');

let win = null;
const rendererEntry = path.join(__dirname, 'renderer', 'index.html');
const rendererUrl = 'app://dsh-manager/renderer/index.html';
const rendererFiles = new Map([
  ['/renderer/index.html', rendererEntry],
  ['/renderer/renderer.js', path.join(__dirname, 'renderer', 'renderer.js')],
  ['/renderer/styles.css', path.join(__dirname, 'renderer', 'styles.css')],
  ['/renderer/logo.svg', path.join(__dirname, 'renderer', 'logo.svg')]
]);

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true }
}]);

function argValue(prefix) {
  const a = process.argv.find(x => x.startsWith(prefix + '='));
  return a ? a.slice(prefix.length + 1) : null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  const svc = new Service({ configPath: path.join(app.getPath('userData'), 'config.json'), appVersion: app.getVersion() });
  svc.bindBundledEnvironment(path.dirname(process.execPath));

  function launcherDirectory() {
    const candidates = app.isPackaged
      ? [path.dirname(process.execPath)]
      : [path.join(__dirname, 'dist', 'win-unpacked')];
    return candidates.find(candidate => fs.existsSync(path.join(candidate, 'DSH Manager.exe')) &&
      fs.existsSync(path.join(candidate, 'resources', 'app.asar'))) || '';
  }

  function scheduleCleanup(targets) {
    const suffix = `${process.pid}-${Date.now()}`;
    const taskPath = path.join(app.getPath('temp'), `dsh-manager-cleanup-${suffix}.json`);
    const scriptPath = path.join(app.getPath('temp'), `dsh-manager-cleanup-${suffix}.ps1`);
    fs.writeFileSync(taskPath, JSON.stringify({ parentPid: process.pid, targets }, null, 2));
    fs.writeFileSync(scriptPath, `param([Parameter(Mandatory=$true)][string]$TaskPath)\r\n` +
      `$ErrorActionPreference = 'SilentlyContinue'\r\n` +
      `$task = Get-Content -LiteralPath $TaskPath -Raw | ConvertFrom-Json\r\n` +
      `Wait-Process -Id ([int]$task.parentPid) -Timeout 30\r\n` +
      `Start-Sleep -Milliseconds 400\r\n` +
      `foreach ($target in $task.targets) { Remove-Item -LiteralPath ([string]$target) -Recurse -Force }\r\n` +
      `Remove-Item -LiteralPath $TaskPath -Force\r\n` +
      `Remove-Item -LiteralPath $PSCommandPath -Force\r\n`);
    const helper = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath, '-TaskPath', taskPath
    ], { detached: true, stdio: 'ignore', windowsHide: true });
    helper.unref();
  }

  function createWindow() {
    const { width: workWidth, height: workHeight } = screen.getPrimaryDisplay().workAreaSize;
    const minWidth = Math.min(680, workWidth);
    const minHeight = Math.min(520, workHeight);
    const requestedWidth = Number(argValue('--window-width'));
    const requestedHeight = Number(argValue('--window-height'));
    const width = Number.isFinite(requestedWidth) && requestedWidth > 0
      ? Math.min(workWidth, Math.max(minWidth, requestedWidth))
      : Math.min(1040, Math.max(minWidth, workWidth - 64));
    const height = Number.isFinite(requestedHeight) && requestedHeight > 0
      ? Math.min(workHeight, Math.max(minHeight, requestedHeight))
      : Math.min(760, Math.max(minHeight, workHeight - 64));
    win = new BrowserWindow({
      width,
      height,
      minWidth,
      minHeight,
      title: 'DSH Manager',
      backgroundColor: '#f5f7fc',
      icon: path.join(__dirname, 'build', 'icon.ico'),
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        devTools: !app.isPackaged
      }
    });
    win.setMenuBarVisibility(false);
    win.webContents.on('will-navigate', (event, url) => {
      if (url !== rendererUrl) event.preventDefault();
    });
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    if (process.argv.includes('--startup-probe')) {
      win.webContents.once('did-finish-load', () => {
        setTimeout(() => {
          app.exit(0);
        }, 150);
      });
    }
    win.loadURL(rendererUrl);
    const previewLanguage = argValue('--language');
    if (previewLanguage === 'zh-CN' || previewLanguage === 'en-US') {
      win.webContents.once('did-finish-load', () => {
        setTimeout(() => win.webContents.executeJavaScript(`window.applyLanguage?.(${JSON.stringify(previewLanguage)})`), 250);
      });
    }
    const previewTheme = argValue('--theme');
    if (previewTheme === 'light' || previewTheme === 'dark') {
      win.webContents.once('did-finish-load', () => {
        setTimeout(() => win.webContents.executeJavaScript(`window.applyTheme?.(${JSON.stringify(previewTheme)})`), 250);
      });
    }
    if (!process.argv.includes('--smoke') && !process.argv.includes('--startup-probe')) win.show();
  }

  // ---------- IPC ----------
  function isTrustedIpcEvent(event) {
    return Boolean(win && !win.isDestroyed() && event.sender === win.webContents &&
      event.senderFrame === win.webContents.mainFrame && event.senderFrame.url === rendererUrl);
  }

  function handle(channel, handler) {
    ipcMain.handle(channel, (event, ...args) => {
      if (!isTrustedIpcEvent(event)) throw new Error('Rejected untrusted IPC sender');
      return handler(...args);
    });
  }

  function openSafeExternal(url) {
    const safe = sanitizeExternalUrl(url);
    if (!safe) return { ok: false, reason: 'unsafe-url' };
    return shell.openExternal(safe).then(() => ({ ok: true })).catch(() => ({ ok: false, reason: 'open-failed' }));
  }

  handle('state:get', () => svc.getStatus());
  handle('service:start', () => svc.start());
  handle('service:stop', () => svc.stop());
  handle('deploy:run', opts => svc.deploy({ force: Boolean(opts && opts.force) }));
  handle('deploy:check', () => svc.checkDeploy({ force: true }));
  handle('checkout:bind', checkout => {
    const value = String(checkout || '');
    return value.length <= 32767 ? svc.bindCheckout(value) : { ok: false, reason: 'path-too-long' };
  });
  handle('checkout:choose', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: svc.config.language === 'en-US' ? 'Select an existing DeepSeek Harness folder' : '选择已有 DeepSeek Harness 目录',
      defaultPath: fs.existsSync(svc.config.checkout) ? svc.config.checkout : path.dirname(svc.config.checkout),
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true, reason: 'canceled' };
    return svc.bindCheckout(result.filePaths[0]);
  });
  handle('api:get', () => svc.getApiBinding());
  handle('api:save', opts => svc.saveApiBinding(opts || {}));
  handle('stats:get', opts => svc.getStats({ force: Boolean(opts && opts.force) }));
  handle('plugins:get', () => svc.getPlugins());
  handle('plugin:install', spec => svc.pluginInstall(spec));
  handle('plugin:uninstall', name => svc.pluginUninstall(name));
  handle('version:list', () => svc.listVersions());
  handle('version:switch', target => {
    const value = String(target || '');
    return value.length <= 256 ? svc.switchVersion(value) : { ok: false, reason: 'invalid-version' };
  });
  handle('version:rollback', () => svc.rollbackVersion());
  handle('config:get', () => sanitizeStoredServiceConfig(svc.config));
  handle('config:set', patch => {
    const safe = sanitizeRendererConfigPatch(patch);
    if (!safe.ok) return safe;
    svc.setConfig(safe.patch);
    return { ok: true, ...sanitizeStoredServiceConfig(svc.config) };
  });
  handle('migration:export', async () => {
    const date = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(win, {
      title: svc.config.language === 'en-US' ? 'Export a safe Harness environment package' : '导出安全的 Harness 环境迁移包',
      defaultPath: path.join(app.getPath('documents'), `DSH-Environment-${date}.zip`),
      filters: [{ name: 'ZIP archive', extensions: ['zip'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true, reason: 'canceled' };
    const output = result.filePath.toLowerCase().endsWith('.zip') ? result.filePath : `${result.filePath}.zip`;
    return svc.exportEnvironment(output);
  });
  handle('migration:exportLauncher', async () => {
    const source = launcherDirectory();
    if (!source) return { ok: false, reason: 'launcher-build-not-found' };
    const date = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(win, {
      title: svc.config.language === 'en-US' ? 'Export launcher with the portable Harness environment' : '连同启动器导出便携 Harness 环境',
      defaultPath: path.join(app.getPath('documents'), `DSH-Launcher-Environment-${date}.zip`),
      filters: [{ name: 'Ready-to-use ZIP', extensions: ['zip'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true, reason: 'canceled' };
    const output = result.filePath.toLowerCase().endsWith('.zip') ? result.filePath : `${result.filePath}.zip`;
    return svc.exportLauncherBundle(output, source);
  });
  handle('migration:import', async () => {
    const source = await dialog.showOpenDialog(win, {
      title: svc.config.language === 'en-US' ? 'Select a DSH migration package' : '选择 DSH 环境迁移包',
      properties: ['openFile'],
      filters: [{ name: 'DSH migration package', extensions: ['zip'] }]
    });
    if (source.canceled || !source.filePaths[0]) return { ok: false, canceled: true, reason: 'canceled' };
    const destination = await dialog.showOpenDialog(win, {
      title: svc.config.language === 'en-US' ? 'Select the destination parent folder' : '选择迁移环境的目标父目录',
      properties: ['openDirectory', 'createDirectory']
    });
    if (destination.canceled || !destination.filePaths[0]) return { ok: false, canceled: true, reason: 'canceled' };
    return svc.importEnvironment(source.filePaths[0], destination.filePaths[0], { installDependencies: true });
  });
  handle('maintenance:cleanUninstall', async options => {
    const removeDshHome = Boolean(options && options.removeDshHome);
    const removeCheckout = Boolean(options && options.removeCheckout);
    const preview = svc.prepareCleanup({ removeDshHome, removeCheckout, userDataPath: app.getPath('userData') });
    if (!preview.ok) return preview;
    const english = svc.config.language === 'en-US';
    const labels = { manager: english ? 'Manager settings and cache' : '管理器设置与缓存', 'dsh-home': english ? 'Harness user data (credentials and sessions)' : 'Harness 用户数据（凭据与会话）', checkout: english ? 'Bound Harness source checkout' : '已绑定的 Harness 源码目录' };
    const detail = preview.targets.map(item => `${labels[item.kind]}\n${item.path}`).join('\n\n');
    const confirmation = await dialog.showMessageBox(win, {
      type: 'warning',
      title: english ? 'Confirm clean removal' : '确认干净卸载',
      message: english ? 'The selected local data will be permanently deleted after the manager exits.' : '管理器退出后，将永久删除以下所选本地数据。',
      detail: `${detail}\n\n${english ? 'Portable application files are not deleted automatically. Delete the downloaded EXE or extracted application folder afterward.' : '便携版程序文件不会被自动删除。完成后请手动删除下载的 EXE 或解压后的程序目录。'}`,
      buttons: [english ? 'Cancel' : '取消', english ? 'Delete data and quit' : '删除数据并退出'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    if (confirmation.response !== 1) return { ok: false, canceled: true, reason: 'canceled' };
    await svc.stop();
    scheduleCleanup(preview.targets.map(item => item.path));
    setTimeout(() => app.quit(), 100);
    return { ok: true, quitting: true };
  });
  handle('logs:get', () => svc.getLogs());
  handle('app:open', () => shell.openExternal(DEFAULT_URL));
  handle('app:openUrl', url => openSafeExternal(url));
  handle('app:openCheckout', () => shell.openPath(svc.config.checkout));
  handle('app:quit', () => app.quit());

  // ---------- 服务事件推送到界面 ----------
  ['state', 'log', 'stats-progress'].forEach(ev => {
    svc.on(ev, (...args) => {
      if (win && !win.isDestroyed()) win.webContents.send(ev, ...args);
    });
  });
  svc.on('config', config => {
    if (win && !win.isDestroyed()) win.webContents.send('config', sanitizeStoredServiceConfig(config));
  });

  app.setAppUserModelId('com.dsh.manager');

  app.whenReady().then(() => {
    protocol.handle('app', request => {
      const url = new URL(request.url);
      if (request.method !== 'GET' || url.hostname !== 'dsh-manager' || url.search || url.hash) {
        return new Response('Not found', { status: 404 });
      }
      const filePath = rendererFiles.get(url.pathname);
      if (!filePath) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(filePath).href);
    });
    createWindow();
    app.on('second-instance', () => {
      if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    });
    if (process.argv.includes('--smoke')) {
      const outFile = argValue('--smoke-out') || path.join(app.getPath('temp'), 'dsh-smoke.json');
      setTimeout(async () => {
        const payload = { ok: true };
        try {
          payload.status = await svc.getStatus();
          payload.config = svc.config;
          payload.api = await svc.getApiBinding();
          payload.stats = await svc.getStats({ force: true });
          payload.plugins = await svc.getPlugins();
          payload.ui = await win.webContents.executeJavaScript(`({
            title: document.title,
            statusText: document.querySelector('#statusText')?.textContent,
            btnStart: !!document.querySelector('#btnStart'),
            btnStop: !!document.querySelector('#btnStop'),
            versionManager: Boolean(
              document.querySelector('#versionSelect') &&
              document.querySelector('#btnVersionRefresh') &&
              document.querySelector('#btnVersionSwitch') &&
              document.querySelector('#btnVersionRollback')
            ),
            logo: (() => { const i = document.querySelector('.logo img'); return i ? { loaded: i.complete && i.naturalWidth > 0, w: i.naturalWidth } : null })(),
            navItems: document.querySelectorAll('.nav-item').length,
            tabPanels: document.querySelectorAll('.tab-panel').length,
            switchOk: (() => {
              const b = document.querySelector('.nav-item[data-tab="logs"]');
              b.click();
              const ok = document.querySelector('#tab-logs').classList.contains('active') &&
                         !document.querySelector('#tab-overview').classList.contains('active');
              document.querySelector('.nav-item[data-tab="overview"]').click();
              return ok;
            })(),
            colors: {
              sidebar: getComputedStyle(document.querySelector('.sidebar')).backgroundColor,
              content: getComputedStyle(document.querySelector('.content')).backgroundColor,
              primaryBtn: getComputedStyle(document.querySelector('#btnStart')).backgroundColor
            },
            theme: (() => {
              const button = document.querySelector('#btnTheme');
              const before = document.documentElement.dataset.theme;
              button?.click();
              const after = document.documentElement.dataset.theme;
              button?.click();
              return { button: !!button, before, after, restored: document.documentElement.dataset.theme === before };
            })(),
            language: (() => {
              const button = document.querySelector('#btnLanguage');
              const before = document.documentElement.lang;
              button?.click();
              const after = document.documentElement.lang;
              const translatedTitle = document.querySelector('#tab-overview h2')?.textContent;
              button?.click();
              return { button: !!button, before, after, translatedTitle, restored: document.documentElement.lang === before };
            })(),
            responsive: (() => {
              const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
              const indicator = document.querySelector('.mini-status').getBoundingClientRect();
              return {
                viewport: { width: innerWidth, height: innerHeight },
                sidebarWidth: Math.round(sidebar.width),
                compact: getComputedStyle(document.querySelector('.nav-label')).display === 'none',
                indicator: { x: Math.round(indicator.x), width: Math.round(indicator.width), height: Math.round(indicator.height) }
              };
            })(),
            envPanel: !!document.querySelector('#envPanel'),
            bindExisting: !!document.querySelector('#btnBindExisting'),
            chooseCheckout: !!document.querySelector('#btnChoosePath'),
            statsTab: !!document.querySelector('#tab-stats'),
            statsProgress: (() => {
              const node = document.querySelector('#statsProgress');
              const fill = document.querySelector('#statsProgressFill');
              return {
                exists: Boolean(
                  node &&
                    fill &&
                    document.querySelector('#statsProgressText') &&
                    document.querySelector('#statsProgressPercent')
                ),
                role: node?.getAttribute('role') || '',
                min: node?.getAttribute('aria-valuemin') || '',
                max: node?.getAttribute('aria-valuemax') || '',
                hidden: Boolean(node?.hidden),
                fillTransition: fill ? getComputedStyle(fill).transitionProperty : ''
              };
            })(),
            statsTimeline: Boolean(
              document.querySelector('#usageTimeline') &&
                document.querySelector('#timelineRange') &&
                document.querySelector('[data-i18n="stats.detailsSubtitle"]') &&
                document.querySelectorAll('[data-timeline-period]').length === 3
            ),
            statsNav: document.querySelectorAll('.nav-item[data-tab="stats"]').length,
            maintenance: Boolean(
              document.querySelector('#btnExportEnvironment') &&
                document.querySelector('#btnExportLauncher') &&
                document.querySelector('#btnImportEnvironment') &&
                document.querySelector('#btnCleanUninstall') &&
                document.querySelector('#chkRemoveDshHome') &&
                document.querySelector('#chkRemoveCheckout')
            ),
            envState: document.querySelector('#envDeployState')?.textContent,
            redeployVisible: !document.querySelector('#btnRedeploy').hidden,
            chips: document.querySelectorAll('.chip').length,
            logLines: document.querySelectorAll('#log .line').length,
            errs: window.__errs || []
          })`);
        } catch (e) {
          payload.ok = false;
          payload.err = String(e);
        }
        try { fs.writeFileSync(outFile, JSON.stringify(payload, null, 2)); } catch (e) { payload.writeErr = String(e); }
        console.log('SMOKE ' + JSON.stringify(payload));
        app.quit();
      }, 6000);
    }
    if (process.argv.includes('--capture')) {
      const capFile = argValue('--capture-out') || path.join(app.getPath('temp'), 'dsh-capture.png');
      win.webContents.once('did-finish-load', () => {
        setTimeout(async () => {
          try {
            const captureTab = argValue('--capture-tab');
            if (captureTab && /^[a-z-]{1,32}$/.test(captureTab)) {
              await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(`.nav-item[data-tab="${captureTab}"]`)})?.click()`);
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            const image = await win.webContents.capturePage();
            fs.writeFileSync(capFile, image.toPNG());
            console.log('CAPTURE OK ' + capFile);
          } catch (e) { console.error('CAPTURE FAIL ' + e); }
          app.quit();
        }, 2000);
      });
    }
  });

  app.on('window-all-closed', () => app.quit());
}
