const { exportAuditEvents, listAuditEvents } = require('../security/auditLog')

function ok(data = {}) { return { ok: true, ...data } }
function fail(error) { return { ok: false, error: { code: error.code || 'IPC_ERROR', message: error.message || String(error) } } }

function register(ipcMain) {
  ipcMain.handle('audit:list', async (_event, payload = {}) => {
    try { return ok({ events: listAuditEvents(payload.filters || payload || {}) }) } catch (error) { return fail(error) }
  })
  ipcMain.handle('audit:export', async (_event, payload = {}) => {
    try { return ok({ export: exportAuditEvents(payload.filters || {}, { outputPath: payload.outputPath }) }) } catch (error) { return fail(error) }
  })
}

module.exports = { register }
