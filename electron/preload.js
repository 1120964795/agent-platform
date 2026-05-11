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
    onChatStream: (callback) => {
      const listener = (_event, payload) => callback(payload)
      ipc.on('chat:stream', listener)
      return () => ipc.removeListener('chat:stream', listener)
    },
    selectFile: (options) => ipc.invoke('dialog:selectFile', options),
    selectDirectory: () => ipc.invoke('dialog:selectDirectory'),
    openPath: (filePath) => ipc.invoke('shell:openPath', filePath),
    openExternal: (url) => ipc.invoke('app:open-external', { url }),
    getPaths: () => ipc.invoke('app:getPaths'),
    runtime: {
      status: () => ipc.invoke('runtime:status'),
      configure: (payload) => ipc.invoke('runtime:configure', payload),
      bootstrap: (payload) => ipc.invoke('runtime:bootstrap', payload),
      start: (payload) => ipc.invoke('runtime:start', payload),
      stop: (payload) => ipc.invoke('runtime:stop', payload)
    },
    actions: {
      list: (payload) => ipc.invoke('actions:list', payload),
      approve: (payload) => ipc.invoke('actions:approve', payload),
      deny: (payload) => ipc.invoke('actions:deny', payload),
      cancel: (payload) => ipc.invoke('actions:cancel', payload),
      emergencyStop: (payload) => ipc.invoke('actions:emergencyStop', payload)
    },
    audit: {
      list: (payload) => ipc.invoke('audit:list', payload),
      export: (payload) => ipc.invoke('audit:export', payload)
    },
    outputs: {
      list: (payload) => ipc.invoke('outputs:list', payload),
      open: (payload) => ipc.invoke('outputs:open', payload),
      export: (payload) => ipc.invoke('outputs:export', payload)
    },
    agent: {
      runTurn: (payload) => ipc.invoke('agent:run-turn', payload),
      approveTool: (payload) => ipc.invoke('agent:approve-tool', payload),
      abort: (payload) => ipc.invoke('agent:abort', payload),
      onEvent: (handler) => {
        const wrapped = (_evt, payload) => handler(payload)
        ipc.on('agent:event', wrapped)
        return () => ipc.off('agent:event', wrapped)
      }
    }
  }
}

if (contextBridge && ipcRenderer) {
  contextBridge.exposeInMainWorld('electronAPI', createElectronAPI(ipcRenderer))
}

module.exports = { createElectronAPI }
