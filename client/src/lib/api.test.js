import { beforeEach, expect, test, vi } from 'vitest'
import { api, approveAction, bootstrapRuntime, deleteArtifact, deleteConversation, getRuntimeStatus, listActions, listArtifacts, listAuditEvents, listConversations, listRunOutputs, renameConversation } from './api.js'

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

test('maps artifact helpers to IPC channels', async () => {
  await listArtifacts()
  await deleteArtifact('artifact-1')
  await api.get('/api/artifacts')

  expect(window.electronAPI.invoke).toHaveBeenCalledWith('artifacts:list', undefined)
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('artifacts:delete', { id: 'artifact-1' })
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('artifacts:list', undefined)
})

test('maps conversation helpers to IPC channels', async () => {
  await listConversations('alpha')
  await renameConversation('conv-1', 'Renamed')
  await deleteConversation('conv-2')
  await api.get('/api/conversations')

  expect(window.electronAPI.invoke).toHaveBeenCalledWith('conversations:list', { search: 'alpha' })
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('conversations:rename', { id: 'conv-1', title: 'Renamed' })
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('conversations:delete', { id: 'conv-2' })
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('conversations:list', undefined)
})
