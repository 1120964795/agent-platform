const { store } = require('../../store')
const { RUNTIME_NAMES } = require('../../security/actionTypes')
const { detect, getSetupGuide } = require('./bootstrap')
const { normalizeUiTarsResult, toUiTarsRequest } = require('./protocol')
const { executeThroughBridge } = require('./sourceBridge')

function authorizationFailure(action, config) {
  return normalizeUiTarsResult(action, {
    ok: false,
    exitCode: 1,
    stderr: 'UI-TARS screen authorization is not active. No GUI action was executed.',
    metadata: { recoverable: true, requiresScreenAuthorization: true, guidance: getSetupGuide(config) }
  })
}

function missingRuntime(action, config) {
  return normalizeUiTarsResult(action, {
    ok: false,
    exitCode: 1,
    stdout: 'UI-TARS is not configured. No screen, mouse, or keyboard action was executed.',
    metadata: { recoverable: true, guidance: getSetupGuide(config) }
  })
}

function createUiTarsAdapter(options = {}) {
  const storeRef = options.storeRef || store
  return {
    async execute(action, context = {}) {
      const config = storeRef.getConfig()
      if (action.runtime !== RUNTIME_NAMES.UI_TARS && action.runtime !== RUNTIME_NAMES.DRY_RUN) throw new Error(`UI-TARS adapter cannot execute ${action.runtime}`)
      toUiTarsRequest(action)
      if (!config.uiTarsScreenAuthorized) return authorizationFailure(action, config)
      const runtime = await detect(config)
      if (!config.uiTarsEndpoint && !config.uiTarsCommand) return missingRuntime(action, config)
      if (config.uiTarsEndpoint) return executeThroughBridge(config.uiTarsEndpoint, action, context)
      return normalizeUiTarsResult(action, {
        ok: false,
        exitCode: 1,
        stdout: `UI-TARS command is configured (${config.uiTarsCommand}) but no adapter endpoint is available for protocol execution.`,
        metadata: { recoverable: true, runtime }
      })
    },
    emergencyStop() {
      return { ok: true, runtime: 'ui-tars' }
    }
  }
}

module.exports = { createUiTarsAdapter, authorizationFailure, missingRuntime }
