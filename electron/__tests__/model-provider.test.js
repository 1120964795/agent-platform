import { test, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-model-provider-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')

const require = createRequire(import.meta.url)
const { store } = require('../store')
const deepseek = require('../services/deepseek')

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
})

test('defaults to DeepSeek V4 flash and modern DeepSeek chat endpoint', () => {
  expect(deepseek.resolveProviderConfig()).toMatchObject({
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    baseUrl: 'https://api.deepseek.com'
  })
  expect(deepseek.chatCompletionsUrl('https://api.deepseek.com', 'deepseek')).toBe('https://api.deepseek.com/chat/completions')
  expect(deepseek.buildBody({ messages: [], stream: false }).model).toBe('deepseek-v4-flash')
})

test('routes MiniMax provider to OpenAI-compatible v1 chat completions', () => {
  store.setConfig({
    modelProvider: 'minimax',
    minimaxApiKey: 'mini-key',
    minimaxBaseUrl: 'https://api.minimax.io',
    minimaxModel: 'MiniMax-M2.7-highspeed'
  })

  expect(deepseek.resolveProviderConfig()).toMatchObject({
    provider: 'minimax',
    apiKey: 'mini-key',
    model: 'MiniMax-M2.7-highspeed'
  })
  expect(deepseek.chatCompletionsUrl('https://api.minimax.io', 'minimax')).toBe('https://api.minimax.io/v1/chat/completions')
  expect(deepseek.buildBody({ messages: [{ role: 'user', content: 'hi' }], stream: true }).model).toBe('MiniMax-M2.7-highspeed')
})
