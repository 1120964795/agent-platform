import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

function mockSdk(GUIAgent) {
  require.cache[require.resolve('@ui-tars/sdk')] = { exports: { GUIAgent } }
}

function clearCache(mod) {
  delete require.cache[require.resolve(mod)]
}

describe('uitars-bridge agentRunner', () => {
  beforeEach(() => {
    clearCache('../agentRunner')
    clearCache('@ui-tars/sdk')
  })

  it('constructs GUIAgent with correct model config', async () => {
    const captured = {}
    mockSdk(class {
      constructor(config) {
        Object.assign(captured, { model: config.model, operator: config.operator })
      }
      async run() {}
    })

    const { createAgentRunner } = require('../agentRunner')
    const runner = createAgentRunner({
      modelEndpoint: 'https://ark.cn-beijing.volces.com/api/v3',
      modelApiKey: 'test-key',
      modelName: 'test-model',
      screenshotImpl: async () => Buffer.from('png'),
      nutjs: {
        Point: class Point { constructor(x, y) { this.x = x; this.y = y } },
        straightTo: (point) => point,
        mouse: { move: vi.fn(async () => {}), leftClick: vi.fn(async () => {}) },
        keyboard: { type: vi.fn(async () => {}) }
      }
    })

    await runner.semanticClick('OK button')

    expect(captured.model.baseURL).toBe('https://ark.cn-beijing.volces.com/api/v3')
    expect(captured.model.apiKey).toBe('test-key')
    expect(captured.model.model).toBe('test-model')
    expect(captured.operator).toBeDefined()
    expect(typeof captured.operator.screenshot).toBe('function')
    expect(typeof captured.operator.execute).toBe('function')
  })

  it('operator has MANUAL.ACTION_SPACES', async () => {
    let operatorInstance = null
    mockSdk(class {
      constructor(config) { operatorInstance = config.operator }
      async run() {}
    })

    const { createAgentRunner } = require('../agentRunner')
    const runner = createAgentRunner({
      modelEndpoint: 'https://test.com',
      modelApiKey: 'k',
      modelName: 'm',
      screenshotImpl: async () => Buffer.from('png'),
      nutjs: {
        Point: class Point { constructor(x, y) { this.x = x; this.y = y } },
        straightTo: (p) => p,
        mouse: { move: vi.fn(async () => {}), leftClick: vi.fn(async () => {}) },
        keyboard: { type: vi.fn(async () => {}) }
      }
    })

    await runner.semanticClick('test')

    const spaces = operatorInstance.constructor.MANUAL.ACTION_SPACES
    expect(Array.isArray(spaces)).toBe(true)
    expect(spaces.some(s => s.includes('click'))).toBe(true)
    expect(spaces.some(s => s.includes('type'))).toBe(true)
    expect(spaces.some(s => s.includes('finished'))).toBe(true)
  })
})
