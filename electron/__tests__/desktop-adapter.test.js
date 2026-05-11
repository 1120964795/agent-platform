import { beforeEach, expect, test, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  vi.clearAllMocks()
})

const { healthCheck, execute, cancel, endpoint, PORT } = require('../services/desktop/adapter')

test('desktop adapter points to the desktop-use bridge', () => {
  expect(PORT).toBe(8790)
  expect(endpoint()).toBe('http://127.0.0.1:8790')
})

test('healthCheck returns available when desktop-use responds ok', async () => {
  fetchMock.mockResolvedValueOnce({
    json: async () => ({ ok: true, runtime: 'desktop-use', ready: true }),
  })

  const result = await healthCheck()
  expect(result.available).toBe(true)
  expect(result.detail.runtime).toBe('desktop-use')
})

test('execute posts desktop-use action with approval and session id', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      ok: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
      metadata: { action: { type: 'hotkey' } },
      durationMs: 12,
    }),
  })

  const result = await execute(
    { type: 'desktop.hotkey', payload: { keys: ['CTRL', 'S'] } },
    { sessionId: 'conversation-1' }
  )

  expect(result.ok).toBe(true)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, request] = fetchMock.mock.calls[0]
  expect(url).toBe('http://127.0.0.1:8790/execute')
  expect(request.method).toBe('POST')
  expect(JSON.parse(request.body)).toMatchObject({
    type: 'desktop.hotkey',
    payload: { keys: ['CTRL', 'S'] },
    approved: true,
    sessionId: 'conversation-1',
  })
  expect(JSON.parse(request.body).actionId).toMatch(/^desktop-/)
})

test('execute subscribes to desktop event stream and forwards events', async () => {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"observe","summary":"Looking"}\n\n'))
      controller.close()
    }
  })
  fetchMock
    .mockResolvedValueOnce({ ok: true, body: stream })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, exitCode: 0, metadata: { summary: 'done' } }) })
  const events = []

  const result = await execute(
    { type: 'desktop.task', payload: { goal: 'Open Notepad' } },
    { sessionId: 'conversation-events', onEvent: event => events.push(event) }
  )

  expect(result.ok).toBe(true)
  expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8790/events/conversation-events')
  expect(events).toContainEqual(expect.objectContaining({ type: 'observe', summary: 'Looking' }))
})

test('execute answers ask_user events through resume endpoint', async () => {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"ask_user","requestId":"ask-1","question":"Continue?"}\n\n'))
      controller.close()
    }
  })
  fetchMock
    .mockResolvedValueOnce({ ok: true, body: stream })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, exitCode: 0, metadata: { summary: 'done' } }) })

  await execute(
    { type: 'desktop.task', payload: { goal: 'Continue task' } },
    { sessionId: 'conversation-ask', waitForUser: vi.fn(async () => 'continue') }
  )

  expect(fetchMock).toHaveBeenCalledWith(
    'http://127.0.0.1:8790/resume',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ sessionId: 'conversation-ask', requestId: 'ask-1', answer: 'continue' })
    })
  )
})

test('execute cancels the desktop-use task when aborted', async () => {
  const controller = new AbortController()
  fetchMock.mockImplementationOnce((_url, request) => {
    expect(request.signal).toBe(controller.signal)
    controller.abort()
    return Promise.reject(new DOMException('Aborted', 'AbortError'))
  })
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })

  const result = await execute(
    { type: 'desktop.task', payload: { goal: 'Open Notepad' } },
    { signal: controller.signal, sessionId: 'conversation-2' }
  )

  expect(result.ok).toBe(false)
  expect(result.error.code).toBe('ABORTED')
  expect(fetchMock).toHaveBeenCalledWith(
    'http://127.0.0.1:8790/cancel',
    expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'conversation-2' }),
    })
  )
})

test('cancel posts session cancellation to desktop-use bridge', async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })

  const result = await cancel({ sessionId: 'conversation-3' })

  expect(result.ok).toBe(true)
  expect(fetchMock).toHaveBeenCalledWith(
    'http://127.0.0.1:8790/cancel',
    expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'conversation-3' }),
    })
  )
})
