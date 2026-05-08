module.exports = Object.freeze({
  runtime: 'open-interpreter',
  sourcePolicy: 'external-only',
  upstream: 'https://github.com/OpenInterpreter/open-interpreter',
  license: 'AGPL-3.0',
  vendoredSource: false,
  notes: [
    'AionUi 不内置 Open Interpreter 源码。',
    '请在本仓库之外使用外部 sidecar、本地命令或维护中的分支版本。',
    '此适配器运行前，所有动作都必须先进入 AionUi 动作代理。'
  ]
})
