const fs = require('fs')
const { store } = require('../../store')

function getSetupGuide(config = store.getConfig()) {
  return {
    runtime: 'ui-tars',
    status: config.uiTarsEndpoint || config.uiTarsCommand ? 'needs-verification' : 'not-installed',
    title: 'Configure UI-TARS Desktop or adapter service',
    steps: [
      'Install UI-TARS Desktop, SDK, or a maintained fork.',
      'Expose an AionUi-compatible adapter endpoint, or configure the local command used to start one.',
      'Keep screen authorization visible and revocable in AionUi.',
      'Run observe/click/type smoke tests from dry-run or a controlled screen.'
    ],
    proposedSetupActions: [{
      runtime: 'ui-tars',
      type: 'runtime.setup',
      title: 'Open UI-TARS setup guide',
      summary: 'Show UI-TARS Desktop or adapter service setup guidance.',
      payload: { guide: 'https://github.com/bytedance/UI-TARS-desktop', license: 'Apache-2.0' },
      risk: 'high',
      requiresConfirmation: true
    }]
  }
}

async function detect(config = store.getConfig()) {
  if (config.uiTarsEndpoint) return { runtime: 'ui-tars', state: 'needs-configuration', endpoint: config.uiTarsEndpoint, screenAuthorized: Boolean(config.uiTarsScreenAuthorized), guidance: getSetupGuide(config) }
  if (config.uiTarsCommand) {
    const firstToken = String(config.uiTarsCommand).trim().split(/\s+/)[0].replace(/^"|"$/g, '')
    const commandLooksLocal = fs.existsSync(firstToken) || !/[\\/]/.test(firstToken)
    return { runtime: 'ui-tars', state: commandLooksLocal ? 'configured' : 'error', command: config.uiTarsCommand, screenAuthorized: Boolean(config.uiTarsScreenAuthorized), guidance: getSetupGuide(config) }
  }
  return { runtime: 'ui-tars', state: 'not-installed', screenAuthorized: Boolean(config.uiTarsScreenAuthorized), guidance: getSetupGuide(config) }
}

async function repair(config = store.getConfig()) {
  const status = await detect(config)
  return { ...status, repaired: false, message: 'UI-TARS is external. Configure Desktop, SDK, fork, or adapter service, then authorize screen access.' }
}

module.exports = { detect, repair, getSetupGuide }
