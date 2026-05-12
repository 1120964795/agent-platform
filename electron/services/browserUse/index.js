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
    deps: {
      browserUse: Boolean(python.browserUseInstalled ?? python.browserUse),
      playwright: Boolean(python.playwrightInstalled ?? python.playwright),
      selenium: Boolean(python.seleniumInstalled ?? python.selenium),
      fastapi: Boolean(python.fastapiInstalled ?? python.fastapi),
      userDepsPath: python.userDepsPath,
      bundledDepsPath: python.bundledDepsPath
    },
    setupGuide: python.ready ? null : getPythonGuide(python)
  }
}

async function repair(options = {}) {
  const result = installBrowserRuntime(options)
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
    title: 'Browser Use runtime',
    description: 'Browser Use needs a configured Browser Use API key plus Python runtime packages for browser-use, Playwright, Selenium, and FastAPI.',
    steps: [
      'Configure the Browser Use API key and endpoint in Settings.',
      'Install Python 3.11 or newer.',
      'Run Runtime repair or rerun the Windows installer to install browser-use dependencies.',
      'Ensure Playwright Chromium is installed by the runtime repair step.',
      'Keep Selenium available for compatibility with browser automation flows.'
    ],
  }
}

module.exports = { detect, repair, getSetupGuide, adapter }
