import { describe, expect, test, vi } from 'vitest'
import { buildPlannerMessages, createPlanner, normalizeAction, ALLOWED_ACTION_TYPES } from '../planner'

const observation = {
  screenshotBase64: 'abc123',
  mime: 'image/png',
  screen: { width: 2560, height: 1440, scaleFactor: 1.25, nativeWidth: 2048, nativeHeight: 1152 }
}

describe('desktop planner', () => {
  test('builds a multimodal message with screenshot image data', () => {
    const messages = buildPlannerMessages({ goal: 'open notepad', step: 2, maxSteps: 8, observation, steps: [] })

    expect(messages[0].role).toBe('system')
    expect(messages[1].role).toBe('user')
    expect(messages[1].content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('open notepad') }),
      expect.objectContaining({ type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } })
    ]))
  })

  test('normalizes new planner actions', () => {
    expect(normalizeAction({ action: 'scroll', x: 10, y: 20, direction: 'down', amount: 4, confidence: 0.8 }).type).toBe('scroll')
    expect(normalizeAction({ action: 'drag', from: { x: 1, y: 2 }, to: { x: 3, y: 4 }, confidence: 0.9 }).type).toBe('drag')
    expect(normalizeAction({ action: 'ask_user', question: 'Please log in', confidence: 0.95 }).type).toBe('ask_user')
  })

  test('builds strict low-level action contract into the prompt', () => {
    const messages = buildPlannerMessages({ goal: 'open QQ', step: 1, maxSteps: 6, observation, steps: [] })
    const text = messages[1].content.find(part => part.type === 'text').text

    expect(ALLOWED_ACTION_TYPES).toEqual(['click', 'type', 'hotkey', 'wait', 'scroll', 'drag', 'ask_user', 'done', 'fail'])
    expect(text).toContain('Allowed actions: click, type, hotkey, wait, scroll, drag, ask_user, done, fail')
    expect(text).toContain('Do not return open_app')
    expect(text).toContain('Do not return search_contact')
    expect(text).toContain('Do not return send_message')
    expect(text).toContain('Break high-level intentions into low-level desktop actions')
  })

  test('includes correction context after unsupported planner output', () => {
    const correction = {
      code: 'UNSUPPORTED_PLANNER_ACTION',
      message: 'Unsupported planner action: open_app',
      allowedActions: ALLOWED_ACTION_TYPES,
      rawAction: { action: 'open_app', app: 'QQ' },
      invalidActionName: 'open_app'
    }
    const messages = buildPlannerMessages({ goal: 'open QQ', step: 1, maxSteps: 6, observation, steps: [], correction })
    const text = messages[1].content.find(part => part.type === 'text').text

    expect(text).toContain('Previous planner output was invalid')
    expect(text).toContain('Unsupported planner action: open_app')
    expect(text).toContain('"action":"open_app"')
    expect(text).toContain('Return a replacement action using only the allowed actions')
  })

  test('normalizes unsupported actions with raw output preserved', () => {
    const raw = { action: 'open_app', app: 'QQ', reason: 'Need to launch QQ' }
    const action = normalizeAction(raw)

    expect(action.type).toBe('unsupported')
    expect(action.raw).toBe(raw)
    expect(action.unsupportedAction).toBe('open_app')
  })

  test('planner sends response format and parses JSON action', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"action":"done","summary":"finished"}' } }] })
    }))
    const planner = createPlanner({
      fetchImpl,
      env: {
        DESKTOP_USE_MODEL_API_KEY: 'key',
        DESKTOP_USE_MODEL_ENDPOINT: 'https://example.test',
        DESKTOP_USE_MODEL_NAME: 'vision-model'
      }
    })

    const action = await planner.nextAction({ goal: 'finish', step: 1, maxSteps: 3, observation, steps: [] })

    expect(action).toEqual(expect.objectContaining({ type: 'done', summary: 'finished' }))
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.model).toBe('vision-model')
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages[1].content[1].image_url.url).toBe('data:image/png;base64,abc123')
  })
})
