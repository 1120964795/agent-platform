import { test, expect } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)

const {
  buildPythonEnv,
  getBundledPythonDepsPath,
  getSetupGuide,
  getUserPythonDepsPath
} = require('../services/pythonBootstrap')

test('getSetupGuide returns instructions when python is missing', () => {
  const steps = getSetupGuide({ python: null, uv: null, browserUse: false, playwright: false, selenium: false })
  expect(steps.length).toBeGreaterThan(0)
  expect(steps.some(s => s.includes('Python 3.11'))).toBe(true)
})

test('getSetupGuide returns ready message when all deps present', () => {
  const steps = getSetupGuide({ python: '/usr/bin/python', uv: null, browserUse: true, playwright: true, selenium: true })
  expect(steps).toEqual(['Python runtime dependencies are ready.'])
})

test('getSetupGuide mentions uv when available', () => {
  const steps = getSetupGuide({ python: '/usr/bin/python', uv: '/usr/bin/uv', browserUse: false, playwright: false, selenium: false })
  expect(steps.some(s => s.includes('uv'))).toBe(true)
})

test('buildPythonEnv prepends user deps then bundled deps before existing PYTHONPATH', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdev-python-env-'))
  try {
    const rootDir = path.join(tmp, 'root')
    const userDeps = path.join(tmp, 'user-deps')
    const bundledDeps = getBundledPythonDepsPath(rootDir)
    fs.mkdirSync(userDeps, { recursive: true })
    fs.mkdirSync(bundledDeps, { recursive: true })

    const env = buildPythonEnv(rootDir, {
      AGENTDEV_PYTHON_DEPS_DIR: userDeps,
      PYTHONPATH: 'existing-path'
    })

    expect(getUserPythonDepsPath(env)).toBe(userDeps)
    expect(env.PYTHONPATH.split(path.delimiter)).toEqual([userDeps, bundledDeps, 'existing-path'])
    expect(env.PYTHONUTF8).toBe('1')
    expect(env.PYTHONIOENCODING).toBe('utf-8')
    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe('0')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
