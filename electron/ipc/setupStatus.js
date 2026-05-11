const { store } = require('../store')

let pythonBootstrap, supervisor
function setBridgeContext(ctx) {
  pythonBootstrap = ctx.pythonBootstrap
  supervisor = ctx.supervisor
}

const KEY_FIELD_MAP = {
  deepseekKey: 'deepseekApiKey'
}

async function computeSetupStatus({ storeRef = store } = {}) {
  const cfg = storeRef.getConfig()
  const deps = {
    deepseekKey: Boolean(cfg.deepseekApiKey),
  }

  // Check Python/bridge health (non-blocking)
  try {
    if (typeof pythonBootstrap !== 'undefined' && pythonBootstrap) {
      const pyResult = await pythonBootstrap.detect()
      deps.python = pyResult.available
      deps.browserUse = pyResult.browserUseInstalled
      deps.playwright = pyResult.playwrightInstalled
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
      label: '轻量模式：仅聊天',
      requires: ['deepseekKey'],
      ready: deps.deepseekKey
    },
    browser: {
      label: '浏览器自动化',
      requires: ['deepseekKey'],
      ready: deps.deepseekKey && deps.python !== false,
      recommended: true
    },
  }
  return {
    deps,
    tiers,
    helpLinks: {
      deepseekKey: 'https://platform.deepseek.com/api_keys',
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
    if (!field) throw new Error(`未知配置项 ${dep}`)
    if (typeof value !== 'string' || value.length > 4096) throw new Error('密钥无效')
    store.setConfig({ [field]: value.trim() })
    return { ok: true }
  })
}

module.exports = { register, computeSetupStatus, setBridgeContext }
