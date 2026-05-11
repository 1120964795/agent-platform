import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const { healthCheckMock, executeMock, requestConfirmMock } = vi.hoisted(() => ({
  healthCheckMock: vi.fn(async () => ({ available: true, detail: { ok: true } })),
  executeMock: vi.fn(async () => ({ ok: true, summary: 'done', final_url: 'https://example.com' })),
  requestConfirmMock: vi.fn(async () => true),
}))

vi.mock('../services/browserUse/adapter', () => ({
  healthCheck: healthCheckMock,
  execute: executeMock,
  cancel: vi.fn(),
}))

vi.mock('../confirm', () => ({
  requestConfirm: requestConfirmMock,
}))

const { TOOL_SCHEMAS } = require('../tools')
const toolPolicy = require('../security/toolPolicy')

test('browser_task is registered in tool registry', () => {
  const browserTaskSchema = TOOL_SCHEMAS.find(s => s.name === 'browser_task')
  expect(browserTaskSchema).toBeDefined()
  expect(browserTaskSchema.parameters.required).toContain('goal')
})

test('browser_task tool policy returns medium risk without approval', () => {
  const decision = toolPolicy.evaluateToolCall('browser_task', { goal: 'test' })
  expect(decision.risk).toBe('medium')
  expect(decision.allowed).toBe(true)
  expect(decision.requiresApproval).toBe(false)
})

test('browser_task rejects empty goal', async () => {
  const { browserTask } = require('../tools/browserTask')
  const result = await browserTask({}, { skipInternalConfirm: true })
  expect(result.error).toBeDefined()
  expect(result.error.code).toBe('INVALID_ARGS')
})
