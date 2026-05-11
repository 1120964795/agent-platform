const { store } = require('../store')
const { sanitizeConfigPatch } = require('./config')
const deepseek = require('../services/deepseek')

function ok(data = {}) { return { ok: true, ...data } }
function fail(error) { return { ok: false, error: { code: error.code || 'IPC_ERROR', message: error.message || String(error) } } }

async function runtimeStatus(config = store.getConfig()) {
  return [
    { runtime: 'deepseek', state: Boolean(config.deepseekApiKey || config.apiKey) ? 'ready' : 'not-configured', configured: Boolean(config.deepseekApiKey || config.apiKey) },
    { runtime: 'browser-use', state: 'managed-by-supervisor', configured: Boolean(config.browserUseApiKey) },
    { runtime: 'ui-tars', state: 'managed-by-supervisor', configured: true },
    { runtime: 'aionui-dry-run', state: config.dryRunEnabled === false ? 'disabled' : 'ready', configured: true }
  ]
}

async function bootstrapRuntime(runtime, config = store.getConfig()) {
  if (runtime === 'deepseek') return { runtime, state: Boolean(config.deepseekApiKey || config.apiKey) ? 'ready' : 'not-configured', configured: Boolean(config.deepseekApiKey || config.apiKey) }
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
      return ok({ runtime: await bootstrapRuntime(payload.runtime) })
    } catch (error) { return fail(error) }
  })
  ipcMain.handle('runtime:stop', async (_event, payload = {}) => {
    try {
      return ok({ runtime: { runtime: payload.runtime, running: false } })
    } catch (error) { return fail(error) }
  })
}

module.exports = { bootstrapRuntime, register, runtimeStatus }
