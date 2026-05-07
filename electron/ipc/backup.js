const backupService = require('../backup/backupService')

function ok(payload = {}) {
  return { ok: true, ...payload }
}

function fail(error) {
  return { ok: false, error: { code: error.code || 'BACKUP_ERROR', message: error.message || String(error) } }
}

function wrap(fn) {
  return async (_event, payload = {}) => {
    try {
      return ok(await fn(payload))
    } catch (error) {
      return fail(error)
    }
  }
}

function register(ipcMain) {
  ipcMain.handle('backup:export', wrap((payload) => backupService.exportBackup(payload)))
  ipcMain.handle('backup:preview', wrap((payload) => backupService.previewBackup(payload.packagePath)))
  ipcMain.handle('backup:restore', wrap((payload) => backupService.restoreBackup(payload.packagePath, payload.options || payload)))
}

module.exports = { register }
