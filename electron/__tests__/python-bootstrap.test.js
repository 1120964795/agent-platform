import { test, expect } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)

const { getSetupGuide, buildPythonEnv } = require('../services/pythonBootstrap')

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
  expect(steps.some(s => s.includes('uv was detected'))).toBe(true)
})

test('buildPythonEnv prefers packaged browser-use dependencies when present', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdev-python-env-'))
  const depsDir = path.join(rootDir, 'server', 'browser-use-bridge', '.deps')
  fs.mkdirSync(depsDir, { recursive: true })

  try {
    const env = buildPythonEnv(rootDir, { PYTHONPATH: 'existing' })
    expect(env.PYTHONPATH.split(path.delimiter)).toEqual([depsDir, 'existing'])
    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe('0')
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true })
  }
})

test('buildPythonEnv prefers installer-created browser runtime deps before packaged deps', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdev-python-env-'))
  const installedDeps = path.join(rootDir, 'installed-python-deps')
  const bundledDeps = path.join(rootDir, 'server', 'browser-use-bridge', '.deps')
  fs.mkdirSync(installedDeps, { recursive: true })
  fs.mkdirSync(bundledDeps, { recursive: true })

  try {
    const env = buildPythonEnv(rootDir, {
      AGENTDEV_PYTHON_DEPS_DIR: installedDeps,
      PYTHONPATH: 'existing'
    })
    expect(env.PYTHONPATH.split(path.delimiter)).toEqual([installedDeps, bundledDeps, 'existing'])
    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe('0')
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true })
  }
})
