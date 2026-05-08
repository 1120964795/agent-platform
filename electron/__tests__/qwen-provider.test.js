import { test, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `aionui-qwen-test-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = TMP
const require = createRequire(import.meta.url)
const { store } = require('../store')
const qwen = require('../services/models/qwenProvider')
const { MODEL_ROLES, DEFAULT_QWEN_BASE_URL } = require('../services/models/modelTypes')

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('returns default Qwen OpenAI-compatible config', () => {
  const config = qwen.getQwenConfig(store.getConfig())
  expect(config.baseUrl).toBe(DEFAULT_QWEN_BASE_URL)
  expect(config.primaryModel).toBe('qwen-max-latest')
  expect(config.codingModel).toBe('qwen3-coder-plus')
})

test('modelForRole uses coding model for coding reasoning', () => {
  const config = { qwenPrimaryModel: 'qwen-max-latest', qwenCodingModel: 'qwen3-coder-plus' }
  expect(qwen.modelForRole(MODEL_ROLES.PLAIN_CHAT, config)).toBe('qwen-max-latest')
  expect(qwen.modelForRole(MODEL_ROLES.CODING_REASONING, config)).toBe('qwen3-coder-plus')
})

test('chat posts to DashScope compatible chat completions endpoint', async () => {
  store.setConfig({ qwenApiKey: 'sk-qwen', qwenBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/' })
  const json = async () => ({ choices: [{ message: { content: 'hello' } }] })
  const text = async () => ''
  const fetchMock = vi.fn(async () => ({ ok: true, json, text }))
  vi.stubGlobal('fetch', fetchMock)

  const result = await qwen.chat({ messages: [{ role: 'user', content: 'hi' }] })
  expect(result).toBe('hello')
  expect(fetchMock).toHaveBeenCalledWith(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer sk-qwen' })
    })
  )
})

test('extractJson parses fenced arrays and objects', () => {
  expect(qwen.extractJson('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }])
  expect(qwen.extractJson('before {"ok":true} after')).toEqual({ ok: true })
})

test('assertReady fails when key is missing', () => {
  expect(() => qwen.assertReady({ qwenApiKey: '' })).toThrow(/Qwen API Key/)
})
