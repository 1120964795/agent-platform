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
  expect(schema.parameters.properties.target).toBeDefined()
  expect(schema.parameters.properties.x).toBeDefined()
  expect(schema.parameters.properties.y).toBeDefined()
})

test('desktop_type is registered', () => {
  const schema = TOOL_SCHEMAS.find(s => s.name === 'desktop_type')
  expect(schema).toBeDefined()
  expect(schema.parameters.required).toContain('text')
})

test('new desktop-use tools are registered', () => {
  for (const [name, required] of [
    ['desktop_hotkey', 'keys'],
    ['desktop_scroll', null],
    ['desktop_wait', null],
    ['desktop_task', 'goal'],
  ]) {
    const schema = TOOL_SCHEMAS.find(s => s.name === name)
    expect(schema).toBeDefined()
    if (required) expect(schema.parameters.required).toContain(required)
  }
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

test('desktop_type policy is HIGH risk with approval', () => {
  const d = toolPolicy.evaluateToolCall('desktop_type', { text: 'hello' })
  expect(d.risk).toBe('high')
  expect(d.requiresApproval).toBe(true)
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

test('desktop_click accepts explicit coordinates', async () => {
  fetchMock
    .mockResolvedValueOnce({ json: async () => ({ ok: true, runtime: 'desktop-use' }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, exitCode: 0, metadata: { action: { type: 'click' } }, durationMs: 40 }),
    })

  const { desktopClick } = require('../tools/desktopClick')
  const result = await desktopClick({ x: 10, y: 20 }, { skipInternalConfirm: true })

  expect(result.x).toBe(10)
  expect(result.y).toBe(20)
  const body = JSON.parse(fetchMock.mock.calls[1][1].body)
  expect(body.type).toBe('desktop.click')
  expect(body.payload).toMatchObject({ x: 10, y: 20 })
})

test('desktop_type rejects empty text', async () => {
  const { desktopType } = require('../tools/desktopType')
  const result = await desktopType({}, { skipInternalConfirm: true })
  expect(result.error).toBeDefined()
  expect(result.error.code).toBe('INVALID_ARGS')
})

test('desktop_hotkey rejects empty keys', async () => {
  const { desktopHotkey } = require('../tools/desktopHotkey')
  const result = await desktopHotkey({}, { skipInternalConfirm: true })
  expect(result.error).toBeDefined()
  expect(result.error.code).toBe('INVALID_ARGS')
})

test('desktop_task rejects empty goal', async () => {
  const { desktopTask } = require('../tools/desktopTask')
  const result = await desktopTask({}, { skipInternalConfirm: true })
  expect(result.error).toBeDefined()
  expect(result.error.code).toBe('INVALID_ARGS')
})

test('desktop_task forwards live desktop events from the bridge', async () => {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"observe","summary":"Looking"}\n\n'))
      controller.close()
    }
  })
  fetchMock
    .mockResolvedValueOnce({ json: async () => ({ ok: true, runtime: 'desktop-use' }) })
    .mockResolvedValueOnce({ ok: true, body: stream })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, exitCode: 0, metadata: { summary: 'done' }, durationMs: 40 }),
    })

  const events = []
  const { desktopTask } = require('../tools/desktopTask')
  const result = await desktopTask(
    { goal: 'Open Notepad' },
    { skipInternalConfirm: true, sessionId: 'tool-live', onDesktopEvent: event => events.push(event) }
  )

  expect(result.metadata.summary).toBe('done')
  expect(events).toContainEqual(expect.objectContaining({ type: 'observe', summary: 'Looking' }))
})

test('desktop_scroll and desktop_wait call the desktop-use bridge', async () => {
  fetchMock
    .mockResolvedValueOnce({ json: async () => ({ ok: true, runtime: 'desktop-use' }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, metadata: { action: { type: 'scroll' } }, durationMs: 20 }),
    })
    .mockResolvedValueOnce({ json: async () => ({ ok: true, runtime: 'desktop-use' }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, metadata: { action: { type: 'wait' } }, durationMs: 30 }),
    })

  const { desktopScroll } = require('../tools/desktopScroll')
  const { desktopWait } = require('../tools/desktopWait')

  const scroll = await desktopScroll({ direction: 'down', amount: 4 }, { skipInternalConfirm: true })
  const wait = await desktopWait({ ms: 250 }, { skipInternalConfirm: true })

  expect(scroll.metadata.action.type).toBe('scroll')
  expect(wait.metadata.action.type).toBe('wait')
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).type).toBe('desktop.scroll')
  expect(JSON.parse(fetchMock.mock.calls[3][1].body).type).toBe('desktop.wait')
})
