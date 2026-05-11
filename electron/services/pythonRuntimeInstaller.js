const { execFileSync, spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const MIN_PYTHON = { major: 3, minor: 11 }
const REQUIRED_IMPORTS = [
  { key: 'browserUse', code: 'import browser_use' },
  { key: 'playwright', code: 'from playwright.sync_api import sync_playwright' },
  { key: 'selenium', code: 'import selenium' },
  { key: 'fastapi', code: 'from fastapi import FastAPI' }
]
let cachedPython = null
let cachedPythonChecked = false

function appDataRoot(env = process.env) {
  if (env.AGENTDEV_DATA_DIR) return env.AGENTDEV_DATA_DIR
  if (process.platform === 'win32' && env.APPDATA) return path.join(env.APPDATA, 'agentdev-lite')
  return path.join(os.homedir(), '.agentdev-lite')
}

function getUserPythonDepsPath(env = process.env) {
  return env.AGENTDEV_PYTHON_DEPS_DIR || path.join(appDataRoot(env), 'python', 'browser-use', '.deps')
}

function createStagingDepsPath(depsPath, options = {}) {
  const now = options.now || Date.now
  const pid = options.pid || process.pid
  return path.join(path.dirname(depsPath), `.deps-staging-${pid}-${now()}`)
}

function buildInstallerEnv(env = process.env, depsPath) {
  return {
    ...env,
    PYTHONPATH: [depsPath, env.PYTHONPATH].filter(Boolean).join(path.delimiter),
    PLAYWRIGHT_BROWSERS_PATH: env.PLAYWRIGHT_BROWSERS_PATH || '0',
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    PIP_DISABLE_PIP_VERSION_CHECK: '1'
  }
}

function parseVersion(version) {
  const match = String(version || '').match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

function versionSupported(version) {
  const parsed = typeof version === 'string' ? parseVersion(version) : version
  if (!parsed) return false
  if (parsed.major > MIN_PYTHON.major) return true
  return parsed.major === MIN_PYTHON.major && parsed.minor >= MIN_PYTHON.minor
}

function pythonInfo(command, args = [], env = process.env) {
  try {
    const output = execFileSync(command, [
      ...args,
      '-c',
      'import sys; print(sys.executable); print("%d.%d.%d" % sys.version_info[:3])'
    ], { encoding: 'utf8', timeout: 10000, env, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\r?\n/)
    const executable = output[0] && output[0].trim()
    const version = output[1] && output[1].trim()
    if (!executable || !version) return null
    return { command: executable, args: [], executable, version, supported: versionSupported(version) }
  } catch {
    return null
  }
}

function pythonCandidates() {
  if (process.platform === 'win32') {
    return [
      { command: 'py', args: ['-3.12'] },
      { command: 'py', args: ['-3.11'] },
      { command: 'python', args: [] },
      { command: 'python3', args: [] }
    ]
  }
  return [
    { command: 'python3.12', args: [] },
    { command: 'python3.11', args: [] },
    { command: 'python3', args: [] },
    { command: 'python', args: [] }
  ]
}

function findCompatiblePython(env = process.env, options = {}) {
  if (!options.refresh && env === process.env && cachedPythonChecked) return cachedPython
  const seen = new Set()
  for (const candidate of pythonCandidates()) {
    const info = pythonInfo(candidate.command, candidate.args, env)
    if (!info || !info.supported) continue
    const key = info.executable.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (env === process.env) {
      cachedPython = info
      cachedPythonChecked = true
    }
    return info
  }
  if (env === process.env) {
    cachedPython = null
    cachedPythonChecked = true
  }
  return null
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    stdio: options.stdio || 'inherit',
    windowsHide: true,
    shell: false
  })
  if (result.status !== 0) {
    const suffix = result.error ? `: ${result.error.message}` : ''
    throw new Error(`${command} ${args.join(' ')} failed${suffix}`)
  }
}

function installPythonWithWinget(env = process.env) {
  if (process.platform !== 'win32') return false
  const result = spawnSync('winget', [
    'install',
    '--id',
    'Python.Python.3.12',
    '-e',
    '--silent',
    '--accept-package-agreements',
    '--accept-source-agreements'
  ], { stdio: 'inherit', env, windowsHide: true, shell: false })
  return result.status === 0
}

function normalizeRuntimePermissions(targetPath, env = process.env, spawnSyncImpl = spawnSync) {
  if (process.platform !== 'win32' || !targetPath || !fs.existsSync(targetPath)) return false
  const username = env.USERNAME
  const domain = env.USERDOMAIN
  const principal = username ? (domain ? `${domain}\\${username}` : username) : null
  const commonOptions = { stdio: 'ignore', env, windowsHide: true, shell: false }

  try {
    spawnSyncImpl('icacls', [targetPath, '/inheritance:e', '/T', '/C'], commonOptions)
    if (principal) {
      spawnSyncImpl('icacls', [targetPath, '/grant:r', `${principal}:(OI)(CI)F`, '/T', '/C'], commonOptions)
    }
    return true
  } catch {
    return false
  }
}

function validateBrowserRuntime(python, depsPath, env, runImpl = run) {
  const runtimeEnv = buildInstallerEnv(env, depsPath)
  for (const item of REQUIRED_IMPORTS) {
    runImpl(python.command, ['-c', item.code], {
      env: runtimeEnv,
      stdio: 'ignore'
    })
  }
}

function restoreBackup(depsPath, backupPath) {
  if (!backupPath || !fs.existsSync(backupPath)) return
  try {
    if (fs.existsSync(depsPath)) fs.rmSync(depsPath, { recursive: true, force: true })
    fs.renameSync(backupPath, depsPath)
  } catch {}
}

function publishStagedDeps(stagingDepsPath, depsPath, options = {}) {
  if (!fs.existsSync(stagingDepsPath)) {
    throw new Error(`Staged Python dependencies not found: ${stagingDepsPath}`)
  }

  const now = options.now || Date.now
  const pid = options.pid || process.pid
  const backupPath = `${depsPath}-old-${pid}-${now()}`
  fs.mkdirSync(path.dirname(depsPath), { recursive: true })

  let movedExisting = false
  if (fs.existsSync(depsPath)) {
    try {
      if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { recursive: true, force: true })
      fs.renameSync(depsPath, backupPath)
      movedExisting = true
    } catch {
      fs.rmSync(depsPath, { recursive: true, force: true })
      if (fs.existsSync(depsPath)) throw new Error(`Unable to replace existing Python dependency directory: ${depsPath}`)
    }
  }

  try {
    fs.renameSync(stagingDepsPath, depsPath)
  } catch (error) {
    if (movedExisting) restoreBackup(depsPath, backupPath)
    throw error
  }

  return movedExisting ? backupPath : null
}

function cleanupPath(targetPath, options = {}) {
  if (!targetPath || !fs.existsSync(targetPath)) return true
  try {
    fs.rmSync(targetPath, { recursive: true, force: true })
    return true
  } catch (error) {
    if (options.throwOnError) throw error
    return false
  }
}

function installBrowserRuntime(options = {}) {
  const rootDir = options.rootDir || (process.defaultApp ? path.join(__dirname, '..', '..') : (process.resourcesPath || path.join(__dirname, '..', '..')))
  const env = options.env || process.env
  const depsPath = options.depsPath || getUserPythonDepsPath(env)
  const requirementsPath = options.requirementsPath || path.join(rootDir, 'server', 'browser-use-bridge', 'requirements.txt')
  const runImpl = options.runImpl || run
  const findPython = options.findPython || ((runtimeEnv) => findCompatiblePython(runtimeEnv, { refresh: true }))
  const installPython = options.installPython || installPythonWithWinget
  const normalizePermissions = options.normalizePermissionsImpl || normalizeRuntimePermissions

  let python = findPython(env)
  if (!python && options.allowPythonInstall !== false && installPython(env)) {
    python = findPython(env)
  }
  if (!python) {
    throw new Error('Python 3.11+ is required to install browser-use runtime dependencies.')
  }
  if (!fs.existsSync(requirementsPath)) {
    throw new Error(`requirements.txt not found: ${requirementsPath}`)
  }

  const depsParent = path.dirname(depsPath)
  const stagingDepsPath = options.stagingDepsPath || createStagingDepsPath(depsPath, options)
  let backupPath = null
  fs.mkdirSync(depsParent, { recursive: true })
  normalizePermissions(depsParent, env)
  cleanupPath(stagingDepsPath, { throwOnError: true })

  try {
    fs.mkdirSync(stagingDepsPath, { recursive: true })
    const installerEnv = buildInstallerEnv(env, stagingDepsPath)
    runImpl(python.command, ['-m', 'pip', 'install', '-r', requirementsPath, '--target', stagingDepsPath, '--upgrade'], { env: installerEnv })
    normalizePermissions(stagingDepsPath, env)
    runImpl(python.command, ['-m', 'playwright', 'install', 'chromium'], { env: installerEnv, cwd: path.dirname(requirementsPath) })
    validateBrowserRuntime(python, stagingDepsPath, env, runImpl)
    if (fs.existsSync(depsPath)) normalizePermissions(depsPath, env)
    backupPath = publishStagedDeps(stagingDepsPath, depsPath, options)
    normalizePermissions(depsPath, env)
    validateBrowserRuntime(python, depsPath, env, runImpl)
    cleanupPath(backupPath)
  } catch (error) {
    cleanupPath(stagingDepsPath)
    if (backupPath) restoreBackup(depsPath, backupPath)
    throw error
  }

  return { depsPath, python: python.executable, pythonVersion: python.version }
}

module.exports = {
  REQUIRED_IMPORTS,
  buildInstallerEnv,
  createStagingDepsPath,
  findCompatiblePython,
  getUserPythonDepsPath,
  installBrowserRuntime,
  normalizeRuntimePermissions,
  publishStagedDeps,
  validateBrowserRuntime,
  versionSupported
}
