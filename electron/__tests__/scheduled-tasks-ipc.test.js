import { beforeEach, expect, test, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-scheduled-ipc-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')

const require = createRequire(import.meta.url)
const convDir = path.join(TMP, 'conversations')
require.cache[require.resolve('electron')] = {
  exports: {
    app: {
      getPath: () => {
        fs.mkdirSync(convDir, { recursive: true })
        return convDir
      }
    }
  }
}

const { store } = require('../store')
const scheduledTasks = require('../ipc/scheduledTasks')

function createIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler))
  }
}

beforeEach(() => {
  try { store.closeConversationStore() } catch {}
  fs.rmSync(TMP, { recursive: true, force: true })
})

test('scheduledTasks:draft returns parsed draft and full trust warning', async () => {
  const ipcMain = createIpcMain()
  scheduledTasks.register(ipcMain, {
    now: () => new Date('2026-05-12T01:00:00+08:00'),
    windowsScheduler: { registerTask: vi.fn() }
  })

  const result = await ipcMain.handlers.get('scheduledTasks:draft')({}, {
    message: '每天 8 点打开 https://example.com 检查更新'
  })

  expect(result.ok).toBe(true)
  expect(result.draft).toMatchObject({
    name: '每天 8 点打开 https://example.com 检查更新',
    prompt: '每天 8 点打开 https://example.com 检查更新',
    schedule: { kind: 'daily', hour: 8, minute: 0 },
    preauthorizationWarning: expect.stringContaining('不再二次确认')
  })
})

test('scheduledTasks:create persists preauthorized task and creates dedicated conversation', async () => {
  const registerTask = vi.fn(async (task) => ({ registered: true, taskName: `\\AionUi\\ScheduledTasks\\${task.id}` }))
  const ipcMain = createIpcMain()
  scheduledTasks.register(ipcMain, {
    now: () => new Date('2026-05-12T01:00:00+08:00'),
    windowsScheduler: { registerTask },
    scheduledTaskExecutablePath: 'C:\\Electron\\electron.exe',
    scheduledTaskAppPath: 'C:\\Users\\g\\Desktop\\5.12'
  })

  const draft = (await ipcMain.handlers.get('scheduledTasks:draft')({}, {
    message: '每天 8 点打开 https://example.com 检查更新'
  })).draft
  const created = await ipcMain.handlers.get('scheduledTasks:create')({}, { draft })

  expect(created.ok).toBe(true)
  expect(created.task.preauthorized).toBe(true)
  expect(created.task.conversationId).toMatch(/^conv_/)
  expect(registerTask).toHaveBeenCalledOnce()
  expect(registerTask).toHaveBeenCalledWith(expect.objectContaining({ id: created.task.id }), {
    executablePath: 'C:\\Electron\\electron.exe',
    appPath: 'C:\\Users\\g\\Desktop\\5.12'
  })
  expect(store.listScheduledTasks()).toHaveLength(1)
  expect(store.getConversation(created.task.conversationId).title).toContain('定时任务')
})

test('scheduledTasks:update pauses task and re-registers when enabled', async () => {
  const registerTask = vi.fn(async () => ({ registered: true }))
  const deleteTask = vi.fn(async () => ({ registered: false }))
  const ipcMain = createIpcMain()
  scheduledTasks.register(ipcMain, {
    now: () => new Date('2026-05-12T01:00:00+08:00'),
    windowsScheduler: { registerTask, deleteTask }
  })

  const draft = (await ipcMain.handlers.get('scheduledTasks:draft')({}, { message: '每天 8 点检查网页' })).draft
  const task = (await ipcMain.handlers.get('scheduledTasks:create')({}, { draft })).task

  const paused = await ipcMain.handlers.get('scheduledTasks:update')({}, { id: task.id, patch: { enabled: false } })
  const resumed = await ipcMain.handlers.get('scheduledTasks:update')({}, { id: task.id, patch: { enabled: true } })

  expect(paused.task.enabled).toBe(false)
  expect(resumed.task.enabled).toBe(true)
  expect(deleteTask).toHaveBeenCalledWith(task.id, expect.any(Object))
  expect(registerTask).toHaveBeenCalledTimes(2)
})

test('scheduledTasks:delete removes task and Windows registration', async () => {
  const deleteTask = vi.fn(async () => ({ registered: false }))
  const ipcMain = createIpcMain()
  scheduledTasks.register(ipcMain, {
    now: () => new Date('2026-05-12T01:00:00+08:00'),
    windowsScheduler: { registerTask: vi.fn(async () => ({ registered: true })), deleteTask }
  })

  const draft = (await ipcMain.handlers.get('scheduledTasks:draft')({}, { message: '每天 8 点检查网页' })).draft
  const task = (await ipcMain.handlers.get('scheduledTasks:create')({}, { draft })).task

  const result = await ipcMain.handlers.get('scheduledTasks:delete')({}, { id: task.id })

  expect(result.ok).toBe(true)
  expect(store.listScheduledTasks()).toEqual([])
  expect(deleteTask).toHaveBeenCalledWith(task.id, expect.any(Object))
})
