import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { createElectronAPI } = require('../preload')

test('createElectronAPI exposes invoke and event subscription helpers', async () => {
  const handlers = new Map()
  const ipc = {
    invoke: vi.fn(async (channel, payload) => ({ channel, payload })),
    on: vi.fn((event, handler) => handlers.set(event, handler)),
    off: vi.fn((event, handler) => {
      if (handlers.get(event) === handler) handlers.delete(event)
    }),
    removeListener: vi.fn((event, handler) => {
      if (handlers.get(event) === handler) handlers.delete(event)
    })
  }

  const api = createElectronAPI(ipc)
  expect(api.isElectron).toBe(true)
  await expect(api.invoke('config:get', { a: 1 })).resolves.toEqual({ channel: 'config:get', payload: { a: 1 } })
  await expect(api.openExternal('https://platform.deepseek.com/api_keys')).resolves.toEqual({
    channel: 'app:open-external',
    payload: { url: 'https://platform.deepseek.com/api_keys' }
  })

  const received = []
  const off = api.on('chat:delta', (payload) => received.push(payload))
  handlers.get('chat:delta')({}, { text: 'hello' })
  expect(received).toEqual([{ text: 'hello' }])
  off()
  expect(ipc.off).toHaveBeenCalledTimes(1)

  const opened = []
  const offOpen = api.onOpenConversation((payload) => opened.push(payload))
  handlers.get('app:open-conversation')({}, { conversationId: 'conv-task' })
  expect(opened).toEqual([{ conversationId: 'conv-task' }])
  offOpen()
  expect(ipc.removeListener).toHaveBeenCalledTimes(1)

  await expect(api.scheduledTasks.list()).resolves.toEqual({ channel: 'scheduledTasks:list', payload: undefined })
  await expect(api.scheduledTasks.runNow({ id: 'sch-1' })).resolves.toEqual({ channel: 'scheduledTasks:runNow', payload: { id: 'sch-1' } })
})
