const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('regionSelection', {
  submit(payload) {
    ipcRenderer.send(`diagnostics:region-selection:submit:${payload?.requestId}`, payload)
  },
  cancel() {
    const requestId = window.__regionRequestId || ''
    ipcRenderer.send(`diagnostics:region-selection:cancel:${requestId}`, { requestId })
  }
})
