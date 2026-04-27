const { store } = require('../store')

function register(ipcMain) {
  ipcMain.handle('artifacts:list', async (_event, payload = {}) => {
    const username = typeof payload === 'string' ? payload : payload.username
    return { ok: true, items: store.listArtifacts(username) }
  })
}

module.exports = { register }
