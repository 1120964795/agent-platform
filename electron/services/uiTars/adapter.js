const { store } = require('../../store')
const { RUNTIME_NAMES } = require('../../security/actionTypes')
const { detect, getSetupGuide } = require('./bootstrap')
const { normalizeUiTarsResult, toUiTarsRequest } = require('./protocol')
const { executeThroughBridge } = require('./sourceBridge')

function authorizationFailure(action, config) {
  return normalizeUiTarsResult(action, {
    ok: false,
    exitCode: 1,
    stderr: 'UI-TARS 屏幕授权未启用。未执行任何图形界面动作。',
    metadata: { recoverable: true, requiresScreenAuthorization: true, guidance: getSetupGuide(config) }
  })
}

function missingRuntime(action, config) {
  return normalizeUiTarsResult(action, {
    ok: false,
    exitCode: 1,
    stdout: 'UI-TARS 尚未配置。未执行任何屏幕、鼠标或键盘动作。',
    metadata: { recoverable: true, guidance: getSetupGuide(config) }
  })
}

function createUiTarsAdapter(options = {}) {
  const storeRef = options.storeRef || store
  return {
    async execute(action, context = {}) {
      const config = storeRef.getConfig()
      if (action.runtime !== RUNTIME_NAMES.UI_TARS && action.runtime !== RUNTIME_NAMES.DRY_RUN) throw new Error(`UI-TARS 适配器无法执行 ${action.runtime}`)
      toUiTarsRequest(action)
      if (!config.uiTarsScreenAuthorized) return authorizationFailure(action, config)
      const runtime = await detect(config)
      if (!config.uiTarsEndpoint && !config.uiTarsCommand) return missingRuntime(action, config)
      if (config.uiTarsEndpoint) return executeThroughBridge(config.uiTarsEndpoint, action, context)
      return normalizeUiTarsResult(action, {
        ok: false,
        exitCode: 1,
        stdout: `已配置 UI-TARS 命令（${config.uiTarsCommand}），但当前没有可用于协议执行的适配器端点。`,
        metadata: { recoverable: true, runtime }
      })
    },
    emergencyStop() {
      return { ok: true, runtime: 'ui-tars' }
    }
  }
}

module.exports = { createUiTarsAdapter, authorizationFailure, missingRuntime }
