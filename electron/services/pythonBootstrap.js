const { execFileSync, execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { REQUIRED_IMPORTS, findCompatiblePython, getUserPythonDepsPath } = require('./pythonRuntimeInstaller')

function findCommand(cmd) {
  try {
    const whereCmd = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`
    const output = execSync(whereCmd, { encoding: 'utf8', timeout: 5000 }).trim()
    return output.split('\n')[0].trim() || null
  } catch {
    return null
  }
}

function resolveDefaultRootDir() {
  const devRoot = path.join(__dirname, '..', '..')
  return process.defaultApp ? devRoot : (process.resourcesPath || devRoot)
}

function getBundledPythonDepsPath(rootDir = resolveDefaultRootDir()) {
  return path.join(rootDir, 'server', 'browser-use-bridge', '.deps')
}

function buildPythonEnv(rootDir = resolveDefaultRootDir(), baseEnv = process.env) {
  const env = {
    ...baseEnv,
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    PLAYWRIGHT_BROWSERS_PATH: baseEnv.PLAYWRIGHT_BROWSERS_PATH || '0'
  }
  const depsPaths = [
    getUserPythonDepsPath(env),
    getBundledPythonDepsPath(rootDir)
  ].filter((depsPath) => depsPath && fs.existsSync(depsPath))

  env.PYTHONPATH = [...depsPaths, env.PYTHONPATH].filter(Boolean).join(path.delimiter)
  return env
}

async function detect(options = {}) {
  const rootDir = options.rootDir || resolveDefaultRootDir()
  const baseEnv = options.env || process.env
  const env = buildPythonEnv(rootDir, baseEnv)
  const bundledDepsPath = getBundledPythonDepsPath(rootDir)
  const userDepsPath = getUserPythonDepsPath(baseEnv)
  const result = {
    python: null,
    pythonVersion: null,
    uv: null,
    browserUse: false,
    playwright: false,
    selenium: false,
    fastapi: false,
    available: false,
    browserUseInstalled: false,
    playwrightInstalled: false,
    seleniumInstalled: false,
    fastapiInstalled: false,
    bundledDepsPath: fs.existsSync(bundledDepsPath) ? bundledDepsPath : null,
    userDepsPath: fs.existsSync(userDepsPath) ? userDepsPath : null,
    ready: false,
    issues: []
  }

  const python = findCompatiblePython(baseEnv)
  if (!python) {
    result.issues.push('Python 3.11+ is not installed or not available on PATH.')
    return result
  }

  result.python = python.executable
  result.pythonVersion = `Python ${python.version}`
  result.available = true

  try { result.uv = findCommand('uv') } catch {}

  for (const item of REQUIRED_IMPORTS) {
    try {
      execFileSync(python.command, ['-c', item.code], { encoding: 'utf8', timeout: 10000, env, windowsHide: true })
      result[item.key] = true
      result[`${item.key}Installed`] = true
    } catch {
      result.issues.push(`${item.key} Python dependency is not installed. Re-run the installer or use Runtime repair.`)
    }
  }

  result.ready = result.issues.length === 0
  return result
}

function getSetupGuide(detection) {
  const steps = []
  if (!detection.python) {
    steps.push('1. Install Python 3.11+ or run the installer on a machine with winget enabled.')
    steps.push('2. Re-run the app installer so it can prepare Python runtime dependencies.')
  }
  if (!detection.browserUse) {
    steps.push('3. Install browser-use through the bundled installer or Runtime repair.')
  }
  if (!detection.playwright) {
    steps.push('4. Install Playwright and Chromium through the bundled installer or Runtime repair.')
  }
  if (!detection.selenium) {
    steps.push('5. Install Selenium through the bundled installer or Runtime repair.')
  }
  if (detection.uv) {
    steps.push('Tip: uv was detected and can speed up local Python dependency repair.')
  }
  return steps.length ? steps : ['Python runtime dependencies are ready.']
}

module.exports = {
  detect,
  getSetupGuide,
  buildPythonEnv,
  getBundledPythonDepsPath,
  getUserPythonDepsPath,
  findCompatiblePython
}
