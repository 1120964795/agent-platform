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
    const fakeStore = { getConfig: () => ({ deepseekApiKey: 'k', doubaoVisionApiKey: '' }) }
    setBridgeContext({ pythonBootstrap: null, supervisor: null })
    const status = await computeSetupStatus({ storeRef: fakeStore })
    expect(status.tiers.lite.ready).toBe(true)
    expect(status.tiers.browser.ready).toBe(false)
    expect(status.deps.deepseekKey).toBe(true)
  })

  it('returns verified help links', async () => {
    const fakeStore = { getConfig: () => ({ deepseekApiKey: '', doubaoVisionApiKey: '' }) }
    setBridgeContext({ pythonBootstrap: null, supervisor: null })
    const status = await computeSetupStatus({ storeRef: fakeStore })
    expect(status.helpLinks).toEqual({
      deepseekKey: 'https://platform.deepseek.com/api_keys',
      qwenKey: 'https://bailian.console.aliyun.com/',
      doubaoKey: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
      browserUseKey: 'https://zenmux.ai/',
    })
  })

  it('reports browser tier ready when doubao key and python deps are available', async () => {
    const fakeStore = { getConfig: () => ({ deepseekApiKey: 'k', doubaoVisionApiKey: 'd', browserUseApiKey: 'b' }) }
    setBridgeContext({
      pythonBootstrap: { detect: async () => ({ available: true, browserUseInstalled: true, playwrightInstalled: true, seleniumInstalled: true }) },
      supervisor: null
    })
    const status = await computeSetupStatus({ storeRef: fakeStore })
    expect(status.tiers.browser.ready).toBe(true)
    expect(status.deps.python).toBe(true)
    expect(status.deps.browserUse).toBe(true)
    expect(status.deps.selenium).toBe(true)
  })

  it('reports browser tier not ready when selenium is missing', async () => {
    const fakeStore = { getConfig: () => ({ deepseekApiKey: 'k', doubaoVisionApiKey: 'd', browserUseApiKey: 'b' }) }
    setBridgeContext({
      pythonBootstrap: { detect: async () => ({ available: true, browserUseInstalled: true, playwrightInstalled: true, seleniumInstalled: false }) },
      supervisor: null
    })
    const status = await computeSetupStatus({ storeRef: fakeStore })
    expect(status.tiers.browser.ready).toBe(false)
    expect(status.deps.selenium).toBe(false)
  })

  it('reports browser tier not ready when python is missing', async () => {
    const fakeStore = { getConfig: () => ({ deepseekApiKey: 'k', doubaoVisionApiKey: 'd', browserUseApiKey: 'b' }) }
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
    expect(handlers.get('setup:set-key')({}, { dep: 'qwenKey', value: '  sk-qwen  ' })).toEqual({ ok: true })
    expect(setConfig).toHaveBeenCalledWith({ qwenApiKey: 'sk-qwen' })
    expect(handlers.get('setup:set-key')({}, { dep: 'browserUseKey', value: '  sk-browser  ' })).toEqual({ ok: true })
    expect(setConfig).toHaveBeenCalledWith({ browserUseApiKey: 'sk-browser' })
  })

  it('setup:set-key rejects unknown dep', () => {
    const handlers = new Map()
    vi.spyOn(store, 'setConfig').mockImplementation((patch) => patch)
    register({ handle: (channel, handler) => handlers.set(channel, handler) })

    expect(() => handlers.get('setup:set-key')({}, { dep: 'foo', value: 'sk-test' })).toThrow(/Unknown dep/)
  })

  it('setup:set-key rejects non-string and oversized values', () => {
    const handlers = new Map()
    vi.spyOn(store, 'setConfig').mockImplementation((patch) => patch)
    register({ handle: (channel, handler) => handlers.set(channel, handler) })

    expect(() => handlers.get('setup:set-key')({}, { dep: 'doubaoKey', value: 123 })).toThrow(/invalid key/)
    expect(() => handlers.get('setup:set-key')({}, { dep: 'doubaoKey', value: 'x'.repeat(4097) })).toThrow(/invalid key/)
  })
})
