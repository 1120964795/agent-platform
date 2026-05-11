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

  test('fails safely for unsupported planner action', async () => {
    const driver = createDriver()
    const planner = { nextAction: vi.fn(async () => ({ type: 'deleteEverything' })) }
    const runner = createAgentRunner({ driver, planner })

    const result = await runner.runTask({ goal: 'bad action', maxSteps: 1 })

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('UNSUPPORTED_PLANNER_ACTION')
    expect(driver.click).not.toHaveBeenCalled()
  })
})
