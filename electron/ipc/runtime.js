const { store } = require('../store')
const { sanitizeConfigPatch } = require('./config')

function ok(data = {}) { return { ok: true, ...data } }
function fail(error) { return { ok: false, error: { code: error.code || 'IPC_ERROR', message: error.message || String(error) } } }

async function runtimeStatus(config = store.getConfig()) {
  const deepseekConfigured = Boolean(config.deepseekApiKey || config.apiKey)
  const desktopConfigured = Boolean(
    config.desktopUseApiKey ||
    (config.desktopUseAllowBrowserFallback !== false && config.browserUseApiKey)
  )

  return [
    {
      runtime: 'deepseek',
      state: deepseekConfigured ? 'ready' : 'needs-configuration',
      configured: deepseekConfigured,
      endpoint: config.deepseekChatEndpoint || config.deepseekBaseUrl || config.baseUrl,
      model: config.deepseekPlannerModel || config.model
    },
    {
      runtime: 'browser-use',
      state: 'managed-by-supervisor',
      configured: Boolean(config.browserUseApiKey),
      endpoint: config.browserUseEndpoint,
      model: config.browserUseModel
    },
    {
      runtime: 'desktop-use',
      state: 'managed-by-supervisor',
      configured: desktopConfigured,
      endpoint: config.desktopUseEndpoint,
      model: config.desktopUseModel
    },
    {
      runtime: 'dry-run',
      state: config.dryRunEnabled === false ? 'disabled' : 'ready',
      configured: config.dryRunEnabled !== false
    }
  ]
}

async function bootstrapRuntime(runtime) {
  if (runtime === 'browser-use') {
    const browserUse = require('../services/browserUse')
    return browserUse.repair()
  }
  if (runtime === 'deepseek') {
    const config = store.getConfig()
    const configured = Boolean(config.deepseekApiKey || config.apiKey)
    return { runtime: 'deepseek', state: configured ? 'ready' : 'needs-configuration', configured }
  }
  if (runtime === 'desktop-use') return { runtime: 'desktop-use', state: 'managed-by-supervisor' }
  if (runtime === 'dry-run' || runtime === 'aionui-dry-run') return { runtime: 'dry-run', state: 'ready' }
  throw new Error(`Unsupported runtime ${runtime}`)
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
