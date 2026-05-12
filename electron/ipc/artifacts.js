const fs = require('fs')
const path = require('path')
const { store } = require('../store')

function getShell(deps = {}) {
  if (deps.shell) return deps.shell
  try {
    return require('electron').shell
  } catch {
    return null
  }
}

function register(ipcMain, deps = {}) {
  ipcMain.handle('artifacts:list', async () => ({ ok: true, items: store.listArtifacts() }))
  ipcMain.handle('artifacts:delete', async (_event, payload = {}) => {
    const id = String(payload.id || '').trim()
    if (!id) throw new Error('invalid artifact id')
    const artifact = store.listArtifacts().find((item) => item.id === id)
    if (!artifact) return { ok: false, warning: 'Artifact not found.' }

    let deleteInfo = { status: 'record-only' }
    if (artifact.path) {
      try {
        const filePath = path.resolve(String(artifact.path))
        if (fs.existsSync(filePath)) {
          const shell = getShell(deps)
          if (shell?.trashItem) await shell.trashItem(filePath)
          else fs.unlinkSync(filePath)
          deleteInfo = { status: 'system-trash' }
        }
      } catch (error) {
        deleteInfo = { status: 'delete-failed', error: String(error.message || error) }
      }
    }

    store.deleteArtifact(id, deleteInfo)
    return {
      ok: true,
      artifact,
      warning: deleteInfo.status === 'delete-failed' ? `Artifact record removed but file deletion failed: ${deleteInfo.error}` : ''
    }
  })
}

module.exports = { register }
