const fs = require('fs')
const { store } = require('../../store')
const fetchImpl = global.fetch || ((...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args)))

const BRIDGE_ENDPOINT = 'http://127.0.0.1:8765'

function getSetupGuide(config = store.getConfig()) {
  const configured = Boolean(config.desktopUseApiKey || config.desktopUseEndpoint || config.uiTarsEndpoint || config.uiTarsCommand)
  return {
    runtime: 'ui-tars',
    status: configured ? 'needs-verification' : 'not-installed',
    title: 'Configure Desktop Use compatibility bridge',
    steps: [
      'AionUi supervises the desktop-use bridge for current desktop automation.',
      'Legacy UI-TARS bridge status is kept only as a compatibility fallback.',
      'Configure Desktop Use endpoint, model, and API key in Settings.',
      'Enable Browser Use key fallback if Desktop Use should reuse Browser Use credentials.',
      'Run a controlled desktop observe/click/type smoke test before real automation.'
    ],
    proposedSetupActions: [{
      runtime: 'ui-tars',
      type: 'runtime.setup',
      title: 'Open Desktop Use setup guide',
      summary: 'Shows how to configure the current Desktop Use bridge and legacy compatibility fallback.',
      payload: { guide: 'docs/runtime-setup.md', license: 'Apache-2.0' },
      risk: 'high',
      requiresConfirmation: true
    }]
  }
}

async function detect(config = store.getConfig()) {
  if (config.uiTarsEndpoint) {
    return {
      runtime: 'ui-tars',
      state: 'needs-configuration',
      endpoint: config.uiTarsEndpoint,
      screenAuthorized: Boolean(config.uiTarsScreenAuthorized),
      guidance: getSetupGuide(config)
    }
  }
  try {
    const response = await fetchImpl(`${BRIDGE_ENDPOINT}/health`)
    if (response.ok) {
      return {
        runtime: 'ui-tars',
        state: 'configured',
        endpoint: BRIDGE_ENDPOINT,
        source: 'bridge',
        screenAuthorized: Boolean(config.uiTarsScreenAuthorized),
        guidance: getSetupGuide(config)
      }
    }
  } catch {}
  if (config.uiTarsCommand) {
    const firstToken = String(config.uiTarsCommand).trim().split(/\s+/)[0].replace(/^"|"$/g, '')
    const commandLooksLocal = fs.existsSync(firstToken) || !/[\\/]/.test(firstToken)
    return {
      runtime: 'ui-tars',
      state: commandLooksLocal ? 'configured' : 'error',
      command: config.uiTarsCommand,
      screenAuthorized: Boolean(config.uiTarsScreenAuthorized),
      guidance: getSetupGuide(config)
    }
  }
  return {
    runtime: 'ui-tars',
    state: 'not-installed',
    screenAuthorized: Boolean(config.uiTarsScreenAuthorized),
    guidance: getSetupGuide(config)
  }
}

async function repair(config = store.getConfig()) {
  const status = await detect(config)
  return {
    ...status,
    repaired: false,
    message: 'Desktop Use is handled by the managed desktop-use bridge. Configure Desktop Use settings or enable Browser Use fallback.'
  }
}

module.exports = { detect, repair, getSetupGuide }
