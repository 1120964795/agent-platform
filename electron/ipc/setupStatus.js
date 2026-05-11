const { store } = require('../store')

let pythonBootstrap, supervisor
function setBridgeContext(ctx) {
  pythonBootstrap = ctx.pythonBootstrap
  supervisor = ctx.supervisor
}

const KEY_FIELD_MAP = {
  deepseekKey: 'deepseekApiKey',
  qwenKey: 'qwenApiKey',
  doubaoKey: 'doubaoVisionApiKey',
  browserUseKey: 'browserUseApiKey'
}

async function computeSetupStatus({ storeRef = store } = {}) {
  const cfg = storeRef.getConfig()
  const deps = {
    deepseekKey: Boolean(cfg.deepseekApiKey),
    qwenKey: Boolean(cfg.qwenApiKey),
    doubaoKey: Boolean(cfg.doubaoVisionApiKey),
    browserUseKey: Boolean(cfg.browserUseApiKey),
  }

  // Check Python/bridge health (non-blocking)
  try {
    if (typeof pythonBootstrap !== 'undefined' && pythonBootstrap) {
      const pyResult = await pythonBootstrap.detect()
      deps.python = Boolean(pyResult.available ?? pyResult.python)
      deps.browserUse = Boolean(pyResult.browserUseInstalled ?? pyResult.browserUse)
      deps.playwright = Boolean(pyResult.playwrightInstalled ?? pyResult.playwright)
      deps.selenium = Boolean(pyResult.seleniumInstalled ?? pyResult.selenium)
      deps.pythonDepsBundled = Boolean(pyResult.bundledDepsPath)
      deps.pythonDepsInstalled = Boolean(pyResult.userDepsPath)
    }
  } catch { deps.python = false }

  try {
    if (typeof supervisor !== 'undefined' && supervisor) {
      const bridgeState = supervisor.getState()
      deps.bridgesRunning = Object.values(bridgeState).every(b => b.state === 'running')
    }
  } catch { deps.bridgesRunning = false }

  const tiers = {
    lite: {
      label: 'Lite: chat only',
      requires: ['deepseekKey'],
      ready: deps.deepseekKey
    },
    browser: {
      label: 'Browser + Desktop automation',
      requires: ['deepseekKey', 'doubaoKey', 'browserUseKey'],
      ready: Boolean(deps.deepseekKey && deps.doubaoKey && deps.browserUseKey && deps.python && deps.browserUse && deps.playwright && deps.selenium),
      recommended: true
    },
  }
  return {
    deps,
    tiers,
    helpLinks: {
      deepseekKey: 'https://platform.deepseek.com/api_keys',
      qwenKey: 'https://bailian.console.aliyun.com/',
      doubaoKey: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
      browserUseKey: 'https://zenmux.ai/',
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
