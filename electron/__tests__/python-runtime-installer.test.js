import { afterEach, test, expect } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)

let tmpRoot
const fakePython = { command: 'python.exe', args: [], executable: 'C:\\Python312\\python.exe', version: '3.12.0' }

function loadInstaller() {
  const modulePath = require.resolve('../services/pythonRuntimeInstaller')
  delete require.cache[modulePath]
  return require(modulePath)
}

function makeRuntimePaths() {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdev-runtime-installer-'))
  const bridgeDir = path.join(tmpRoot, 'server', 'browser-use-bridge')
  fs.mkdirSync(bridgeDir, { recursive: true })
  const requirementsPath = path.join(bridgeDir, 'requirements.txt')
  fs.writeFileSync(requirementsPath, 'browser-use>=0.10.0\nplaywright>=1.40.0\nselenium>=4.20.0\n')
  return {
    rootDir: tmpRoot,
    bridgeDir,
    requirementsPath,
    depsPath: path.join(tmpRoot, 'runtime', '.deps')
  }
}

afterEach(() => {
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true })
  tmpRoot = null
})

test('runtime import checks include FastAPI because the bridge imports it at startup', () => {
  const installer = loadInstaller()

  expect(installer.REQUIRED_IMPORTS.map((item) => item.key)).toEqual(expect.arrayContaining([
    'browserUse',
    'playwright',
    'selenium',
    'fastapi'
  ]))
})

test('installBrowserRuntime does not publish partial dependencies when install fails', () => {
  const { rootDir, requirementsPath, depsPath } = makeRuntimePaths()
  fs.mkdirSync(depsPath, { recursive: true })
  fs.writeFileSync(path.join(depsPath, 'existing.txt'), 'old')
  const calls = []
  const runImpl = (command, args, options) => {
    calls.push({ command, args, options })
    const targetIndex = args.indexOf('--target')
    if (targetIndex !== -1) {
      const target = args[targetIndex + 1]
      fs.mkdirSync(target, { recursive: true })
      fs.writeFileSync(path.join(target, 'partial.txt'), 'new')
    }
    if (args.includes('playwright')) throw new Error('playwright install failed')
  }

  const installer = loadInstaller()
  expect(() => installer.installBrowserRuntime({
    rootDir,
    depsPath,
    requirementsPath,
    env: { PATH: 'test-path' },
    allowPythonInstall: false,
    findPython: () => fakePython,
    runImpl
  })).toThrow()

  expect(fs.readFileSync(path.join(depsPath, 'existing.txt'), 'utf-8')).toBe('old')
  expect(fs.existsSync(path.join(depsPath, 'partial.txt'))).toBe(false)
  const pipCall = calls.find((call) => call.args.includes('pip'))
  expect(pipCall).toBeDefined()
  const pipTarget = pipCall.args[pipCall.args.indexOf('--target') + 1]
  expect(pipTarget).not.toBe(depsPath)
  expect(path.dirname(pipTarget)).toBe(path.dirname(depsPath))
  expect(path.basename(pipTarget)).toMatch(/^\.deps-staging-/)
})

test('installBrowserRuntime publishes staged dependencies only after successful validation', () => {
  const { rootDir, requirementsPath, depsPath } = makeRuntimePaths()
  const calls = []
  const runImpl = (command, args, options) => {
    calls.push({ command, args, options })
    const targetIndex = args.indexOf('--target')
    if (targetIndex !== -1) {
      const target = args[targetIndex + 1]
      fs.mkdirSync(target, { recursive: true })
      fs.writeFileSync(path.join(target, 'installed.txt'), 'ready')
    }
  }

  const installer = loadInstaller()
  const result = installer.installBrowserRuntime({
    rootDir,
    depsPath,
    requirementsPath,
    env: { PATH: 'test-path', PYTHONPATH: 'existing-pythonpath' },
    allowPythonInstall: false,
    findPython: () => fakePython,
    runImpl,
    normalizePermissionsImpl: (target, env) => {
      calls.push({ command: 'icacls', args: [target], options: { env } })
    }
  })

  expect(result.depsPath).toBe(depsPath)
  expect(fs.readFileSync(path.join(depsPath, 'installed.txt'), 'utf-8')).toBe('ready')
  const pipCall = calls.find((call) => call.args.includes('pip'))
  expect(pipCall).toBeDefined()
  const pipTarget = pipCall.args[pipCall.args.indexOf('--target') + 1]
  expect(pipTarget).not.toBe(depsPath)
  for (const call of calls.filter((item) => item.command !== 'icacls')) {
    expect(call.options.env.PYTHONUTF8).toBe('1')
    expect(call.options.env.PYTHONIOENCODING).toBe('utf-8')
  }
  expect(calls.some((call) => call.command === 'icacls')).toBe(process.platform === 'win32')
})
