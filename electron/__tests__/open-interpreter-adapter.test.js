import { test, expect, vi, afterEach } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { createOpenInterpreterAdapter } = require('../services/openInterpreter/adapter')
const { toSidecarRequest } = require('../services/openInterpreter/protocol')

afterEach(() => vi.restoreAllMocks())

const action = {
  id: 'act1',
  sessionId: 'sess1',
  runtime: 'open-interpreter',
  type: 'shell.command',
  title: 'Run tests',
  payload: { command: 'npm test' },
  status: 'approved',
  createdAt: '2026-05-08T00:00:00.000Z'
}

test('builds sidecar protocol requests only for supported actions', () => {
  const request = toSidecarRequest(action)
  expect(request.protocol).toBe('aionui.open-interpreter.v1')
  expect(request.approved).toBe(true)
  expect(() => toSidecarRequest({ ...action, type: 'mouse.click' })).toThrow(/不支持/)
})

test('returns recoverable result when runtime is missing', async () => {
  const adapter = createOpenInterpreterAdapter({ storeRef: { getConfig: () => ({}) } })
  const result = await adapter.execute(action)
  expect(result.ok).toBe(false)
  expect(result.metadata.recoverable).toBe(true)
  expect(result.metadata.guidance.proposedSetupActions[0].requiresConfirmation).toBe(true)
})

test('posts approved actions to configured endpoint', async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, stdout: 'done', durationMs: 5 }) }))
  vi.stubGlobal('fetch', fetchMock)
  const adapter = createOpenInterpreterAdapter({ storeRef: { getConfig: () => ({ openInterpreterEndpoint: 'http://127.0.0.1:8756' }) } })
  const result = await adapter.execute(action)
  expect(result.ok).toBe(true)
  expect(result.stdout).toBe('done')
  expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8756/execute', expect.objectContaining({ method: 'POST' }))
})
