const fs = require('fs')
const { store } = require('../store')

function usernameFrom(payload = {}) {
  return typeof payload.username === 'string' ? payload.username : 'guest'
}

function register(ipcMain) {
  ipcMain.handle('artifacts:list', async (_event, payload = {}) => {
    const username = typeof payload === 'string' ? payload : usernameFrom(payload)
    return { ok: true, items: store.listArtifacts(username) }
  })

  ipcMain.handle('artifacts:delete', async (_event, payload = {}) => {
    const username = usernameFrom(payload)
    const artifact = store.getArtifact(payload.id, username)
    if (!artifact) return { ok: false, error: { code: 'NOT_FOUND', message: '产物不存在。' } }

    let fileDeleted = false
    if (payload.deleteFile !== false && artifact.path) {
      try {
        if (fs.existsSync(artifact.path)) {
          const stat = fs.statSync(artifact.path)
          if (!stat.isFile()) {
            return { ok: false, error: { code: 'NOT_FILE', message: '产物路径不是文件，已取消删除。' } }
          }
          fs.unlinkSync(artifact.path)
          fileDeleted = true
        }
      } catch (error) {
        return { ok: false, error: { code: 'DELETE_FAILED', message: error.message || '删除产物文件失败。' } }
      }
    }

    store.deleteArtifact(payload.id, username)
    return { ok: true, deleted: true, fileDeleted, artifact }
  })
}

module.exports = { register }
