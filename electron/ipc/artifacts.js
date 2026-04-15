const { store } = require('../store')

function register(ipcMain) {
  ipcMain.handle('artifacts:list', async () => ({ ok: true, items: store.listArtifacts() }))
}

module.exports = { register }
