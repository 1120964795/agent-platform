import { test, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { MODEL_ROLES, MODEL_PROVIDERS } = require('../services/models/modelTypes')
const { selectModelForRole, getProviderForRole, verifyProviderReadiness } = require('../services/modelRouter')

const deepseekConfig = {
  deepseekApiKey: 'sk-deepseek',
  deepseekChatEndpoint: 'https://api.deepseek.com',
  deepseekPlannerModel: 'deepseek-chat',
  deepseekCodingModel: 'deepseek-coder'
}

test('selects DeepSeek for plain chat when configured', () => {
  const selected = selectModelForRole(MODEL_ROLES.PLAIN_CHAT, deepseekConfig)
  expect(selected.provider).toBe(MODEL_PROVIDERS.DEEPSEEK)
  expect(selected.endpoint).toBe('https://api.deepseek.com')
  expect(selected.model).toBe('deepseek-chat')
})

test('selects DeepSeek for planning and intent roles', () => {
  for (const role of [MODEL_ROLES.TASK_PLANNING, MODEL_ROLES.ACTION_INTENT]) {
    const selected = selectModelForRole(role, deepseekConfig)
    expect(selected.provider).toBe(MODEL_PROVIDERS.DEEPSEEK)
    expect(selected.model).toBe('deepseek-chat')
  }
})

test('execution planning fails closed without DeepSeek', () => {
  expect(() => verifyProviderReadiness(MODEL_ROLES.TASK_PLANNING, {})).toThrow(/DeepSeek/)
  expect(() => verifyProviderReadiness(MODEL_ROLES.CODING_REASONING, { qwenApiKey: 'sk-qwen' })).toThrow(/DeepSeek/)
})

test('coding role uses DeepSeek coding model', () => {
  const selected = selectModelForRole(MODEL_ROLES.CODING_REASONING, deepseekConfig)
  expect(selected.provider).toBe(MODEL_PROVIDERS.DEEPSEEK)
  expect(selected.model).toBe('deepseek-coder')
})

test('getProviderForRole returns the DeepSeek provider implementation', () => {
  const result = getProviderForRole(MODEL_ROLES.PLAIN_CHAT, deepseekConfig)
  expect(result.selected.provider).toBe(MODEL_PROVIDERS.DEEPSEEK)
  expect(typeof result.provider.chat).toBe('function')
})

test('Qwen is not reachable from modelRouter', () => {
  for (const role of Object.values(MODEL_ROLES)) {
    const selected = selectModelForRole(role, { ...deepseekConfig, qwenApiKey: 'sk-qwen' })
    expect(selected.provider).not.toBe(MODEL_PROVIDERS.QWEN)
  }
})
