import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const audit = require('../ipc/audit')

function ipc() {
  const handlers = new Map()
  return { handlers, handle: vi.fn((channel, handler) => handlers.set(channel, handler)) }
}

test('registers audit list and export handlers', async () => {
  const ipcMain = ipc()
  audit.register(ipcMain)
  expect([...ipcMain.handlers.keys()]).toEqual(expect.arrayContaining(['audit:list', 'audit:export']))
  const result = await ipcMain.handlers.get('audit:list')({}, {})
  expect(result.ok).toBe(true)
  expect(Array.isArray(result.events)).toBe(true)
})
