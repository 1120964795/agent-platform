const adapter = require('./adapter')
const { detect: detectPython, getSetupGuide: getPythonGuide } = require('../pythonBootstrap')

async function detect() {
  const [health, python] = await Promise.all([
    adapter.healthCheck(),
    detectPython()
  ])
  return {
    available: health.available,
    bridge: health.detail,
    python: {
      path: python.python,
      version: python.pythonVersion,
      ready: python.ready,
      issues: python.issues
    },
    setupGuide: python.ready ? null : getPythonGuide(python)
  }
}

async function repair() {
  return {
    runtime: 'browser-use',
    guidance: '请确认已安装 Python 3.11+，然后运行：pip install browser-use && playwright install chromium',
    installCommand: 'pip install browser-use && playwright install chromium --with-deps',
  }
}

async function getSetupGuide() {
  return {
    title: '浏览器自动化 (browser-use)',
    description: 'browser-use 会使用 AI 驱动真实浏览器。它需要 Python 3.11+、Chromium，以及浏览器自动化设置。',
    steps: [
      '安装 Python 3.11 或更高版本。',
      'pip install browser-use',
      'playwright install chromium --with-deps',
      '请在设置中配置浏览器自动化 API 密钥、服务地址和模型。',
    ],
  }
}

module.exports = { detect, repair, getSetupGuide, adapter }
