const fs = require('fs')
const { store } = require('../../store')

function getSetupGuide(config = store.getConfig()) {
  return {
    runtime: 'ui-tars',
    status: config.uiTarsEndpoint || config.uiTarsCommand ? 'needs-verification' : 'not-installed',
    title: '配置 UI-TARS Desktop 或适配服务',
    steps: [
      '安装 UI-TARS Desktop、SDK 或维护中的分支版本。',
      '暴露一个兼容 AionUi 的适配器端点，或配置用于启动适配器的本地命令。',
      '确保屏幕授权在 AionUi 中可见且可随时撤销。',
      '在演示模式或受控屏幕上运行观察、点击、输入冒烟测试。'
    ],
    proposedSetupActions: [{
      runtime: 'ui-tars',
      type: 'runtime.setup',
      title: '打开 UI-TARS 设置指引',
      summary: '显示 UI-TARS Desktop 或适配服务的设置说明。',
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
  return { ...status, repaired: false, message: 'UI-TARS 是外部运行时。请配置 Desktop、SDK、分支版本或适配服务，然后授权屏幕访问。' }
}

module.exports = { detect, repair, getSetupGuide }
