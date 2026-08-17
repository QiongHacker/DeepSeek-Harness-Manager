'use strict';

const { app, BrowserWindow, ipcMain, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { Service, DEFAULT_URL } = require('./core/service');

let win = null;

function argValue(prefix) {
  const a = process.argv.find(x => x.startsWith(prefix + '='));
  return a ? a.slice(prefix.length + 1) : null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  const svc = new Service({ configPath: path.join(app.getPath('userData'), 'config.json') });

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
      backgroundColor: '#f3f3f3',
      icon: path.join(__dirname, 'build', 'icon.ico'),
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    win.setMenuBarVisibility(false);
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    if (!process.argv.includes('--smoke')) win.show();
  }

  // ---------- IPC ----------
  ipcMain.handle('state:get', () => svc.getStatus());
  ipcMain.handle('service:start', () => svc.start());
  ipcMain.handle('service:stop', () => svc.stop());
  ipcMain.handle('deploy:run', (_e, opts) => svc.deploy(opts || {}));
  ipcMain.handle('deploy:check', () => svc.checkDeploy());
  ipcMain.handle('api:get', () => svc.getApiBinding());
  ipcMain.handle('api:save', (_e, opts) => svc.saveApiBinding(opts || {}));
  ipcMain.handle('stats:get', (_e, opts) => svc.getStats(opts || {}));
  ipcMain.handle('plugins:get', () => svc.getPlugins());
  ipcMain.handle('plugin:install', (_e, spec) => svc.pluginInstall(spec));
  ipcMain.handle('plugin:uninstall', (_e, name) => svc.pluginUninstall(name));
  ipcMain.handle('update:check', () => svc.checkUpdate());
  ipcMain.handle('update:run', () => svc.update());
  ipcMain.handle('config:get', () => svc.config);
  ipcMain.handle('config:set', (_e, patch) => { svc.setConfig(patch || {}); return svc.config; });
  ipcMain.handle('logs:get', () => svc.getLogs());
  ipcMain.handle('app:open', () => shell.openExternal(DEFAULT_URL));
  ipcMain.handle('app:openUrl', (_e, url) => { if (url) shell.openExternal(String(url)); });
  ipcMain.handle('app:openCheckout', () => shell.openPath(svc.config.checkout));
  ipcMain.handle('app:quit', () => app.quit());

  // ---------- 服务事件推送到界面 ----------
  ['state', 'log', 'config'].forEach(ev => {
    svc.on(ev, (...args) => {
      if (win && !win.isDestroyed()) win.webContents.send(ev, ...args);
    });
  });

  app.setAppUserModelId('com.dsh.manager');

  app.whenReady().then(() => {
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
            btnCheck: !!document.querySelector('#btnCheck'),
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
            statsTab: !!document.querySelector('#tab-stats'),
            statsNav: document.querySelectorAll('.nav-item[data-tab="stats"]').length,
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
