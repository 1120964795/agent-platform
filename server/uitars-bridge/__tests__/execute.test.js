import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const request = require('supertest')
const { createApp } = require('../index')

const fakeRunner = {
  ready: () => true,
  screenshot: async () => Buffer.from('PNG-bytes'),
  semanticClick: async (instruction) => ({ ok: true, x: 100, y: 200, instruction }),
  type: async (text) => ({ ok: true, typed: text })
}

describe('uitars-bridge POST /execute', () => {
  it('screen.observe returns base64 png', async () => {
    const app = createApp({ agentRunner: fakeRunner })
    const res = await request(app).post('/execute').send({
      protocol: 'aionui.ui-tars.v1', actionId: 'u1',
      type: 'screen.observe', payload: {}, approved: true
    })
    expect(res.body.ok).toBe(true)
    expect(res.body.metadata.screenshotBase64).toBe(Buffer.from('PNG-bytes').toString('base64'))
  })

  it('mouse.click invokes semanticClick and reports coords', async () => {
    const app = createApp({ agentRunner: fakeRunner })
    const res = await request(app).post('/execute').send({
      protocol: 'aionui.ui-tars.v1', actionId: 'u2',
      type: 'mouse.click', payload: { target: 'OK button' }, approved: true
    })
    expect(res.body.ok).toBe(true)
    expect(res.body.metadata.x).toBe(100)
    expect(res.body.metadata.y).toBe(200)
  })

  it('keyboard.type bypasses model', async () => {
    const app = createApp({ agentRunner: fakeRunner })
    const res = await request(app).post('/execute').send({
      protocol: 'aionui.ui-tars.v1', actionId: 'u3',
      type: 'keyboard.type', payload: { text: 'hello' }, approved: true
    })
    expect(res.body.ok).toBe(true)
    expect(res.body.metadata.typed).toBe('hello')
  })

  it('returns notImplemented for mouse.scroll', async () => {
    const app = createApp({ agentRunner: fakeRunner })
    const res = await request(app).post('/execute').send({
      protocol: 'aionui.ui-tars.v1', actionId: 'u4',
      type: 'mouse.scroll', payload: {}, approved: true
    })
    expect(res.body.ok).toBe(false)
    expect(res.body.metadata.notImplemented).toBe(true)
  })

  it('rejects approved=false with 403', async () => {
    const app = createApp({ agentRunner: fakeRunner })
    const res = await request(app).post('/execute').send({
      protocol: 'aionui.ui-tars.v1', actionId: 'u5',
      type: 'screen.observe', payload: {}, approved: false
    })
    expect(res.status).toBe(403)
  })
})
