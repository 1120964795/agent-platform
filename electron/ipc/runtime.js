const { store } = require('../store')
const { sanitizeConfigPatch } = require('./config')
const qwenProvider = require('../services/models/qwenProvider')
const deepseekProvider = require('../services/models/deepseekProvider')
const oiBootstrap = require('../services/openInterpreter/bootstrap')
const oiProcess = require('../services/openInterpreter/processManager')
const tarsBootstrap = require('../services/uiTars/bootstrap')
const tarsProcess = require('../services/uiTars/processManager')

function ok(data = {}) { return { ok: true, ...data } }
function fail(error) { return { ok: false, error: { code: error.code || 'IPC_ERROR', message: error.message || String(error) } } }

async function runtimeStatus(config = store.getConfig()) {
  return [
    { runtime: 'qwen', state: qwenProvider.getStatus(config).configured ? 'ready' : 'needs-configuration', ...qwenProvider.getStatus(config) },
    { runtime: 'deepseek', state: deepseekProvider.getStatus(config).configured ? 'ready' : 'not-configured', ...deepseekProvider.getStatus(config) },
    await oiProcess.status(config),
    await tarsProcess.status(config),
    { runtime: 'aionui-dry-run', state: config.dryRunEnabled === false ? 'disabled' : 'ready', configured: true }
  ]
}

async function bootstrapRuntime(runtime, config = store.getConfig()) {
  if (runtime === 'open-interpreter') return oiBootstrap.repair(config)
  if (runtime === 'ui-tars') return tarsBootstrap.repair(config)
  if (runtime === 'qwen') return qwenProvider.getStatus(config)
  if (runtime === 'deepseek') return deepseekProvider.getStatus(config)
  if (runtime === 'aionui-dry-run') return { runtime, state: config.dryRunEnabled === false ? 'disabled' : 'ready' }
  throw new Error(`未知运行时：${runtime}`)
}

function register(ipcMain) {
  ipcMain.handle('runtime:status', async () => {
    try { return ok({ runtimes: await runtimeStatus() }) } catch (error) { return fail(error) }
  })
  ipcMain.handle('runtime:configure', async (_event, payload = {}) => {
    try {
      store.setConfig(sanitizeConfigPatch(payload))
      return ok({ config: store.getMaskedConfig() })
    } catch (error) { return fail(error) }
  })
  ipcMain.handle('runtime:bootstrap', async (_event, payload = {}) => {
    try { return ok({ runtime: await bootstrapRuntime(payload.runtime) }) } catch (error) { return fail(error) }
  })
  ipcMain.handle('runtime:start', async (_event, payload = {}) => {
    try {
      if (payload.runtime === 'open-interpreter') return ok({ runtime: await oiProcess.start() })
      if (payload.runtime === 'ui-tars') return ok({ runtime: await tarsProcess.start() })
      return ok({ runtime: await bootstrapRuntime(payload.runtime) })
    } catch (error) { return fail(error) }
  })
  ipcMain.handle('runtime:stop', async (_event, payload = {}) => {
    try {
      if (payload.runtime === 'open-interpreter') return ok({ runtime: await oiProcess.stop() })
      if (payload.runtime === 'ui-tars') return ok({ runtime: await tarsProcess.stop() })
      return ok({ runtime: { runtime: payload.runtime, running: false } })
    } catch (error) { return fail(error) }
  })
}

module.exports = { bootstrapRuntime, register, runtimeStatus }
