'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const EVENT_CHANNELS = new Set(['state', 'log', 'config', 'stats-progress']);

contextBridge.exposeInMainWorld('dsh', {
  getState: () => ipcRenderer.invoke('state:get'),
  start: () => ipcRenderer.invoke('service:start'),
  stop: () => ipcRenderer.invoke('service:stop'),
  deploy: opts => ipcRenderer.invoke('deploy:run', opts || {}),
  checkDeploy: () => ipcRenderer.invoke('deploy:check'),
  bindCheckout: checkout => ipcRenderer.invoke('checkout:bind', checkout),
  chooseCheckout: () => ipcRenderer.invoke('checkout:choose'),
  getApiBinding: () => ipcRenderer.invoke('api:get'),
  saveApiBinding: opts => ipcRenderer.invoke('api:save', opts || {}),
  getStats: opts => ipcRenderer.invoke('stats:get', opts || {}),
  getPlugins: () => ipcRenderer.invoke('plugins:get'),
  pluginInstall: spec => ipcRenderer.invoke('plugin:install', spec),
  pluginUninstall: name => ipcRenderer.invoke('plugin:uninstall', name),
  listVersions: () => ipcRenderer.invoke('version:list'),
  switchVersion: target => ipcRenderer.invoke('version:switch', target),
  rollbackVersion: () => ipcRenderer.invoke('version:rollback'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: p => ipcRenderer.invoke('config:set', p),
  exportEnvironment: () => ipcRenderer.invoke('migration:export'),
  exportLauncherEnvironment: () => ipcRenderer.invoke('migration:exportLauncher'),
  importEnvironment: () => ipcRenderer.invoke('migration:import'),
  cleanUninstall: options => ipcRenderer.invoke('maintenance:cleanUninstall', options || {}),
  getLogs: () => ipcRenderer.invoke('logs:get'),
  open: () => ipcRenderer.invoke('app:open'),
  openUrl: url => ipcRenderer.invoke('app:openUrl', url),
  openCheckout: () => ipcRenderer.invoke('app:openCheckout'),
  quit: () => ipcRenderer.invoke('app:quit'),
  on: (ch, cb) => {
    if (!EVENT_CHANNELS.has(ch) || typeof cb !== 'function') return;
    ipcRenderer.on(ch, (_event, ...args) => cb(...args));
  }
});
