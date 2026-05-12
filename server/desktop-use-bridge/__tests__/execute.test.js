import request from 'supertest'
import { describe, expect, test, vi } from 'vitest'
import { createApp } from '../index'

function createDriver() {
  return {
    observe: vi.fn(async () => ({ screenshotBase64: 'abc123', mime: 'image/png', screen: { width: 100, height: 80, scaleFactor: 1 } })),
    click: vi.fn(async (args) => ({ ok: true, action: { type: 'click', ...args } })),
    type: vi.fn(async (args) => ({ ok: true, action: { type: 'type', ...args } })),
    hotkey: vi.fn(async (args) => ({ ok: true, action: { type: 'hotkey', ...args } })),
    scroll: vi.fn(async (args) => ({ ok: true, action: { type: 'scroll', ...args } })),
    wait: vi.fn(async (args) => ({ ok: true, action: { type: 'wait', ...args } })),
  }
}

describe('desktop-use bridge endpoints', () => {
  test('health reports runtime', async () => {
    const app = createApp({ driver: createDriver(), agentRunner: { ready: () => true } })
    const response = await request(app).get('/health')
    expect(response.body).toEqual({ ok: true, runtime: 'desktop-use', version: '0.1.0', ready: true })
  })

  test('execute rejects unapproved actions', async () => {
    const app = createApp({ driver: createDriver() })
    const response = await request(app).post('/execute').send({ type: 'desktop.observe', approved: false })
    expect(response.status).toBe(403)
    expect(response.body.ok).toBe(false)
  })

  test('observe returns screenshot metadata', async () => {
    const driver = createDriver()
    const app = createApp({ driver })
    const response = await request(app).post('/execute').send({ type: 'desktop.observe', approved: true })
    expect(response.body.ok).toBe(true)
    expect(response.body.metadata.screenshotBase64).toBe('abc123')
    expect(driver.observe).toHaveBeenCalled()
  })

  test('click/type/hotkey/scroll/wait dispatch to driver', async () => {
    const driver = createDriver()
    const app = createApp({ driver })

    await request(app).post('/execute').send({ type: 'desktop.click', approved: true, payload: { x: 1, y: 2 } })
    await request(app).post('/execute').send({ type: 'desktop.type', approved: true, payload: { text: 'hello' } })
    await request(app).post('/execute').send({ type: 'desktop.hotkey', approved: true, payload: { keys: ['CTRL', 'S'] } })
    await request(app).post('/execute').send({ type: 'desktop.scroll', approved: true, payload: { direction: 'down', amount: 4 } })
    await request(app).post('/execute').send({ type: 'desktop.wait', approved: true, payload: { ms: 25 } })

    expect(driver.click).toHaveBeenCalledWith({ x: 1, y: 2, button: 'left' })
    expect(driver.type).toHaveBeenCalledWith({ text: 'hello' })
    expect(driver.hotkey).toHaveBeenCalledWith({ keys: ['CTRL', 'S'] })
    expect(driver.scroll).toHaveBeenCalledWith({ x: 0, y: 0, direction: 'down', amount: 4 })
    expect(driver.wait).toHaveBeenCalledWith({ ms: 25 })
  })

  test('desktop task and cancel dispatch to agent runner', async () => {
    const agentRunner = {
      ready: () => true,
      runTask: vi.fn(async (task) => ({ ok: true, summary: `done ${task.goal}`, steps: [] })),
      cancel: vi.fn(async () => ({ ok: true })),
    }
    const app = createApp({ driver: createDriver(), agentRunner })

    const execute = await request(app).post('/execute').send({ type: 'desktop.task', approved: true, payload: { goal: 'Open Notepad' } })
    const cancel = await request(app).post('/cancel').send({})

    expect(execute.body.ok).toBe(true)
    expect(execute.body.metadata.summary).toBe('done Open Notepad')
    expect(execute.body.metadata.events).toEqual([])
    expect(agentRunner.runTask).toHaveBeenCalledWith(expect.objectContaining({ goal: 'Open Notepad', maxSteps: 30 }))
    expect(cancel.body.ok).toBe(true)
    expect(agentRunner.cancel).toHaveBeenCalled()
  })

  test('desktop drag dispatches to driver', async () => {
    const driver = createDriver()
    driver.drag = vi.fn(async (args) => ({ ok: true, action: { type: 'drag', ...args } }))
    const app = createApp({ driver })

    await request(app).post('/execute').send({ type: 'desktop.drag', approved: true, payload: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } } })

    expect(driver.drag).toHaveBeenCalledWith({ from: { x: 1, y: 2 }, to: { x: 3, y: 4 }, durationMs: 300 })
  })

  test('desktop task publishes live events to session event stream', async () => {
    const agentRunner = {
      ready: () => true,
      runTask: vi.fn(async ({ onEvent }) => {
        onEvent({ type: 'task_started', summary: 'started' })
        onEvent({ type: 'done', summary: 'finished' })
        return { ok: true, summary: 'finished', steps: [] }
      }),
      cancel: vi.fn(async () => ({ ok: true })),
    }
    const app = createApp({ driver: createDriver(), agentRunner })
    const server = app.listen(0)
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    let reader
    try {
      const events = []
      const eventResponse = await fetch(`${baseUrl}/events/session-live`)
      reader = eventResponse.body.getReader()
      const executePromise = fetch(`${baseUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'desktop.task', approved: true, sessionId: 'session-live', payload: { goal: 'Open Notepad' } })
      })
      const decoder = new TextDecoder()
      while (events.length < 2) {
        const chunk = await reader.read()
        events.push(...decoder.decode(chunk.value).split('\n\n').filter(Boolean))
      }
      const executeResponse = await executePromise
      expect((await executeResponse.json()).ok).toBe(true)
      expect(events.join('\n')).toContain('task_started')
      expect(events.join('\n')).toContain('done')
    } finally {
      await reader?.cancel().catch(() => null)
      server.close()
    }
  })

  test('resume endpoint answers pending ask_user request', async () => {
    const app = createApp({ driver: createDriver() })
    const hub = app.locals.eventHub
    const pending = hub.waitForUser({ sessionId: 'session-resume', requestId: 'ask-1', question: 'Continue?' })

    const response = await request(app).post('/resume').send({ sessionId: 'session-resume', requestId: 'ask-1', answer: 'continue' })

    await expect(pending).resolves.toBe('continue')
    expect(response.body.ok).toBe(true)
  })
})
