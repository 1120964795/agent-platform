import { test, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  vi.clearAllMocks()
})

const { healthCheck, execute } = require('../services/desktop/adapter')

test('healthCheck returns available when bridge responds ok', async () => {
  fetchMock.mockResolvedValueOnce({
    json: async () => ({ ok: true, runtime: 'ui-tars', agentReady: true }),
  })

  const result = await healthCheck()
  expect(result.available).toBe(true)
})

test('healthCheck returns unavailable on fetch error', async () => {
  fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))

  const result = await healthCheck()
  expect(result.available).toBe(false)
})

test('execute returns ok on successful bridge response', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      ok: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
      metadata: { screenshotBase64: 'abc123', mime: 'image/png' },
      durationMs: 500,
    }),
  })

  const result = await execute({ type: 'screen.observe', payload: {} })
  expect(result.ok).toBe(true)
  expect(result.metadata.screenshotBase64).toBe('abc123')
})

test('execute returns BRIDGE_UNREACHABLE on fetch error', async () => {
  fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))

  const result = await execute({ type: 'mouse.click', payload: { target: 'button' } })
  expect(result.ok).toBe(false)
  expect(result.error.code).toBe('BRIDGE_UNREACHABLE')
})
