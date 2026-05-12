import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const runtime = require('../ipc/runtime')

function ipc() {
  const handlers = new Map()
  return { handlers, handle: vi.fn((channel, handler) => handlers.set(channel, handler)) }
}

test('registers runtime status and bootstrap handlers', async () => {
  const ipcMain = ipc()
  runtime.register(ipcMain)
  expect([...ipcMain.handlers.keys()]).toEqual(expect.arrayContaining(['runtime:status', 'runtime:bootstrap', 'runtime:start', 'runtime:stop']))
  const status = await ipcMain.handlers.get('runtime:status')()
  expect(status.ok).toBe(true)
  expect(status.runtimes.map((item) => item.runtime)).toEqual(expect.arrayContaining(['deepseek', 'browser-use', 'desktop-use', 'dry-run']))
})

test('runtime status does not expose removed Qwen or Doubao runtimes', async () => {
  const ipcMain = ipc()
  runtime.register(ipcMain)
  const status = await ipcMain.handlers.get('runtime:status')({})
  const names = status.runtimes.map((item) => item.runtime)
  expect(names).not.toContain('qwen')
  expect(names).not.toContain('doubao')
})

test('runtime bootstrap returns expected failure wrapper for unknown runtime', async () => {
  const ipcMain = ipc()
  runtime.register(ipcMain)
  const result = await ipcMain.handlers.get('runtime:bootstrap')({}, { runtime: 'unknown' })
  expect(result.ok).toBe(false)
  expect(result.error.message).toContain('Unsupported runtime unknown')
})

test('runtime configure ignores removed provider keys', async () => {
  const ipcMain = ipc()
  runtime.register(ipcMain)
  const result = await ipcMain.handlers.get('runtime:configure')({}, {
    qwenApiKey: 'sk-qwen-secret-value',
    doubaoVisionApiKey: 'sk-doubao-secret-value',
    browserUseApiKey: 'sk-ai-v1-browser-use'
  })
  expect(result.ok).toBe(true)
  expect(result.config.browserUseApiKey).toBe('sk-ai***-use')
  expect(result.config).not.toHaveProperty('qwenApiKey')
  expect(result.config).not.toHaveProperty('doubaoVisionApiKey')
})
