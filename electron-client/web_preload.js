const { contextBridge, ipcRenderer } = require('electron');

/** Site (HTTPS) — API istekleri main process üzerinden imzalanır (mixed content yok) */
contextBridge.exposeInMainWorld('ilsaSignedFetch', (payload) =>
  ipcRenderer.invoke('signed-fetch', payload),
);

contextBridge.exposeInMainWorld('ilsaElectronShell', true);

contextBridge.exposeInMainWorld('ilsaOpenExternalUrl', (url) =>
  ipcRenderer.invoke('open-external-url', url),
);
