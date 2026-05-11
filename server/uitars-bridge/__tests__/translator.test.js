import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { classify } = require('../translator')

describe('uitars-bridge translator', () => {
  it('routes screen.observe to screenshot', () => {
    expect(classify({ type: 'screen.observe' }).backend).toBe('screenshot')
  })

  it('routes mouse.click with target text to model+nutjs', () => {
    const r = classify({ type: 'mouse.click', payload: { target: 'Login button' } })
    expect(r.backend).toBe('semantic-click')
    expect(r.instruction).toBe('Login button')
  })

  it('routes keyboard.type direct (no model)', () => {
    const r = classify({ type: 'keyboard.type', payload: { text: 'hello' } })
    expect(r.backend).toBe('direct-type')
    expect(r.text).toBe('hello')
  })

  it('marks mouse.scroll/move, keyboard.key as notImplemented', () => {
    for (const t of ['mouse.scroll', 'mouse.move', 'keyboard.key']) {
      expect(classify({ type: t }).backend).toBe('not-implemented')
    }
  })
})
