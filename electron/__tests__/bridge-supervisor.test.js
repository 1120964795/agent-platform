import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createRequire } from 'module'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-bridge-supervisor-test-${Date.now()}`)
const PREVIOUS_AGENTDEV_DATA_DIR = process.env.AGENTDEV_DATA_DIR
process.env.AGENTDEV_DATA_DIR = TMP
const require = createRequire(import.meta.url)
const { createSupervisor } = require('../services/bridgeSupervisor')
const { store } = require('../store')

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
})

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
  if (PREVIOUS_AGENTDEV_DATA_DIR === undefined) delete process.env.AGENTDEV_DATA_DIR
  else process.env.AGENTDEV_DATA_DIR = PREVIOUS_AGENTDEV_DATA_DIR
})

function fdWasClosed(fd) {
  try {
    fs.fstatSync(fd)
    fs.closeSync(fd)
    return false
  } catch (error) {
    if (error.code === 'EBADF') return true
    throw error
  }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms))
  ])
}

describe('bridgeSupervisor', () => {
  it('starts all bridges and waits for /health', async () => {
    const calls = []
    const fakeChild = () => ({ on() {}, kill() { this.killed = true }, killed: false })
    const sup = createSupervisor({
      spawnImpl: (cmd, args, opts) => { calls.push({ cmd, args, env: opts.env, windowsHide: opts.windowsHide }); return fakeChild() },
      healthImpl: async (port) => ({ ok: true, port })
    })
    const result = await sup.start()
    expect(result.uitars.ready).toBe(true)
    expect(result.browserUse.ready).toBe(true)
    expect(result.desktopUse.ready).toBe(true)
    expect(calls).toHaveLength(3)
    expect(calls.every((call) => call.windowsHide === true)).toBe(true)
    const uitars = calls.find((c) => c.args.some((arg) => arg.includes('uitars-bridge')))
    expect(uitars.env.UITARS_MODEL_PROVIDER).toBe('volcengine')
    expect(uitars.env.UITARS_MODEL_ENDPOINT).toContain('volces.com')
    const browserUse = calls.find((c) => c.cmd === 'python' && c.args.some((arg) => arg.includes('browser-use-bridge')))
    expect(browserUse).toBeDefined()
    expect(browserUse.env.BROWSER_USE_MODEL_ENDPOINT).toBe('https://zenmux.ai/api/v1')
    expect(browserUse.env.BROWSER_USE_MODEL_API_KEY).toBe('')
    expect(browserUse.env.BROWSER_USE_MODEL_NAME).toBe('openai/gpt-5.5')
    expect(browserUse.env.BROWSER_USE_VISION_ENABLED).toBe('true')
    expect(browserUse.env.BROWSER_USE_HEADLESS).toBe('false')
    expect(browserUse.env.BROWSER_USE_KEEP_ALIVE).toBe('true')
    const desktopUse = calls.find((c) => c.cmd === 'node' && c.args.some((arg) => arg.includes('desktop-use-bridge')))
    expect(desktopUse).toBeDefined()
    expect(desktopUse.args).toContain('8790')
    expect(desktopUse.env.DESKTOP_USE_MODEL_ENDPOINT).toBe('https://zenmux.ai/api/v1')
    expect(desktopUse.env.DESKTOP_USE_MODEL_API_KEY).toBe('')
    expect(desktopUse.env.DESKTOP_USE_MODEL_NAME).toBe('openai/gpt-5.5')
    expect(desktopUse.env.DESKTOP_USE_GROUNDING_BACKEND).toBe('manual-coordinate')
  })

  it('uses Browser-Use relay settings for Desktop-Use when no dedicated desktop key is configured', async () => {
    store.setConfig({
      browserUseApiKey: 'sk-browser-relay',
      browserUseEndpoint: 'https://browser-relay.example/v1',
      browserUseModel: 'openai/browser-relay'
    })
    const calls = []
    const sup = createSupervisor({
      spawnImpl: (cmd, args, opts) => {
        calls.push({ cmd, args, env: opts.env })
        return { on() {}, kill() {}, killed: false }
      },
      healthImpl: async () => ({ ok: true })
    })

    await sup.startOne('desktopUse', { healthTimeoutMs: 50, maxRestarts: 0 })

    const desktopUse = calls.find((c) => c.cmd === 'node' && c.args.some((arg) => arg.includes('desktop-use-bridge')))
    expect(desktopUse.env.DESKTOP_USE_MODEL_ENDPOINT).toBe('https://browser-relay.example/v1')
    expect(desktopUse.env.DESKTOP_USE_MODEL_API_KEY).toBe('sk-browser-relay')
    expect(desktopUse.env.DESKTOP_USE_MODEL_NAME).toBe('openai/browser-relay')
  })

  it('prefers dedicated Desktop-Use model settings over Browser-Use fallback', async () => {
    store.setConfig({
      browserUseApiKey: 'sk-browser-relay',
      browserUseEndpoint: 'https://browser-relay.example/v1',
      browserUseModel: 'openai/browser-relay',
      desktopUseApiKey: 'sk-desktop-relay',
      desktopUseEndpoint: 'https://desktop-relay.example/v1',
      desktopUseModel: 'openai/desktop-relay'
    })
    const calls = []
    const sup = createSupervisor({
      spawnImpl: (cmd, args, opts) => {
        calls.push({ cmd, args, env: opts.env })
        return { on() {}, kill() {}, killed: false }
      },
      healthImpl: async () => ({ ok: true })
    })

    await sup.startOne('desktopUse', { healthTimeoutMs: 50, maxRestarts: 0 })

    const desktopUse = calls.find((c) => c.cmd === 'node' && c.args.some((arg) => arg.includes('desktop-use-bridge')))
    expect(desktopUse.env.DESKTOP_USE_MODEL_ENDPOINT).toBe('https://desktop-relay.example/v1')
    expect(desktopUse.env.DESKTOP_USE_MODEL_API_KEY).toBe('sk-desktop-relay')
    expect(desktopUse.env.DESKTOP_USE_MODEL_NAME).toBe('openai/desktop-relay')
  })

  it('captures child stdout and stderr in bridge-specific log files', async () => {
    const seenStdio = []
    const openedFds = []
    const sup = createSupervisor({
      spawnImpl: (_cmd, _args, opts) => {
        seenStdio.push(opts.stdio)
        if (Array.isArray(opts.stdio)) {
          openedFds.push(...opts.stdio.slice(1, 3).filter((fd) => typeof fd === 'number'))
        }
        return { on() {}, kill() {}, killed: false }
      },
      healthImpl: async () => ({ ok: true })
    })

    await sup.start()

    expect(seenStdio).toHaveLength(3)
    expect(seenStdio.every((stdio) => Array.isArray(stdio) && stdio[0] === 'ignore')).toBe(true)
    expect(openedFds).toHaveLength(6)
    expect(openedFds.map((fd) => fdWasClosed(fd)).every(Boolean)).toBe(true)
    for (const key of ['uitars', 'browserUse', 'desktopUse']) {
      expect(fs.existsSync(path.join(os.tmpdir(), 'aionui-logs', `${key}-stdout.log`))).toBe(true)
      expect(fs.existsSync(path.join(os.tmpdir(), 'aionui-logs', `${key}-stderr.log`))).toBe(true)
    }
  })

  it('restarts a crashed bridge up to 3 times then marks failed', async () => {
    let attempts = 0
    const sup = createSupervisor({
      spawnImpl: () => ({ kill() { this.killed = true }, killed: false }),
      healthImpl: async () => { attempts++; return { ok: false } }
    })
    const result = await sup.start({ healthTimeoutMs: 50, maxRestarts: 3 })
    expect(result.uitars.ready).toBe(false)
    expect(result.uitars.state).toBe('failed')
    expect(result.uitars.diagnostics).toEqual(expect.objectContaining({
      port: 8765,
      stdoutLog: expect.stringContaining('uitars-stdout.log'),
      stderrLog: expect.stringContaining('uitars-stderr.log'),
      nextSteps: expect.arrayContaining([expect.stringContaining('stderr')])
    }))
  }, 15000)

  it('reports Browser-Use config fields separately from Doubao diagnostics', async () => {
    const sup = createSupervisor({
      spawnImpl: () => ({ on() {}, kill() {}, killed: false }),
      healthImpl: async () => ({ ok: false })
    })

    const result = await sup.start({ healthTimeoutMs: 50, maxRestarts: 0 })

    expect(result.browserUse.state).toBe('failed')
    expect(result.browserUse.diagnostics.missingConfig).toEqual(['browserUseApiKey'])
    expect(result.browserUse.diagnostics.nextSteps).toEqual(expect.arrayContaining([
      expect.stringContaining('browserUseApiKey')
    ]))
  })

  it('reports Desktop-Use config fields and diagnostics separately', async () => {
    const sup = createSupervisor({
      spawnImpl: () => ({ on() {}, kill() {}, killed: false }),
      healthImpl: async () => ({ ok: false })
    })

    const result = await sup.startOne('desktopUse', { healthTimeoutMs: 50, maxRestarts: 0 })

    expect(result.state).toBe('failed')
    expect(result.diagnostics).toEqual(expect.objectContaining({
      bridge: 'desktopUse',
      name: 'desktop-use-bridge',
      port: 8790,
      missingConfig: ['desktopUseApiKey or browserUseApiKey']
    }))
    expect(result.diagnostics.nextSteps).toEqual(expect.arrayContaining([
      expect.stringContaining('desktopUseApiKey or browserUseApiKey'),
      expect.stringContaining('desktop-use')
    ]))
  })

  it('does not report Desktop-Use API key missing when Browser-Use fallback key is available', async () => {
    store.setConfig({ browserUseApiKey: 'sk-browser-relay' })
    const sup = createSupervisor({
      spawnImpl: () => ({ on() {}, kill() {}, killed: false }),
      healthImpl: async () => ({ ok: false })
    })

    const result = await sup.startOne('desktopUse', { healthTimeoutMs: 50, maxRestarts: 0 })

    expect(result.state).toBe('failed')
    expect(result.diagnostics.missingConfig).not.toContain('desktopUseApiKey')
    expect(result.diagnostics.missingConfig).not.toContain('browserUseApiKey')
  })

  it('kills and clears a spawned child on terminal health timeout', async () => {
    let child
    const sup = createSupervisor({
      spawnImpl: () => {
        child = { kill() { this.killed = true }, killed: false }
        return child
      },
      healthImpl: async () => ({ ok: false })
    })

    const result = await sup.startOne('browserUse', { healthTimeoutMs: 50, maxRestarts: 0 })

    expect(result.state).toBe('failed')
    expect(child.killed).toBe(true)
    expect(sup.getState().browserUse.child).toBe(null)
  })

  it('fails a start when the health probe never resolves', async () => {
    let child
    const sup = createSupervisor({
      spawnImpl: () => {
        child = { kill() { this.killed = true }, killed: false }
        return child
      },
      healthImpl: async () => new Promise(() => {})
    })

    const result = await withTimeout(
      sup.startOne('browserUse', { healthTimeoutMs: 50, maxRestarts: 0 }),
      250
    )

    expect(result.state).toBe('failed')
    expect(result.lastError).toBe('health check timeout')
    expect(child.killed).toBe(true)
    expect(sup.getState().browserUse.child).toBe(null)
  })

  it('handles async child spawn error events and marks the bridge failed', async () => {
    let child
    const sup = createSupervisor({
      spawnImpl: () => {
        child = new EventEmitter()
        child.killed = false
        child.kill = () => {
          child.killed = true
          child.emit('close')
        }
        return child
      },
      healthImpl: async () => new Promise(() => {})
    })

    const start = sup.startOne('browserUse', { healthTimeoutMs: 1000, maxRestarts: 0 })
    await flushPromises()

    expect(() => child.emit('error', new Error('spawn failed'))).not.toThrow()
    const result = await start

    expect(result.state).toBe('failed')
    expect(result.lastError).toContain('spawn failed')
    expect(child.killed).toBe(true)
    expect(sup.getState().browserUse.child).toBe(null)
  })

  it('stop during an in-flight start prevents late health success from marking running', async () => {
    let resolveHealth
    const health = new Promise((resolve) => { resolveHealth = resolve })
    const children = []
    const sup = createSupervisor({
      spawnImpl: () => {
        const child = { kill() { this.killed = true }, killed: false }
        children.push(child)
        return child
      },
      healthImpl: async () => health
    })

    const start = sup.startOne('browserUse', { healthTimeoutMs: 1000, maxRestarts: 0 })
    await flushPromises()
    expect(children).toHaveLength(1)

    sup.stop()
    resolveHealth({ ok: true })
    const result = await start

    expect(result.state).toBe('stopped')
    expect(children[0].killed).toBe(true)
    expect(sup.getState().browserUse.state).toBe('stopped')
    expect(sup.getState().browserUse.child).toBe(null)
  })

  it('stop during a hung health probe lets the in-flight start resolve stopped', async () => {
    const children = []
    const sup = createSupervisor({
      spawnImpl: () => {
        const child = { kill() { this.killed = true }, killed: false }
        children.push(child)
        return child
      },
      healthImpl: async () => new Promise(() => {})
    })

    const start = sup.startOne('browserUse', { healthTimeoutMs: 1000, maxRestarts: 0 })
    await flushPromises()
    expect(children).toHaveLength(1)

    sup.stop()
    const result = await withTimeout(start, 250)

    expect(result.state).toBe('stopped')
    expect(children[0].killed).toBe(true)
    expect(sup.getState().browserUse.state).toBe('stopped')
    expect(sup.getState().browserUse.child).toBe(null)
  })

  it('queued start before stop does not spawn after stop', async () => {
    let resolveFirstHealth
    let healthCalls = 0
    const firstHealth = new Promise((resolve) => { resolveFirstHealth = resolve })
    const children = []
    const sup = createSupervisor({
      spawnImpl: () => {
        const child = { kill() { this.killed = true }, killed: false }
        children.push(child)
        return child
      },
      healthImpl: async () => {
        healthCalls++
        return healthCalls === 1 ? firstHealth : { ok: true }
      }
    })

    const firstStart = sup.startOne('browserUse', { healthTimeoutMs: 1000, maxRestarts: 0 })
    await flushPromises()
    expect(children).toHaveLength(1)

    const secondStart = sup.startOne('browserUse', { healthTimeoutMs: 50, maxRestarts: 0 })
    await flushPromises()
    expect(children).toHaveLength(1)

    sup.stop()
    resolveFirstHealth({ ok: true })
    await firstStart
    await secondStart

    expect(children).toHaveLength(1)
    expect(children[0].killed).toBe(true)
    expect(sup.getState().browserUse.state).toBe('stopped')
    expect(sup.getState().browserUse.child).toBe(null)
  })

  it('stop then startOne waits for the stopped child to close before spawning a replacement', async () => {
    const children = []
    const createChild = () => {
      const handlers = {}
      return {
        killed: false,
        on() {},
        once(event, handler) { handlers[event] = handler },
        kill() { this.killed = true },
        emit(event) { if (handlers[event]) handlers[event]() }
      }
    }
    const sup = createSupervisor({
      spawnImpl: () => {
        const child = createChild()
        children.push(child)
        return child
      },
      healthImpl: async () => ({ ok: true })
    })

    await sup.startOne('browserUse', { healthTimeoutMs: 50, maxRestarts: 0 })
    const firstChild = children[0]
    sup.stop()

    const restart = sup.startOne('browserUse', { healthTimeoutMs: 50, maxRestarts: 0 })
    await flushPromises()

    expect(firstChild.killed).toBe(true)
    expect(children).toHaveLength(1)

    firstChild.emit('close')
    await restart

    expect(children).toHaveLength(2)
    expect(sup.getState().browserUse.child).toBe(children[1])
  })

  it('startOne after stop is not blocked by a stale in-flight health check', async () => {
    let healthCalls = 0
    const children = []
    const createChild = () => {
      const handlers = {}
      return {
        killed: false,
        on() {},
        once(event, handler) { handlers[event] = handler },
        kill() { this.killed = true },
        emit(event) { if (handlers[event]) handlers[event]() }
      }
    }
    const sup = createSupervisor({
      spawnImpl: () => {
        const child = createChild()
        children.push(child)
        return child
      },
      healthImpl: async () => {
        healthCalls++
        return healthCalls === 1 ? new Promise(() => {}) : { ok: true }
      }
    })

    sup.startOne('browserUse', { healthTimeoutMs: 1000, maxRestarts: 0 })
    await flushPromises()
    expect(children).toHaveLength(1)

    sup.stop()
    children[0].emit('close')

    const restart = sup.startOne('browserUse', { healthTimeoutMs: 50, maxRestarts: 0 })
    await flushPromises()
    await flushPromises()

    expect(children[0].killed).toBe(true)
    expect(children).toHaveLength(2)

    await restart

    expect(sup.getState().browserUse.child).toBe(children[1])
    expect(sup.getState().browserUse.state).toBe('running')
  })

  it('closes stdio handles when buildEnv throws after opening logs', async () => {
    const originalGetConfig = store.getConfig
    const originalOpenSync = fs.openSync
    const openedFds = []
    store.getConfig = () => { throw new Error('config unavailable') }
    fs.openSync = (...args) => {
      const fd = originalOpenSync(...args)
      openedFds.push(fd)
      return fd
    }
    const sup = createSupervisor({
      spawnImpl: () => ({ kill() { this.killed = true }, killed: false }),
      healthImpl: async () => ({ ok: true })
    })

    try {
      const result = await sup.startOne('browserUse', { healthTimeoutMs: 50, maxRestarts: 0 })
      expect(result.state).toBe('failed')
      expect(result.lastError).toBe('config unavailable')
    } finally {
      store.getConfig = originalGetConfig
      fs.openSync = originalOpenSync
    }

    expect(openedFds).toHaveLength(2)
    expect(openedFds.map((fd) => fdWasClosed(fd)).every(Boolean)).toBe(true)
  })

  it('clears stale diagnostics while starting and after stop', async () => {
    let healthOk = false
    let spawnCount = 0
    let sup
    sup = createSupervisor({
      spawnImpl: (_cmd, _args, opts) => {
        spawnCount++
        if (spawnCount === 2) {
          const starting = sup.getState().browserUse
          expect(starting.state).toBe('starting')
          expect(starting.lastError).toBe(null)
          expect(starting.diagnostics).toBe(null)
        }
        return { kill() { this.killed = true }, killed: false }
      },
      healthImpl: async () => ({ ok: healthOk })
    })

    const failed = await sup.startOne('browserUse', { healthTimeoutMs: 50, maxRestarts: 0 })
    expect(failed.state).toBe('failed')
    expect(failed.lastError).toBe('health check timeout')
    expect(failed.diagnostics).toEqual(expect.objectContaining({
      missingConfig: ['browserUseApiKey']
    }))

    healthOk = true
    await sup.startOne('browserUse', { healthTimeoutMs: 50, maxRestarts: 0 })
    sup.stop()

    const stopped = sup.getState().browserUse
    expect(stopped.state).toBe('stopped')
    expect(stopped.lastError).toBe(null)
    expect(stopped.diagnostics).toBe(null)
  })

  it('kills an existing bridge child before tracking a replacement start', async () => {
    const children = []
    const sup = createSupervisor({
      spawnImpl: () => {
        const child = { kill() { this.killed = true }, killed: false }
        children.push(child)
        return child
      },
      healthImpl: async () => ({ ok: true })
    })

    await sup.startOne('browserUse', { healthTimeoutMs: 50, maxRestarts: 0 })
    const firstChild = children[0]
    expect(sup.getState().browserUse.child).toBe(firstChild)
    expect(firstChild.killed).toBe(false)

    await sup.startOne('browserUse', { healthTimeoutMs: 50, maxRestarts: 0 })

    expect(firstChild.killed).toBe(true)
    expect(children).toHaveLength(2)
    expect(sup.getState().browserUse.child).toBe(children[1])
    expect(children[1].killed).toBe(false)
  })

  it('waits for the previous bridge child to close before spawning a replacement', async () => {
    const children = []
    const createChild = () => {
      const handlers = {}
      return {
        killed: false,
        on() {},
        once(event, handler) { handlers[event] = handler },
        kill() { this.killed = true },
        emit(event) { if (handlers[event]) handlers[event]() }
      }
    }
    const sup = createSupervisor({
      spawnImpl: () => {
        const child = createChild()
        children.push(child)
        return child
      },
      healthImpl: async () => ({ ok: true })
    })

    await sup.startOne('browserUse', { healthTimeoutMs: 50, maxRestarts: 0 })
    const firstChild = children[0]

    const secondStart = sup.startOne('browserUse', { healthTimeoutMs: 50, maxRestarts: 0 })
    await flushPromises()

    expect(firstChild.killed).toBe(true)
    expect(children).toHaveLength(1)

    firstChild.emit('close')
    await secondStart

    expect(children).toHaveLength(2)
    expect(sup.getState().browserUse.child).toBe(children[1])
  })

  it('waits for a killed bridge child to close before spawning a replacement', async () => {
    const children = []
    const createChild = () => {
      const handlers = {}
      return {
        killed: false,
        on() {},
        once(event, handler) { handlers[event] = handler },
        kill() { this.killed = true },
        emit(event) { if (handlers[event]) handlers[event]() }
      }
    }
    const sup = createSupervisor({
      spawnImpl: () => {
        const child = createChild()
        children.push(child)
        return child
      },
      healthImpl: async () => ({ ok: true })
    })

    await sup.startOne('browserUse', { healthTimeoutMs: 50, maxRestarts: 0 })
    const firstChild = children[0]
    firstChild.killed = true

    const secondStart = sup.startOne('browserUse', { healthTimeoutMs: 50, maxRestarts: 0 })
    await flushPromises()

    expect(children).toHaveLength(1)

    firstChild.emit('close')
    await secondStart

    expect(children).toHaveLength(2)
    expect(sup.getState().browserUse.child).toBe(children[1])
  })

  it('serializes concurrent starts for the same bridge', async () => {
    let resolveFirstHealth
    let healthCalls = 0
    const firstHealth = new Promise((resolve) => { resolveFirstHealth = resolve })
    const children = []
    const sup = createSupervisor({
      spawnImpl: () => {
        const child = { kill() { this.killed = true }, killed: false }
        children.push(child)
        return child
      },
      healthImpl: async () => {
        healthCalls++
        return healthCalls === 1 ? firstHealth : { ok: true }
      }
    })

    const firstStart = sup.startOne('browserUse', { healthTimeoutMs: 50, maxRestarts: 0 })
    await flushPromises()
    expect(children).toHaveLength(1)

    const secondStart = sup.startOne('browserUse', { healthTimeoutMs: 50, maxRestarts: 0 })
    await flushPromises()
    expect(children).toHaveLength(1)

    resolveFirstHealth({ ok: true })
    await firstStart
    await secondStart

    expect(children).toHaveLength(2)
    expect(children[0].killed).toBe(true)
    expect(sup.getState().browserUse.child).toBe(children[1])
  })

  it('stop() kills all children', async () => {
    const children = []
    const sup = createSupervisor({
      spawnImpl: () => {
        const c = { on() {}, kill() { this.killed = true }, killed: false }
        children.push(c)
        return c
      },
      healthImpl: async () => ({ ok: true })
    })
    await sup.start()
    sup.stop()
    expect(children.every((c) => c.killed)).toBe(true)
    expect(children).toHaveLength(3)
  })
})
