import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const actions = require('../ipc/actions')

function ipc() {
  const handlers = new Map()
  return { handlers, handle: vi.fn((channel, handler) => handlers.set(channel, handler)) }
}

test('registers action queue handlers and returns actions', async () => {
  const ipcMain = ipc()
  actions.register(ipcMain)
  expect([...ipcMain.handlers.keys()]).toEqual(expect.arrayContaining(['actions:list', 'actions:approve', 'actions:deny', 'actions:emergencyStop']))
  const result = await ipcMain.handlers.get('actions:list')({}, {})
  expect(result.ok).toBe(true)
  expect(Array.isArray(result.actions)).toBe(true)
})

test('approval failures are wrapped', async () => {
  const ipcMain = ipc()
  actions.register(ipcMain)
  const result = await ipcMain.handlers.get('actions:approve')({}, { id: 'missing' })
  expect(result.ok).toBe(false)
  expect(result.error.code).toBe('ACTION_NOT_FOUND')
})
