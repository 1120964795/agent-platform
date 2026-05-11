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
    title: 'Browser automation (browser-use)',
    description: 'browser-use drives a real browser for web tasks. It requires Python 3.11+, Chromium, and the Python packages installed by the app installer.',
    steps: [
      'Run the Windows installer to prepare browser-use, Playwright, Selenium, and Chromium.',
      'Use Runtime repair if the dependency check still reports missing packages.',
      'Configure Browser Use API Key, endpoint, and model in Settings.',
    ],
  }
}

module.exports = { detect, repair, getSetupGuide, adapter }
