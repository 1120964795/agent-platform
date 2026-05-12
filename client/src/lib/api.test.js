import { beforeEach, expect, test, vi } from 'vitest'
import { api, approveAction, bootstrapRuntime, createScheduledTask, deleteArtifact, deleteConversation, deleteScheduledTask, draftScheduledTask, getRuntimeStatus, getScheduledTaskStatus, listActions, listAuditEvents, listConversations, listRunOutputs, listScheduledTasks, renameConversation, runScheduledTaskNow, updateScheduledTask } from './api.js'

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

test('deleteArtifact invokes artifacts delete channel', async () => {
  await deleteArtifact('artifact-1')
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('artifacts:delete', { id: 'artifact-1' })
})

test('maps scheduled task helpers to IPC channels', async () => {
  const draft = { prompt: 'daily at 8', schedule: { kind: 'daily', hour: 8, minute: 0 } }

  await listScheduledTasks()
  await draftScheduledTask('daily at 8')
  await createScheduledTask(draft)
  await updateScheduledTask('sch-1', { enabled: false })
  await deleteScheduledTask('sch-1')
  await runScheduledTaskNow('sch-1')
  await getScheduledTaskStatus('sch-1')

  expect(window.electronAPI.invoke).toHaveBeenCalledWith('scheduledTasks:list', undefined)
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('scheduledTasks:draft', { message: 'daily at 8' })
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('scheduledTasks:create', { draft })
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('scheduledTasks:update', { id: 'sch-1', patch: { enabled: false } })
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('scheduledTasks:delete', { id: 'sch-1' })
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('scheduledTasks:runNow', { id: 'sch-1' })
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('scheduledTasks:status', { id: 'sch-1' })
})

test('reports missing Electron IPC through onError instead of throwing', () => {
  global.window = {}
  const onError = vi.fn()

  expect(() => api.stream({
    channel: 'chat:send',
    payload: { convId: 'conv-1' },
    onError,
  })).not.toThrow()

  expect(onError).toHaveBeenCalledTimes(1)
  expect(onError.mock.calls[0][0].code).toBe('NOT_SUPPORTED')
})

test('stream listens for desktop ask and desktop event channels', () => {
  const listeners = {}
  global.window = {
    electronAPI: {
      invoke: vi.fn(async () => ({ ok: true })),
      on: vi.fn((event, handler) => {
        listeners[event] = handler
        return () => {}
      })
    }
  }
  const onDesktopAsk = vi.fn()
  const onDesktopEvent = vi.fn()

  api.stream({
    channel: 'chat:send',
    payload: { convId: 'conv-desktop' },
    onDesktopAsk,
    onDesktopEvent,
  })
  listeners['chat:desktop-ask']({ convId: 'conv-desktop', request: { requestId: 'ask-1', question: 'Continue?' } })
  listeners['chat:desktop-event']({ convId: 'conv-desktop', event: { type: 'observe', summary: 'Looking' } })

  expect(onDesktopAsk).toHaveBeenCalledWith({ convId: 'conv-desktop', request: { requestId: 'ask-1', question: 'Continue?' } })
  expect(onDesktopEvent).toHaveBeenCalledWith({ type: 'observe', summary: 'Looking' })
})
