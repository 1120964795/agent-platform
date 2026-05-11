import { afterEach, describe, it, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { computeSetupStatus, register, setBridgeContext } = require('../ipc/setupStatus')
const { store } = require('../store')

describe('setup-status', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports lite tier ready when only DeepSeek key set', async () => {
    const fakeStore = { getConfig: () => ({ deepseekApiKey: 'k' }) }
    setBridgeContext({ pythonBootstrap: null, supervisor: null })
    const status = await computeSetupStatus({ storeRef: fakeStore })
    expect(status.tiers.lite.ready).toBe(true)
    expect(status.deps.deepseekKey).toBe(true)
    expect(status.deps).not.toHaveProperty('doubaoKey')
  })

  it('returns verified help links without removed Doubao key setup', async () => {
    const fakeStore = { getConfig: () => ({ deepseekApiKey: '' }) }
    setBridgeContext({ pythonBootstrap: null, supervisor: null })
    const status = await computeSetupStatus({ storeRef: fakeStore })
    expect(status.helpLinks).toEqual({
      deepseekKey: 'https://platform.deepseek.com/api_keys'
    })
  })

  it('reports browser tier ready when DeepSeek key and python deps are available', async () => {
    const fakeStore = { getConfig: () => ({ deepseekApiKey: 'k' }) }
    setBridgeContext({
      pythonBootstrap: { detect: async () => ({ available: true, browserUseInstalled: true, playwrightInstalled: true }) },
      supervisor: null
    })
    const status = await computeSetupStatus({ storeRef: fakeStore })
    expect(status.tiers.browser.ready).toBe(true)
    expect(status.deps.python).toBe(true)
    expect(status.deps.browserUse).toBe(true)
  })

  it('reports browser tier not ready when python is missing', async () => {
    const fakeStore = { getConfig: () => ({ deepseekApiKey: 'k' }) }
    setBridgeContext({
      pythonBootstrap: { detect: async () => ({ available: false, browserUseInstalled: false, playwrightInstalled: false }) },
      supervisor: null
    })
    const status = await computeSetupStatus({ storeRef: fakeStore })
    expect(status.tiers.browser.ready).toBe(false)
    expect(status.deps.python).toBe(false)
  })

  it('reports bridges running when supervisor reports all running', async () => {
    const fakeStore = { getConfig: () => ({ deepseekApiKey: 'k', doubaoVisionApiKey: 'd' }) }
    setBridgeContext({
      pythonBootstrap: null,
      supervisor: { getState: () => ({ uitars: { state: 'running' }, browserUse: { state: 'running' } }) }
    })
    const status = await computeSetupStatus({ storeRef: fakeStore })
    expect(status.deps.bridgesRunning).toBe(true)
  })

  it('registers status and welcome visibility handlers', () => {
    const handlers = new Map()
    register({ handle: (channel, handler) => handlers.set(channel, handler) })
    expect([...handlers.keys()]).toEqual(expect.arrayContaining([
      'setup:status',
      'setup:get-welcome-shown',
      'setup:mark-welcome-shown',
      'setup:set-key',
    ]))
  })

  it('setup:set-key updates the matching store field', () => {
    const handlers = new Map()
    const setConfig = vi.spyOn(store, 'setConfig').mockImplementation((patch) => patch)
    register({ handle: (channel, handler) => handlers.set(channel, handler) })

    expect(handlers.get('setup:set-key')({}, { dep: 'deepseekKey', value: '  sk-test  ' })).toEqual({ ok: true })
    expect(setConfig).toHaveBeenCalledWith({ deepseekApiKey: 'sk-test' })
  })

  it('setup:set-key rejects unknown dep', () => {
    const handlers = new Map()
    vi.spyOn(store, 'setConfig').mockImplementation((patch) => patch)
    register({ handle: (channel, handler) => handlers.set(channel, handler) })

    expect(() => handlers.get('setup:set-key')({}, { dep: 'foo', value: 'sk-test' })).toThrow(/未知配置项/)
  })

  it('setup:set-key rejects non-string and oversized values', () => {
    const handlers = new Map()
    vi.spyOn(store, 'setConfig').mockImplementation((patch) => patch)
    register({ handle: (channel, handler) => handlers.set(channel, handler) })

    expect(() => handlers.get('setup:set-key')({}, { dep: 'deepseekKey', value: 123 })).toThrow(/密钥无效/)
    expect(() => handlers.get('setup:set-key')({}, { dep: 'deepseekKey', value: 'x'.repeat(4097) })).toThrow(/密钥无效/)
  })
})
