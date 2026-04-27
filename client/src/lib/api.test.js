import { beforeEach, expect, test, vi } from 'vitest'
import { api } from './api.js'

function mockElectronAPI() {
  const off = vi.fn()
  const electronAPI = {
    invoke: vi.fn(async () => ({ ok: true })),
    on: vi.fn(() => off)
  }
  globalThis.window = { electronAPI }
  return { electronAPI, off }
}

beforeEach(() => {
  vi.restoreAllMocks()
  delete globalThis.window
})

test('stream unsubscribe removes listeners without cancelling the remote chat', () => {
  const { electronAPI, off } = mockElectronAPI()
  const streamHandle = api.stream({
    channel: 'chat:send',
    payload: { convId: 'conv-1', messages: [] }
  })

  streamHandle.unsubscribe()

  expect(off).toHaveBeenCalledTimes(8)
  expect(electronAPI.invoke).toHaveBeenCalledTimes(1)
  expect(electronAPI.invoke).toHaveBeenCalledWith('chat:send', { convId: 'conv-1', messages: [] })
})

test('stream cancel removes listeners and cancels the remote chat', () => {
  const { electronAPI, off } = mockElectronAPI()
  const streamHandle = api.stream({
    channel: 'chat:send',
    payload: { convId: 'conv-1', messages: [] }
  })

  streamHandle.cancel()

  expect(off).toHaveBeenCalledTimes(8)
  expect(electronAPI.invoke).toHaveBeenCalledWith('chat:send', { convId: 'conv-1', messages: [] })
  expect(electronAPI.invoke).toHaveBeenCalledWith('chat:cancel', { convId: 'conv-1' })
})

test('stream unsubscribe ignores later invoke failures', async () => {
  const off = vi.fn()
  const error = new Error('boom')
  const electronAPI = {
    invoke: vi.fn(() => Promise.reject(error)),
    on: vi.fn(() => off)
  }
  globalThis.window = { electronAPI }
  const onError = vi.fn()

  const streamHandle = api.stream({
    channel: 'chat:send',
    payload: { convId: 'conv-1', messages: [] },
    onError
  })
  streamHandle.unsubscribe()
  await Promise.resolve()

  expect(onError).not.toHaveBeenCalled()
})
