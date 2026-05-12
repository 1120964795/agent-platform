import { describe, expect, test, vi } from 'vitest'
import { createAgentRunner } from '../agentRunner'

function createDriver() {
  return {
    observe: vi.fn(async () => ({ screenshotBase64: 'img', mime: 'image/png', screen: { width: 100, height: 80, scaleFactor: 1 } })),
    click: vi.fn(async (args) => ({ ok: true, action: { type: 'click', ...args } })),
    type: vi.fn(async (args) => ({ ok: true, action: { type: 'type', ...args } })),
    hotkey: vi.fn(async (args) => ({ ok: true, action: { type: 'hotkey', ...args } })),
    wait: vi.fn(async (args) => ({ ok: true, action: { type: 'wait', ...args } })),
  }
}

describe('desktop agent runner', () => {
  test('executes planned actions until done', async () => {
    const driver = createDriver()
    const planner = {
      nextAction: vi.fn()
        .mockResolvedValueOnce({ type: 'click', x: 10, y: 20, reason: 'open target' })
        .mockResolvedValueOnce({ type: 'done', summary: 'opened target' })
    }
    const events = []
    const runner = createAgentRunner({ driver, planner })

    const result = await runner.runTask({ goal: 'open target', maxSteps: 4, onEvent: event => events.push(event) })

    expect(result.ok).toBe(true)
    expect(result.summary).toBe('opened target')
    expect(driver.click).toHaveBeenCalledWith({ x: 10, y: 20, button: 'left' })
    expect(events.some(event => event.type === 'cursor.move')).toBe(true)
    expect(events.some(event => event.type === 'cursor.click')).toBe(true)
  })

  test('uses 30 max steps by default', async () => {
    const driver = createDriver()
    const planner = { nextAction: vi.fn(async () => ({ type: 'done', summary: 'done' })) }
    const events = []
    const runner = createAgentRunner({ driver, planner })

    const result = await runner.runTask({ goal: 'default budget', onEvent: event => events.push(event) })

    expect(result.ok).toBe(true)
    expect(planner.nextAction).toHaveBeenCalledWith(expect.objectContaining({ maxSteps: 30 }))
    expect(events[0]).toEqual(expect.objectContaining({ type: 'task_started', maxSteps: 30 }))
  })

  test('fails safely after retrying unsupported planner actions once', async () => {
    const driver = createDriver()
    const planner = { nextAction: vi.fn(async () => ({ action: 'deleteEverything' })) }
    const events = []
    const runner = createAgentRunner({ driver, planner })

    const result = await runner.runTask({ goal: 'bad action', maxSteps: 1, onEvent: event => events.push(event) })

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('UNSUPPORTED_PLANNER_ACTION')
    expect(result.error.allowedActions).toContain('click')
    expect(result.error.rawAction).toEqual({ action: 'deleteEverything' })
    expect(result.error.retryAttempted).toBe(true)
    expect(planner.nextAction).toHaveBeenCalledTimes(2)
    expect(planner.nextAction.mock.calls[1][0].correction).toEqual(expect.objectContaining({
      code: 'UNSUPPORTED_PLANNER_ACTION',
      invalidActionName: 'deleteeverything',
      rawAction: { action: 'deleteEverything' }
    }))
    expect(events.some(event => event.type === 'planner_correction')).toBe(true)
    expect(driver.click).not.toHaveBeenCalled()
  })

  test('retries unsupported planner action and executes valid replacement', async () => {
    const driver = createDriver()
    const planner = {
      nextAction: vi.fn()
        .mockResolvedValueOnce({ action: 'open_app', app: 'QQ', reason: 'Need QQ' })
        .mockResolvedValueOnce({ action: 'click', x: 10, y: 20, confidence: 0.9, reason: 'Click visible QQ result' })
        .mockResolvedValueOnce({ action: 'done', summary: 'opened QQ' })
    }
    const events = []
    const runner = createAgentRunner({ driver, planner })

    const result = await runner.runTask({ goal: 'open QQ', maxSteps: 4, onEvent: event => events.push(event) })

    expect(result.ok).toBe(true)
    expect(result.summary).toBe('opened QQ')
    expect(driver.click).toHaveBeenCalledWith({ x: 10, y: 20, button: 'left' })
    expect(planner.nextAction.mock.calls[1][0].correction).toEqual(expect.objectContaining({
      invalidActionName: 'open_app',
      rawAction: { action: 'open_app', app: 'QQ', reason: 'Need QQ' }
    }))
    expect(events.find(event => event.type === 'planner_correction')).toEqual(expect.objectContaining({
      code: 'UNSUPPORTED_PLANNER_ACTION',
      rawAction: { action: 'open_app', app: 'QQ', reason: 'Need QQ' }
    }))
  })

  test('emits observe plan action verify and terminal events in order', async () => {
    const driver = createDriver()
    driver.scroll = vi.fn(async (args) => ({ ok: true, action: { type: 'scroll', ...args } }))
    const planner = {
      nextAction: vi.fn()
        .mockResolvedValueOnce({ type: 'scroll', x: 5, y: 6, direction: 'down', amount: 2, confidence: 0.8, userVisibleSummary: 'scrolling' })
        .mockResolvedValueOnce({ type: 'done', summary: 'done' })
    }
    const events = []
    const runner = createAgentRunner({ driver, planner })

    const result = await runner.runTask({ goal: 'scroll page', maxSteps: 3, onEvent: event => events.push(event) })

    expect(result.ok).toBe(true)
    expect(events.map(event => event.type)).toEqual(expect.arrayContaining(['task_started', 'observe', 'plan', 'cursor_move', 'action_start', 'action_result', 'verify', 'done']))
    expect(driver.scroll).toHaveBeenCalledWith({ x: 5, y: 6, direction: 'down', amount: 2 })
  })

  test('asks the user and resumes after answer', async () => {
    const driver = createDriver()
    const planner = {
      nextAction: vi.fn()
        .mockResolvedValueOnce({ type: 'ask_user', question: 'Please log in', confidence: 1 })
        .mockResolvedValueOnce({ type: 'done', summary: 'continued' })
    }
    const events = []
    const runner = createAgentRunner({ driver, planner })

    const result = await runner.runTask({
      goal: 'send message',
      maxSteps: 3,
      onEvent: event => events.push(event),
      waitForUser: vi.fn(async () => 'logged in, continue')
    })

    expect(result.ok).toBe(true)
    expect(events.some(event => event.type === 'ask_user')).toBe(true)
    expect(events.some(event => event.type === 'resumed')).toBe(true)
    expect(planner.nextAction.mock.calls[1][0].userReplies.at(-1).answer).toBe('logged in, continue')
  })

  test('does not execute low confidence pointer actions', async () => {
    const driver = createDriver()
    const planner = { nextAction: vi.fn(async () => ({ type: 'click', x: 10, y: 20, confidence: 0.3, reason: 'not sure' })) }
    const runner = createAgentRunner({ driver, planner })

    const result = await runner.runTask({ goal: 'click maybe', maxSteps: 1 })

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('LOW_CONFIDENCE_ACTION')
    expect(driver.click).not.toHaveBeenCalled()
  })
})
