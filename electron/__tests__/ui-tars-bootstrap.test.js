import { test, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { detect, getSetupGuide, repair } = require('../services/uiTars/bootstrap')

test('shows UI-TARS as a default capability before installation', async () => {
  const status = await detect({})
  expect(status.runtime).toBe('ui-tars')
  expect(status.state).toBe('not-installed')
  expect(status.guidance.steps.join(' ')).toContain('UI-TARS')
})

test('detects configured endpoint and screen authorization state', async () => {
  const status = await detect({ uiTarsEndpoint: 'http://127.0.0.1:8765', uiTarsScreenAuthorized: true })
  expect(status.state).toBe('needs-configuration')
  expect(status.endpoint).toBe('http://127.0.0.1:8765')
  expect(status.screenAuthorized).toBe(true)
})

test('setup action is high risk and requires confirmation', () => {
  const guide = getSetupGuide({})
  expect(guide.proposedSetupActions[0].risk).toBe('high')
  expect(guide.proposedSetupActions[0].requiresConfirmation).toBe(true)
})

test('repair gives guidance instead of failing', async () => {
  const result = await repair({})
  expect(result.repaired).toBe(false)
  expect(result.message).toContain('外部运行时')
})
