import { test, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { MODEL_ROLES, MODEL_PROVIDERS } = require('../services/models/modelTypes')
const { selectModelForRole, getProviderForRole, verifyProviderReadiness } = require('../services/modelRouter')

test('selects Qwen for plain chat when configured', () => {
  const selected = selectModelForRole(MODEL_ROLES.PLAIN_CHAT, {
    qwenApiKey: 'sk-qwen',
    qwenPrimaryModel: 'qwen-max-latest'
  })
  expect(selected.provider).toBe(MODEL_PROVIDERS.QWEN)
  expect(selected.model).toBe('qwen-max-latest')
})

test('allows DeepSeek only as plain-chat fallback', () => {
  const selected = selectModelForRole(MODEL_ROLES.PLAIN_CHAT, {
    fallbackProvider: 'deepseek',
    deepseekApiKey: 'sk-deepseek',
    fallbackModel: 'deepseek-chat'
  })
  expect(selected.provider).toBe(MODEL_PROVIDERS.DEEPSEEK)
  expect(selected.model).toBe('deepseek-chat')

  expect(() => selectModelForRole(MODEL_ROLES.ACTION_INTENT, {
    fallbackProvider: 'deepseek',
    deepseekApiKey: 'sk-deepseek'
  })).toThrow(/需要配置 Qwen/)
})

test('execution planning fails closed without Qwen', () => {
  expect(() => verifyProviderReadiness(MODEL_ROLES.TASK_PLANNING, {})).toThrow(/需要配置 Qwen/)
  expect(() => verifyProviderReadiness(MODEL_ROLES.CODING_REASONING, {})).toThrow(/需要配置 Qwen/)
})

test('coding role uses Qwen coding model', () => {
  const selected = selectModelForRole(MODEL_ROLES.CODING_REASONING, {
    qwenApiKey: 'sk-qwen',
    qwenPrimaryModel: 'qwen-max-latest',
    qwenCodingModel: 'qwen3-coder-plus'
  })
  expect(selected.provider).toBe(MODEL_PROVIDERS.QWEN)
  expect(selected.model).toBe('qwen3-coder-plus')
})

test('getProviderForRole returns a provider implementation', () => {
  const result = getProviderForRole(MODEL_ROLES.PLAIN_CHAT, { qwenApiKey: 'sk-qwen' })
  expect(result.selected.provider).toBe(MODEL_PROVIDERS.QWEN)
  expect(typeof result.provider.chat).toBe('function')
})
