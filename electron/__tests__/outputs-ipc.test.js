import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const outputs = require('../ipc/outputs')

function ipc() {
  const handlers = new Map()
  return { handlers, handle: vi.fn((channel, handler) => handlers.set(channel, handler)) }
}

test('registers output list/open/export handlers', async () => {
  const ipcMain = ipc()
  const shell = { openPath: vi.fn(async () => '') }
  outputs.register(ipcMain, { shell })
  expect([...ipcMain.handlers.keys()]).toEqual(expect.arrayContaining(['outputs:list', 'outputs:open', 'outputs:export']))
  const list = await ipcMain.handlers.get('outputs:list')({}, {})
  expect(list.ok).toBe(true)
  const opened = await ipcMain.handlers.get('outputs:open')({}, { path: 'C:\\tmp\\out.txt' })
  expect(opened.ok).toBe(true)
  expect(shell.openPath).toHaveBeenCalledWith('C:\\tmp\\out.txt')
})
