const fs = require('fs')
const { store } = require('../../store')
const manifest = require('./patchManifest')

function getInstallGuidance(config = store.getConfig()) {
  return {
    runtime: 'open-interpreter',
    status: config.openInterpreterCommand || config.openInterpreterEndpoint ? 'needs-verification' : 'not-installed',
    title: 'Configure Open Interpreter external runtime',
    steps: [
      'Install Open Interpreter outside this repository.',
      'Expose it as an AionUi-compatible sidecar endpoint or configure a local command wrapper.',
      'Keep Open Interpreter AGPL source outside the AionUi repository.',
      'Return to AionUi and run a health check.'
    ],
    proposedSetupActions: [{
      runtime: 'open-interpreter',
      type: 'runtime.setup',
      title: 'Open Open Interpreter setup guide',
      summary: 'Show install and sidecar configuration guidance. Any install command must be separately approved.',
      payload: { guide: 'https://github.com/OpenInterpreter/open-interpreter', sourcePolicy: manifest.sourcePolicy },
      risk: 'high',
      requiresConfirmation: true
    }]
  }
}

async function detect(config = store.getConfig()) {
  if (config.openInterpreterEndpoint) {
    return { runtime: 'open-interpreter', state: 'needs-configuration', endpoint: config.openInterpreterEndpoint, guidance: getInstallGuidance(config) }
  }
  if (config.openInterpreterCommand) {
    const firstToken = String(config.openInterpreterCommand).trim().split(/\s+/)[0].replace(/^"|"$/g, '')
    const commandLooksLocal = fs.existsSync(firstToken) || !/[\\/]/.test(firstToken)
    return {
      runtime: 'open-interpreter',
      state: commandLooksLocal ? 'configured' : 'error',
      command: config.openInterpreterCommand,
      guidance: getInstallGuidance(config)
    }
  }
  return { runtime: 'open-interpreter', state: 'not-installed', guidance: getInstallGuidance(config) }
}

async function repair(config = store.getConfig()) {
  const status = await detect(config)
  return {
    ...status,
    repaired: false,
    message: 'Open Interpreter is external. AionUi can provide setup actions, but it does not install or vendor AGPL source automatically.'
  }
}

module.exports = { detect, repair, getInstallGuidance }
