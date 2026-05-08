import { test, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { detect, getInstallGuidance, repair } = require('../services/openInterpreter/bootstrap')
const manifest = require('../services/openInterpreter/patchManifest')

test('reports missing runtime as recoverable setup guidance', async () => {
  const status = await detect({})
  expect(status.state).toBe('not-installed')
  expect(status.guidance.steps.join(' ')).toContain('outside this repository')
  expect(status.guidance.proposedSetupActions[0].requiresConfirmation).toBe(true)
  expect(status.guidance.proposedSetupActions[0].risk).toBe('high')
})

test('detects configured endpoint without claiming vendored source', async () => {
  const status = await detect({ openInterpreterEndpoint: 'http://127.0.0.1:8756' })
  expect(status.state).toBe('needs-configuration')
  expect(status.endpoint).toBe('http://127.0.0.1:8756')
  expect(manifest.vendoredSource).toBe(false)
  expect(manifest.license).toBe('AGPL-3.0')
})

test('repair returns guidance instead of installing AGPL source', async () => {
  const result = await repair({})
  expect(result.repaired).toBe(false)
  expect(result.message).toContain('does not install or vendor')
  expect(getInstallGuidance({}).proposedSetupActions[0].type).toBe('runtime.setup')
})
