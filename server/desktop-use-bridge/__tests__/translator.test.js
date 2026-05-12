import { describe, expect, test } from 'vitest'
import { classify } from '../translator'

describe('desktop-use translator', () => {
  test('classifies supported desktop actions', () => {
    expect(classify({ type: 'desktop.observe' })).toEqual({ backend: 'observe' })
    expect(classify({ type: 'desktop.click', payload: { x: 10, y: 20 } })).toEqual({ backend: 'coordinate-click', x: 10, y: 20, button: 'left' })
    expect(classify({ type: 'desktop.click', payload: { target: 'Settings button' } })).toEqual({ backend: 'semantic-click', target: 'Settings button' })
    expect(classify({ type: 'desktop.type', payload: { text: 'hello' } })).toEqual({ backend: 'type', text: 'hello' })
    expect(classify({ type: 'desktop.hotkey', payload: { keys: ['CTRL', 'L'] } })).toEqual({ backend: 'hotkey', keys: ['CTRL', 'L'] })
    expect(classify({ type: 'desktop.scroll', payload: { x: 100, y: 200, direction: 'down', amount: 5 } })).toEqual({ backend: 'scroll', x: 100, y: 200, direction: 'down', amount: 5 })
    expect(classify({ type: 'desktop.wait', payload: { ms: 250 } })).toEqual({ backend: 'wait', ms: 250 })
    expect(classify({ type: 'desktop.task', payload: { goal: 'Open Notepad' } })).toEqual({ backend: 'task', goal: 'Open Notepad', maxSteps: 30 })
  })

  test('classifies explicit desktop task max steps from camel or snake case', () => {
    expect(classify({ type: 'desktop.task', payload: { goal: 'Open Notepad', maxSteps: 8 } })).toEqual({ backend: 'task', goal: 'Open Notepad', maxSteps: 8 })
    expect(classify({ type: 'desktop.task', payload: { goal: 'Open Notepad', max_steps: 9 } })).toEqual({ backend: 'task', goal: 'Open Notepad', maxSteps: 9 })
  })

  test('rejects click without coordinates or target', () => {
    const result = classify({ type: 'desktop.click', payload: {} })
    expect(result.backend).toBe('invalid')
    expect(result.reason).toContain('x/y or target')
  })

  test('rejects empty desktop task goal', () => {
    const result = classify({ type: 'desktop.task', payload: { goal: '  ' } })
    expect(result.backend).toBe('invalid')
    expect(result.reason).toContain('goal')
  })

  test('classifies desktop drag actions', () => {
    expect(classify({ type: 'desktop.drag', payload: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } } })).toMatchObject({
      backend: 'drag',
      from: { x: 1, y: 2 },
      to: { x: 3, y: 4 }
    })
  })

  test('rejects unknown desktop action', () => {
    const result = classify({ type: 'desktop.fly', payload: {} })
    expect(result.backend).toBe('invalid')
    expect(result.reason).toContain('Unsupported')
  })
})
