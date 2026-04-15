let contextBridge
let ipcRenderer

try {
  const electron = require('electron')
  contextBridge = electron.contextBridge
  ipcRenderer = electron.ipcRenderer
} catch {
  contextBridge = null
  ipcRenderer = null
}

function createElectronAPI(ipc = ipcRenderer) {
  return {
    isElectron: true,
    invoke: (channel, payload) => ipc.invoke(channel, payload),
    on: (event, handler) => {
      const wrapped = (_evt, payload) => handler(payload)
      ipc.on(event, wrapped)
      return () => ipc.off(event, wrapped)
    },
    selectFile: (options) => ipc.invoke('dialog:selectFile', options),
    selectDirectory: () => ipc.invoke('dialog:selectDirectory'),
    openPath: (filePath) => ipc.invoke('shell:openPath', filePath),
    getPaths: () => ipc.invoke('app:getPaths')
  }
}

if (contextBridge && ipcRenderer) {
  contextBridge.exposeInMainWorld('electronAPI', createElectronAPI(ipcRenderer))
}

module.exports = { createElectronAPI }
