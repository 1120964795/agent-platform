const fs = require('fs')
const { store } = require('../../store')
const fetchImpl = global.fetch || ((...a) => import('node-fetch').then(({ default: f }) => f(...a)))

const BRIDGE_ENDPOINT = 'http://127.0.0.1:8765'

function getSetupGuide(config = store.getConfig()) {
  return {
    runtime: 'ui-tars',
    status: config.uiTarsEndpoint || config.uiTarsCommand ? 'needs-verification' : 'not-installed',
    title: '配置 UI-TARS 桌面自动化',
    steps: [
      'AionUi 会自动启动内置 UI-TARS uitars-bridge。',
      '托管桥接运行时在模型设置之外管理。',
      '运行 observe、click 或 type 操作前，请在 AionUi 中开启屏幕授权。',
      '正式自动化前，请先在受控桌面上运行 observe/click/type 演示测试。'
    ],
    proposedSetupActions: [{
      runtime: 'ui-tars',
      type: 'runtime.setup',
      title: '打开 UI-TARS 设置指引',
      summary: '查看如何检查托管 uitars-bridge 设置。',
      payload: { guide: 'https://github.com/bytedance/UI-TARS-desktop', license: 'Apache-2.0' },
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
  return { ...status, repaired: false, message: 'UI-TARS 使用托管 uitars-bridge。请先开启屏幕授权，再执行桌面自动化。' }
}

module.exports = { detect, repair, getSetupGuide }
