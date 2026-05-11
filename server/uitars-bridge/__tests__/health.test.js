import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const request = require('supertest')
const { createApp } = require('../index')

describe('uitars-bridge /health', () => {
  it('responds 200 with runtime tag', async () => {
    const app = createApp({ agentRunner: { ready: () => true } })
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, runtime: 'ui-tars', agentReady: true })
  })

  it('start binds 127.0.0.1 only', async () => {
    const { start } = require('../index')
    const server = await start({ port: 0 })
    expect(server.address().address).toBe('127.0.0.1')
    await new Promise((r) => server.close(r))
  })
})
