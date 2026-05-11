const fs = require('fs')
const { store } = require('../../store')
const fetchImpl = global.fetch || ((...a) => import('node-fetch').then(({ default: f }) => f(...a)))

const BRIDGE_ENDPOINT = 'http://127.0.0.1:8765'

function getSetupGuide(config = store.getConfig()) {
  return {
    runtime: 'ui-tars',
    status: config.uiTarsEndpoint || config.uiTarsCommand ? 'needs-verification' : 'not-installed',
    title: 'Configure UI-TARS with Doubao vision on Volcengine Ark',
    steps: [
      '司南 launches the in-app UI-TARS uitars-bridge automatically.',
      'Create or reuse a Volcengine Ark endpoint for doubao-1-5-thinking-vision-pro-250428.',
      'Set doubaoVisionApiKey in Settings; keep doubaoVisionEndpoint at https://ark.cn-beijing.volces.com/api/v3 unless your Ark deployment differs.',
      'Enable screen authorization in 司南 before running observe, click, or type actions.',
      'Run a dry-run observe/click/type smoke test on a controlled desktop before real automation.'
    ],
    proposedSetupActions: [{
      runtime: 'ui-tars',
      type: 'runtime.setup',
      title: 'Open Doubao / Volcengine UI-TARS setup guide',
      summary: 'Shows how to configure the Volcengine Ark Doubao vision endpoint used by uitars-bridge.',
      payload: { guide: 'https://www.volcengine.com/docs/82379', license: 'Apache-2.0' },
      risk: 'high',
      requiresConfirmation: true
    }]
  }
}

async function detect(config = store.getConfig()) {
  if (config.uiTarsEndpoint) return { runtime: 'ui-tars', state: 'needs-configuration', endpoint: config.uiTarsEndpoint, screenAuthorized: Boolean(config.uiTarsScreenAuthorized), guidance: getSetupGuide(config) }
  try {
    const r = await fetchImpl(`${BRIDGE_ENDPOINT}/health`)
    if (r.ok) {
      return { runtime: 'ui-tars', state: 'configured', endpoint: BRIDGE_ENDPOINT, source: 'bridge', screenAuthorized: Boolean(config.uiTarsScreenAuthorized), guidance: getSetupGuide(config) }
    }
  } catch {}
  if (config.uiTarsCommand) {
    const firstToken = String(config.uiTarsCommand).trim().split(/\s+/)[0].replace(/^"|"$/g, '')
    const commandLooksLocal = fs.existsSync(firstToken) || !/[\\/]/.test(firstToken)
    return { runtime: 'ui-tars', state: commandLooksLocal ? 'configured' : 'error', command: config.uiTarsCommand, screenAuthorized: Boolean(config.uiTarsScreenAuthorized), guidance: getSetupGuide(config) }
  }
  return { runtime: 'ui-tars', state: 'not-installed', screenAuthorized: Boolean(config.uiTarsScreenAuthorized), guidance: getSetupGuide(config) }
}

async function repair(config = store.getConfig()) {
  const status = await detect(config)
  return { ...status, repaired: false, message: 'UI-TARS uses the managed uitars-bridge. Configure Doubao on Volcengine Ark and enable screen authorization.' }
}

module.exports = { detect, repair, getSetupGuide }
