const { contextBridge, ipcRenderer } = require('electron');

// Güvenli API bridge
contextBridge.exposeInMainWorld('electronAPI', {
  // Sistem bilgileri
  getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
  
  // Auth işlemleri
  signin: (credentials) => ipcRenderer.invoke('signin', credentials),
  signup: (userInfo) => ipcRenderer.invoke('signup', userInfo),
  
  // Uzaktan destek
  openSupportWindow: () => ipcRenderer.invoke('open-support-window'),
  getSupportId: () => ipcRenderer.invoke('get-support-id'),
  sendSupportMessage: (message) => ipcRenderer.invoke('send-support-message', message),
  closeSupport: () => ipcRenderer.invoke('close-support'),
  
  // Event listeners
  onSupportMessage: (callback) => {
    ipcRenderer.on('support-message', (event, data) => callback(data));
  },
  onSupportGranted: (callback) => {
    ipcRenderer.on('support-granted', (event, data) => callback(data));
  },
  onSupportError: (callback) => {
    ipcRenderer.on('support-error', (event, error) => callback(error));
  },
  
  // Cleanup
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

console.log('Preload script yüklendi');
