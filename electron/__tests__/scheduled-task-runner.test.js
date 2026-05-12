import { expect, test, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { createScheduler } = require('../services/scheduledTasks/scheduler')

function makeStore(task) {
  const conversations = new Map()
  return {
    listScheduledTasks: vi.fn(() => [task]),
    upsertScheduledTask: vi.fn((next) => Object.assign(task, next)),
    appendTaskHistory: vi.fn((taskId, entry) => {
      task.history = [entry, ...(task.history || [])]
      task.lastRun = entry.runAt
    }),
    getConversation: vi.fn((id) => conversations.get(id) || { id, title: 'Task', messages: [] }),
    upsertConversation: vi.fn((conversation) => {
      conversations.set(conversation.id, conversation)
      return conversation
    })
  }
}

test('scheduler runNow appends progress to task conversation and records success', async () => {
  const task = {
    id: 'sch-runner',
    name: 'Runner',
    prompt: 'run scheduled work',
    enabled: true,
    preauthorized: true,
    conversationId: 'conv-runner',
    schedule: { kind: 'daily', hour: 8, minute: 0, timezone: 'Asia/Shanghai', human: '每天 08:00' },
    history: []
  }
  const store = makeStore(task)
  const runTurn = vi.fn(async ({ preauthorized, messages, onStreamEvent }) => {
    expect(preauthorized).toBe(true)
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'run scheduled work' })
    onStreamEvent({ type: 'tool_progress', summary: 'working', tool: 'browser_task' })
    return { finalText: 'done', history: [] }
  })

  const scheduler = createScheduler({ store, runTurn, now: () => new Date('2026-05-12T00:00:00.000Z') })
  const result = await scheduler.runNow('sch-runner', 'manual')

  expect(result.ok).toBe(true)
  expect(store.appendTaskHistory).toHaveBeenCalledWith('sch-runner', expect.objectContaining({ status: 'success', trigger: 'manual' }))
  expect(store.upsertConversation).toHaveBeenCalledWith(expect.objectContaining({
    id: 'conv-runner',
    messages: expect.arrayContaining([
      expect.objectContaining({ role: 'assistant', content: expect.stringContaining('Scheduled run started') }),
      expect.objectContaining({ role: 'assistant', content: expect.stringContaining('done') })
    ])
  }))
})

test('one-time tasks are disabled after successful run', async () => {
  const task = {
    id: 'sch-once',
    name: 'One time reminder',
    prompt: '今天晚上8点提醒我',
    enabled: true,
    preauthorized: true,
    conversationId: 'conv-once',
    schedule: {
      kind: 'once',
      runAt: '2026-05-12T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      human: '今天 20:00'
    },
    nextRunAt: '2026-05-12T12:00:00.000Z',
    history: []
  }
  const store = makeStore(task)
  const scheduler = createScheduler({
    store,
    now: () => new Date('2026-05-12T12:01:00.000Z'),
    runTurn: async () => ({ finalText: 'Reminder complete.', history: [] })
  })

  const result = await scheduler.runNow('sch-once', 'manual')

  expect(result.ok).toBe(true)
  expect(task.enabled).toBe(false)
  expect(task.nextRunAt).toBeNull()
  expect(task.lastStatus).toBe('success')
})

test('one-time tasks are disabled after failed run', async () => {
  const task = {
    id: 'sch-once-error',
    name: 'One time reminder',
    prompt: '今天晚上8点提醒我',
    enabled: true,
    preauthorized: true,
    conversationId: 'conv-once-error',
    schedule: {
      kind: 'once',
      runAt: '2026-05-12T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      human: '今天 20:00'
    },
    nextRunAt: '2026-05-12T12:00:00.000Z',
    history: []
  }
  const store = makeStore(task)
  const scheduler = createScheduler({
    store,
    now: () => new Date('2026-05-12T12:01:00.000Z'),
    runTurn: async () => { throw new Error('boom') }
  })

  const result = await scheduler.runNow('sch-once-error', 'manual')

  expect(result.ok).toBe(false)
  expect(task.enabled).toBe(false)
  expect(task.nextRunAt).toBeNull()
  expect(task.lastStatus).toBe('error')
})

test('scheduler skips overlapping runs for same task', async () => {
  const task = {
    id: 'sch-overlap',
    name: 'Overlap',
    prompt: 'run',
    enabled: true,
    preauthorized: true,
    conversationId: 'conv-overlap',
    schedule: { kind: 'daily', hour: 8, minute: 0, timezone: 'Asia/Shanghai', human: '每天 08:00' },
    history: []
  }
  const store = makeStore(task)
  let release
  const runTurn = vi.fn(() => new Promise((resolve) => { release = () => resolve({ finalText: 'done', history: [] }) }))
  const scheduler = createScheduler({ store, runTurn, now: () => new Date('2026-05-12T00:00:00.000Z') })

  const first = scheduler.runNow('sch-overlap', 'manual')
  const second = await scheduler.runNow('sch-overlap', 'manual')
  release()
  await first

  expect(second).toEqual({ ok: false, skipped: true, reason: 'already-running' })
  expect(runTurn).toHaveBeenCalledTimes(1)
})
