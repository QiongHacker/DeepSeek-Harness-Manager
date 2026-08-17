'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dsh', {
  getState: () => ipcRenderer.invoke('state:get'),
  start: () => ipcRenderer.invoke('service:start'),
  stop: () => ipcRenderer.invoke('service:stop'),
  deploy: opts => ipcRenderer.invoke('deploy:run', opts || {}),
  checkDeploy: () => ipcRenderer.invoke('deploy:check'),
  getApiBinding: () => ipcRenderer.invoke('api:get'),
  saveApiBinding: opts => ipcRenderer.invoke('api:save', opts || {}),
  getStats: opts => ipcRenderer.invoke('stats:get', opts || {}),
  getPlugins: () => ipcRenderer.invoke('plugins:get'),
  pluginInstall: spec => ipcRenderer.invoke('plugin:install', spec),
  pluginUninstall: name => ipcRenderer.invoke('plugin:uninstall', name),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  runUpdate: () => ipcRenderer.invoke('update:run'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: p => ipcRenderer.invoke('config:set', p),
  getLogs: () => ipcRenderer.invoke('logs:get'),
  open: () => ipcRenderer.invoke('app:open'),
  openUrl: url => ipcRenderer.invoke('app:openUrl', url),
  openCheckout: () => ipcRenderer.invoke('app:openCheckout'),
  quit: () => ipcRenderer.invoke('app:quit'),
  on: (ch, cb) => { ipcRenderer.on(ch, (_e, ...args) => cb(...args)); }
});
