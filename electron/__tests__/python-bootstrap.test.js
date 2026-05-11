import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const { detect, getSetupGuide } = require('../services/pythonBootstrap')

test('getSetupGuide returns instructions when python is missing', () => {
  const steps = getSetupGuide({ python: null, uv: null, browserUse: false, playwright: false })
  expect(steps.length).toBeGreaterThan(0)
  expect(steps.some(s => s.includes('Python 3.11'))).toBe(true)
})

test('getSetupGuide returns ready message when all deps present', () => {
  const steps = getSetupGuide({ python: '/usr/bin/python', uv: null, browserUse: true, playwright: true })
  expect(steps).toEqual(['Python 环境已就绪。'])
})

test('getSetupGuide mentions uv when available', () => {
  const steps = getSetupGuide({ python: '/usr/bin/python', uv: '/usr/bin/uv', browserUse: false, playwright: false })
  expect(steps.some(s => s.includes('uv pip install'))).toBe(true)
})
