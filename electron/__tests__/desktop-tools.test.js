import { test, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  vi.clearAllMocks()
})

const { TOOL_SCHEMAS } = require('../tools')
const toolPolicy = require('../security/toolPolicy')

test('desktop_observe is registered', () => {
  const schema = TOOL_SCHEMAS.find(s => s.name === 'desktop_observe')
  expect(schema).toBeDefined()
})

test('desktop_click is registered', () => {
  const schema = TOOL_SCHEMAS.find(s => s.name === 'desktop_click')
  expect(schema).toBeDefined()
  expect(schema.parameters.required).toContain('target')
})

test('desktop_type is registered', () => {
  const schema = TOOL_SCHEMAS.find(s => s.name === 'desktop_type')
  expect(schema).toBeDefined()
  expect(schema.parameters.required).toContain('text')
})

test('desktop_observe policy is LOW risk (no approval)', () => {
  const d = toolPolicy.evaluateToolCall('desktop_observe', {})
  expect(d.risk).toBe('low')
  expect(d.requiresApproval).toBe(false)
})

test('desktop_click policy is HIGH risk (requires approval)', () => {
  const d = toolPolicy.evaluateToolCall('desktop_click', { target: 'test' })
  expect(d.risk).toBe('high')
  expect(d.requiresApproval).toBe(true)
})

test('desktop_type policy is MEDIUM risk without approval', () => {
  const d = toolPolicy.evaluateToolCall('desktop_type', { text: 'hello' })
  expect(d.risk).toBe('medium')
  expect(d.requiresApproval).toBe(false)
})

test('desktop_observe returns screenshot on success', async () => {
  fetchMock
    .mockResolvedValueOnce({ json: async () => ({ ok: true, runtime: 'ui-tars' }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, exitCode: 0, metadata: { screenshotBase64: 'abc' }, durationMs: 100 }),
    })

  const { desktopObserve } = require('../tools/desktopObserve')
  const result = await desktopObserve({}, { skipInternalConfirm: true })
  expect(result.screenshot_base64).toBe('abc')
  expect(result.mime).toBe('image/png')
  expect(result.duration_ms).toBe(100)
})

test('desktop_click rejects empty target', async () => {
  const { desktopClick } = require('../tools/desktopClick')
  const result = await desktopClick({}, { skipInternalConfirm: true })
  expect(result.error).toBeDefined()
  expect(result.error.code).toBe('INVALID_ARGS')
})

test('desktop_type rejects empty text', async () => {
  const { desktopType } = require('../tools/desktopType')
  const result = await desktopType({}, { skipInternalConfirm: true })
  expect(result.error).toBeDefined()
  expect(result.error.code).toBe('INVALID_ARGS')
})
