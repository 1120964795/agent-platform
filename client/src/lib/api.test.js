import { beforeEach, expect, test, vi } from 'vitest'
import { approveAction, bootstrapRuntime, getRuntimeStatus, listActions, listAuditEvents, listRunOutputs } from './api.js'

beforeEach(() => {
  global.window = {
    electronAPI: {
      invoke: vi.fn(async (channel, payload) => ({ ok: true, channel, payload }))
    }
  }
})

test('maps runtime helpers to IPC channels', async () => {
  await getRuntimeStatus()
  await bootstrapRuntime('open-interpreter')
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('runtime:status', undefined)
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('runtime:bootstrap', { runtime: 'open-interpreter' })
})

test('maps action, audit, and output helpers', async () => {
  await listActions({ status: 'pending' })
  await approveAction('act1')
  await listAuditEvents({ risk: 'high' })
  await listRunOutputs({ sessionId: 'sess1' })
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('actions:list', { status: 'pending' })
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('actions:approve', { id: 'act1' })
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('audit:list', { filters: { risk: 'high' } })
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('outputs:list', { filters: { sessionId: 'sess1' } })
})
