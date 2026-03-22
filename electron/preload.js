const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveJsonFile: (payload) => ipcRenderer.invoke('file:save-json', payload),
  openJsonFile: () => ipcRenderer.invoke('file:open-json'),
});
