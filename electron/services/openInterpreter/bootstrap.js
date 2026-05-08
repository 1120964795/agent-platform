const fs = require('fs')
const { store } = require('../../store')
const manifest = require('./patchManifest')

function getInstallGuidance(config = store.getConfig()) {
  return {
    runtime: 'open-interpreter',
    status: config.openInterpreterCommand || config.openInterpreterEndpoint ? 'needs-verification' : 'not-installed',
    title: '配置 Open Interpreter 外部运行时',
    steps: [
      '在本仓库之外安装 Open Interpreter。',
      '将其暴露为兼容 AionUi 的 sidecar 端点，或配置本地命令包装器。',
      '请将 Open Interpreter 的 AGPL 源码保留在 AionUi 仓库之外。',
      '回到 AionUi 后运行健康检查。'
    ],
    proposedSetupActions: [{
      runtime: 'open-interpreter',
      type: 'runtime.setup',
      title: '打开 Open Interpreter 设置指引',
      summary: '显示安装与 sidecar 配置说明。任何安装命令都需要单独审批。',
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
    message: 'Open Interpreter 是外部运行时。AionUi 可以提供设置动作，但不会自动安装或内置 AGPL 源码。'
  }
}

module.exports = { detect, repair, getInstallGuidance }
