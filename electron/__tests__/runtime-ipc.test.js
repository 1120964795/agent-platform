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
  expect(status.runtimes.map((item) => item.runtime)).toEqual(expect.arrayContaining(['qwen', 'deepseek', 'browser-use', 'ui-tars', 'aionui-dry-run']))
})

test('runtime bootstrap returns expected failure wrapper for unknown runtime', async () => {
  const ipcMain = ipc()
  runtime.register(ipcMain)
  const result = await ipcMain.handlers.get('runtime:bootstrap')({}, { runtime: 'unknown' })
  expect(result.ok).toBe(false)
  expect(result.error.message).toContain('未知运行时')
})

test('runtime configure sanitizes and masks provider keys', async () => {
  const ipcMain = ipc()
  runtime.register(ipcMain)
  const result = await ipcMain.handlers.get('runtime:configure')({}, { qwenApiKey: 'sk-qwen-secret-value' })
  expect(result.ok).toBe(true)
  expect(result.config.qwenApiKey).toContain('***')
  expect(result.config.qwenApiKey).not.toContain('secret-value')
})

test('runtime status tracks Browser Use and UI-TARS API keys separately', async () => {
  const status = await runtime.runtimeStatus({ browserUseApiKey: 'sk-browser', doubaoVisionApiKey: '' })
  const browserUse = status.find((item) => item.runtime === 'browser-use')
  const uiTars = status.find((item) => item.runtime === 'ui-tars')

  expect(browserUse.configured).toBe(true)
  expect(uiTars.configured).toBe(false)
})
