import { test, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-test-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = TMP
const require = createRequire(import.meta.url)
const { store } = require('../store')

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
})

test('getConfig returns defaults including new fields', () => {
  const config = store.getConfig()
  expect(config.permissionMode).toBe('default')
  expect(config.workspace_root).toBe(os.homedir())
  expect(config.shell_whitelist_extra).toEqual([])
  expect(config.shell_blacklist_extra).toEqual([])
  expect(config.session_confirm_cache_enabled).toBe(true)
  expect(config.deepseekChatEndpoint).toBe('https://api.deepseek.com')
  expect(config.deepseekApiKey).toBe('')
  expect(config.deepseekPlannerModel).toBe('deepseek-chat')
  expect(config.deepseekCodingModel).toBe('deepseek-coder')
  expect(config.browserUseEndpoint).toBe('https://zenmux.ai/api/v1')
  expect(config.browserUseApiKey).toBe('')
  expect(config.browserUseModel).toBe('openai/gpt-5.5')
  expect(config.browserUseVisionEnabled).toBe(true)
  expect(config.browserUseHeadless).toBe(false)
  expect(config.desktopUseEndpoint).toBe('https://zenmux.ai/api/v1')
  expect(config.desktopUseApiKey).toBe('')
  expect(config.desktopUseModel).toBe('openai/gpt-5.5')
  expect(config.desktopUseGroundingBackend).toBe('manual-coordinate')
  expect(config.desktopUseAllowBrowserFallback).toBe(true)
})

test('config defaults expose DeepSeek Browser Use and Desktop Use but not Qwen or Doubao', () => {
  const config = store.getConfig()
  expect(config.deepseekApiKey).toBe('')
  expect(config.browserUseApiKey).toBe('')
  expect(config.browserUseEndpoint).toBe('https://zenmux.ai/api/v1')
  expect(config.desktopUseApiKey).toBe('')
  expect(config.desktopUseEndpoint).toBe('https://zenmux.ai/api/v1')
  expect(config.desktopUseAllowBrowserFallback).toBe(true)
  expect(config).not.toHaveProperty('qwenApiKey')
  expect(config).not.toHaveProperty('qwenVisionApiKey')
  expect(config).not.toHaveProperty('doubaoVisionApiKey')
})

test('deprecated Qwen and Doubao config fields are stripped from config and masked config', () => {
  store.setConfig({
    qwenApiKey: 'sk-qwen',
    qwenBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    qwenPrimaryModel: 'qwen-max-latest',
    qwenCodingModel: 'qwen3-coder-plus',
    qwenVisionEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    qwenVisionApiKey: 'sk-qwen-vl',
    qwenVisionModel: 'qwen3-vl-plus',
    doubaoVisionEndpoint: 'https://ark.cn-beijing.volces.com/api/v3',
    doubaoVisionApiKey: 'sk-doubao',
    doubaoVisionModel: 'doubao-seed-1-6-vision-250815',
    browserUseApiKey: 'sk-ai-v1-browser-use'
  })

  const config = store.getConfig()
  const masked = store.getMaskedConfig()
  expect(config.browserUseApiKey).toBe('sk-ai-v1-browser-use')
  for (const key of ['qwenApiKey', 'qwenVisionApiKey', 'doubaoVisionApiKey']) {
    expect(config).not.toHaveProperty(key)
    expect(masked).not.toHaveProperty(key)
  }
})

test('config has visionLoopEnabled default true', () => {
  const config = store.getConfig()
  expect(config.visionLoopEnabled).toBe(true)
})

test('getConfig migrates legacy Desktop-Use browser fallback default to enabled', () => {
  fs.mkdirSync(store.DATA_DIR, { recursive: true })
  fs.writeFileSync(path.join(store.DATA_DIR, 'config.json'), JSON.stringify({
    browserUseApiKey: 'sk-browser-relay',
    desktopUseApiKey: '',
    desktopUseAllowBrowserFallback: false
  }), 'utf-8')

  const config = store.getConfig()

  expect(config.desktopUseAllowBrowserFallback).toBe(true)
})

test('setConfig persists patches', () => {
  store.setConfig({ apiKey: 'sk-x', workspace_root: 'D:\\work' })
  expect(store.getConfig().apiKey).toBe('sk-x')
  expect(store.getConfig().workspace_root).toBe('D:\\work')
})

test('getMaskedConfig masks Browser-Use API key', () => {
  store.setConfig({ browserUseApiKey: 'sk-ai-v1-abcdef1234567890' })
  expect(store.getMaskedConfig().browserUseApiKey).toBe('sk-ai***7890')
})

test('getMaskedConfig masks Desktop-Use API key', () => {
  store.setConfig({ desktopUseApiKey: 'sk-ai-v1-desktop-use-key' })
  expect(store.getMaskedConfig().desktopUseApiKey).toBe('sk-ai***-key')
})
