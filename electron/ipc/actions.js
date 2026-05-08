const { createActionBroker } = require('../security/actionBroker')
const { createOpenInterpreterAdapter } = require('../services/openInterpreter/adapter')
const { createUiTarsAdapter } = require('../services/uiTars/adapter')
const { createDryRunAdapter } = require('../services/dryRunRuntime')

function ok(data = {}) { return { ok: true, ...data } }
function fail(error) { return { ok: false, error: { code: error.code || 'IPC_ERROR', message: error.message || String(error) } } }

const broker = createActionBroker()
broker.registerAdapter('open-interpreter', createOpenInterpreterAdapter())
broker.registerAdapter('ui-tars', createUiTarsAdapter())
broker.registerAdapter('aionui-dry-run', createDryRunAdapter())

function getBroker() {
  return broker
}

function register(ipcMain) {
  ipcMain.handle('actions:list', async (_event, payload = {}) => {
    try { return ok({ actions: broker.listActions(payload) }) } catch (error) { return fail(error) }
  })
  ipcMain.handle('actions:submit', async (_event, payload = {}) => {
    try { return ok({ actions: await broker.submitActions(payload.actions || [], payload.options || {}) }) } catch (error) { return fail(error) }
  })
  ipcMain.handle('actions:approve', async (_event, payload = {}) => {
    try { return ok({ action: await broker.approveAction(payload.id) }) } catch (error) { return fail(error) }
  })
  ipcMain.handle('actions:deny', async (_event, payload = {}) => {
    try { return ok({ action: broker.denyAction(payload.id, payload.reason) }) } catch (error) { return fail(error) }
  })
  ipcMain.handle('actions:cancel', async (_event, payload = {}) => {
    try { return ok({ action: broker.cancelAction(payload.id, payload.reason) }) } catch (error) { return fail(error) }
  })
  ipcMain.handle('actions:cancelSession', async (_event, payload = {}) => {
    try { return ok({ actions: broker.cancelSession(payload.sessionId, payload.reason) }) } catch (error) { return fail(error) }
  })
  ipcMain.handle('actions:emergencyStop', async (_event, payload = {}) => {
    try { return ok({ actions: broker.emergencyStop(payload.reason) }) } catch (error) { return fail(error) }
  })
}

module.exports = { getBroker, register }
