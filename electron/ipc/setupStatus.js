const { store } = require('../store')

let pythonBootstrap, supervisor
function setBridgeContext(ctx) {
  pythonBootstrap = ctx.pythonBootstrap
  supervisor = ctx.supervisor
}

const KEY_FIELD_MAP = {
  deepseekKey: 'deepseekApiKey',
  browserUseKey: 'browserUseApiKey',
  desktopUseKey: 'desktopUseApiKey'
}

async function computeSetupStatus({ storeRef = store } = {}) {
  const cfg = storeRef.getConfig()
  const desktopUseKey = Boolean(
    cfg.desktopUseApiKey ||
    (cfg.desktopUseAllowBrowserFallback !== false && cfg.browserUseApiKey)
  )
  const deps = {
    deepseekKey: Boolean(cfg.deepseekApiKey || cfg.apiKey),
    browserUseKey: Boolean(cfg.browserUseApiKey),
    desktopUseKey,
  }

  try {
    if (typeof pythonBootstrap !== 'undefined' && pythonBootstrap) {
      const pyResult = await pythonBootstrap.detect()
      deps.python = pyResult.available
      deps.browserUse = pyResult.browserUseInstalled
      deps.playwright = pyResult.playwrightInstalled
    }
  } catch {
    deps.python = false
  }

  try {
    if (typeof supervisor !== 'undefined' && supervisor) {
      const bridgeState = supervisor.getState()
      deps.bridgesRunning = Object.values(bridgeState).every(b => b.state === 'running')
    }
  } catch {
    deps.bridgesRunning = false
  }

  const browserReady = deps.deepseekKey && deps.browserUseKey && deps.python !== false
  const desktopReady = deps.deepseekKey && deps.desktopUseKey

  const tiers = {
    lite: {
      label: 'Lite: chat only',
      requires: ['deepseekKey'],
      ready: deps.deepseekKey
    },
    browser: {
      label: 'Browser automation',
      requires: ['deepseekKey', 'browserUseKey'],
      ready: browserReady,
      recommended: true
    },
    desktop: {
      label: 'Desktop automation',
      requires: ['deepseekKey', 'desktopUseKey'],
      ready: desktopReady
    }
  }

  return {
    deps,
    tiers,
    helpLinks: {
      deepseekKey: 'https://platform.deepseek.com/api_keys',
      browserUseKey: 'https://zenmux.ai/',
      desktopUseKey: 'https://zenmux.ai/',
    }
  }
}

function register(ipcMain) {
  ipcMain.handle('setup:status', async () => computeSetupStatus())
  ipcMain.handle('setup:get-welcome-shown', () => Boolean(store.getConfig().welcomeShown))
  ipcMain.handle('setup:mark-welcome-shown', () => {
    store.setConfig({ welcomeShown: true })
    return true
  })
  ipcMain.handle('setup:set-key', (_evt, { dep, value } = {}) => {
    const field = KEY_FIELD_MAP[dep]
    if (!field) throw new Error(`Unknown dep ${dep}`)
    if (typeof value !== 'string' || value.length > 4096) throw new Error('invalid key')
    store.setConfig({ [field]: value.trim() })
    return { ok: true }
  })
}

module.exports = { register, computeSetupStatus, setBridgeContext }
