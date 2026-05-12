const adapter = require('./adapter')
const { detect: detectPython, getSetupGuide: getPythonGuide } = require('../pythonBootstrap')
const { installBrowserRuntime } = require('../pythonRuntimeInstaller')

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
  const result = installBrowserRuntime()
  return {
    runtime: 'browser-use',
    state: 'installed',
    depsPath: result.depsPath,
    python: result.python,
    pythonVersion: result.pythonVersion,
    installCommand: 'python -m pip install -r server/browser-use-bridge/requirements.txt --target <runtime-deps> && python -m playwright install chromium'
  }
}

async function getSetupGuide() {
  return {
    title: '浏览器自动化 (browser-use)',
    description: 'browser-use 会使用 AI 驱动真实浏览器。它需要 Python 3.11+、Chromium，以及浏览器自动化设置。',
    steps: [
      '运行 Windows 安装器以准备 browser-use、Playwright、Selenium 和 Chromium。',
      '如果依赖检测仍然缺失，请在运行时设置中使用修复功能。',
      '请在设置中配置浏览器自动化 API 密钥、服务地址和模型。',
    ],
  }
}

module.exports = { detect, repair, getSetupGuide, adapter }
