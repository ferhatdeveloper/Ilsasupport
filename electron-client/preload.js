const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ilsaDesktop', {
  getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getUpdateInfo: () => ipcRenderer.invoke('get-update-info'),
  checkAppUpdate: () => ipcRenderer.invoke('check-app-update'),
  openDownloadUrl: () => ipcRenderer.invoke('open-download-url'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  getRememberPrefill: () => ipcRenderer.invoke('get-remember-prefill'),
  signin: (credentials) => ipcRenderer.invoke('signin', credentials),
  signup: (userInfo) => ipcRenderer.invoke('signup', userInfo),
  continueInApp: () => ipcRenderer.invoke('continue-in-app'),
  continueInBrowser: () => ipcRenderer.invoke('continue-in-browser'),
  onOptionalUpdate: (callback) => {
    ipcRenderer.on('optional-update', (_event, payload) => callback(payload));
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (_event, payload) => callback(payload));
  },
});
