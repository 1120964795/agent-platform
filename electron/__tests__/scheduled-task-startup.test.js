import { expect, test } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { parseScheduledTaskArg, createConversationOpener } = require('../services/scheduledTasks/startup')

test('parseScheduledTaskArg extracts task id after flag', () => {
  expect(parseScheduledTaskArg(['electron', '.', '--run-scheduled-task', 'sch-123'])).toBe('sch-123')
  expect(parseScheduledTaskArg(['electron', '.'])).toBe('')
})

test('createConversationOpener sends event only when window is ready', () => {
  const sent = []
  const win = {
    isDestroyed: () => false,
    webContents: { send: (channel, payload) => sent.push({ channel, payload }) },
    show: () => sent.push({ channel: 'show' }),
    focus: () => sent.push({ channel: 'focus' })
  }
  const open = createConversationOpener(() => win)

  open('conv-task')

  expect(sent).toEqual([
    { channel: 'show' },
    { channel: 'focus' },
    { channel: 'app:open-conversation', payload: { conversationId: 'conv-task' } }
  ])
})
