const { exportRunOutputs, listRunOutputs } = require('../services/runOutputs')

function ok(data = {}) { return { ok: true, ...data } }
function fail(error) { return { ok: false, error: { code: error.code || 'IPC_ERROR', message: error.message || String(error) } } }

function register(ipcMain, deps = {}) {
  ipcMain.handle('outputs:list', async (_event, payload = {}) => {
    try { return ok({ outputs: listRunOutputs(payload.filters || payload || {}) }) } catch (error) { return fail(error) }
  })
  ipcMain.handle('outputs:open', async (_event, payload = {}) => {
    try {
      if (!payload.path) throw new Error('需要提供输出路径。')
      const result = await deps.shell?.openPath?.(payload.path)
      return ok({ result: result || '' })
    } catch (error) { return fail(error) }
  })
  ipcMain.handle('outputs:export', async (_event, payload = {}) => {
    try { return ok({ export: exportRunOutputs(payload.filters || {}, { outputPath: payload.outputPath }) }) } catch (error) { return fail(error) }
  })
}

module.exports = { register }
