const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
  getPaths: () => ipcRenderer.invoke('get-paths')
})
