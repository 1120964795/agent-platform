import { test, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-ipc-test-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')
const require = createRequire(import.meta.url)

// Mock electron for conversationStore (SQLite-backed CRUD needs app.getPath)
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

const { registerAll } = require('../ipc')
const { store } = require('../store')
const artifacts = require('../ipc/artifacts')

function createIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler))
  }
}

beforeEach(() => {
  try { store.closeConversationStore() } catch {}
  try { fs.rmSync(TMP, { recursive: true, force: true }) } catch {}
})

test('registerAll registers core IPC channels', () => {
  const ipcMain = createIpcMain()
  registerAll(ipcMain, {
    app: { getPath: (name) => `${name}-path` },
    dialog: { showOpenDialog: vi.fn() },
    shell: { openPath: vi.fn() },
    mainWindow: null
  })

  expect([...ipcMain.handlers.keys()]).toEqual(expect.arrayContaining([
    'config:get',
    'config:set',
    'conversations:list',
    'conversations:get',
    'conversations:upsert',
    'conversations:rename',
    'conversations:delete',
    'artifacts:list',
    'files:list',
    'files:search',
    'dialog:selectFile',
    'dialog:selectDirectory',
    'shell:openPath',
    'app:getPaths',
    'app:open-external',
    'scheduledTasks:list',
    'scheduledTasks:draft',
    'scheduledTasks:create',
    'scheduledTasks:update',
    'scheduledTasks:delete',
    'scheduledTasks:runNow'
  ]))
})

test('config handlers read and patch config', async () => {
  const ipcMain = createIpcMain()
  registerAll(ipcMain)

  const setResult = await ipcMain.handlers.get('config:set')({}, { apiKey: 'sk-test', workspace_root: 'D:\\work' })
  expect(setResult.ok).toBe(true)
  expect(setResult.config.apiKey).toBe('***')

  const getResult = await ipcMain.handlers.get('config:get')()
  expect(getResult.config.workspace_root).toBe('D:\\work')
  expect(store.getConfig().apiKey).toBe('sk-test')
})

test('config handlers persist Browser-Use settings and mask key', async () => {
  const ipcMain = createIpcMain()
  registerAll(ipcMain)

  const setResult = await ipcMain.handlers.get('config:set')({}, {
    browserUseApiKey: '  sk-ai-v1-browser-use  ',
    browserUseEndpoint: '  https://zenmux.ai/api/v1  ',
    browserUseModel: '  openai/gpt-5.5  ',
    browserUseVisionEnabled: true
  })

  expect(setResult.ok).toBe(true)
  expect(setResult.config.browserUseApiKey).toBe('sk-ai***-use')
  expect(store.getConfig().browserUseApiKey).toBe('sk-ai-v1-browser-use')
  expect(store.getConfig().browserUseEndpoint).toBe('https://zenmux.ai/api/v1')
  expect(store.getConfig().browserUseModel).toBe('openai/gpt-5.5')
  expect(store.getConfig().browserUseVisionEnabled).toBe(true)

  await ipcMain.handlers.get('config:set')({}, {
    browserUseApiKey: '   ',
    browserUseEndpoint: '   ',
    browserUseModel: '   '
  })

  expect(store.getConfig().browserUseApiKey).toBe('sk-ai-v1-browser-use')
  expect(store.getConfig().browserUseEndpoint).toBe('https://zenmux.ai/api/v1')
  expect(store.getConfig().browserUseModel).toBe('openai/gpt-5.5')
})

test('config handlers persist Desktop-Use settings and mask key', async () => {
  const ipcMain = createIpcMain()
  registerAll(ipcMain)

  const setResult = await ipcMain.handlers.get('config:set')({}, {
    desktopUseApiKey: '  sk-ai-v1-desktop-use-key  ',
    desktopUseEndpoint: '  https://desktop-relay.example/v1  ',
    desktopUseModel: '  openai/gpt-5.5  ',
    desktopUseGroundingBackend: '  uitars  ',
    desktopUseAllowBrowserFallback: true
  })

  expect(setResult.ok).toBe(true)
  expect(setResult.config.desktopUseApiKey).toBe('sk-ai***-key')
  expect(store.getConfig().desktopUseApiKey).toBe('sk-ai-v1-desktop-use-key')
  expect(store.getConfig().desktopUseEndpoint).toBe('https://desktop-relay.example/v1')
  expect(store.getConfig().desktopUseModel).toBe('openai/gpt-5.5')
  expect(store.getConfig().desktopUseGroundingBackend).toBe('uitars')
  expect(store.getConfig().desktopUseAllowBrowserFallback).toBe(true)

  await ipcMain.handlers.get('config:set')({}, {
    desktopUseApiKey: '   ',
    desktopUseEndpoint: '   ',
    desktopUseModel: '   ',
    desktopUseGroundingBackend: '   ',
    desktopUseAllowBrowserFallback: false
  })

  expect(store.getConfig().desktopUseApiKey).toBe('sk-ai-v1-desktop-use-key')
  expect(store.getConfig().desktopUseEndpoint).toBe('https://desktop-relay.example/v1')
  expect(store.getConfig().desktopUseModel).toBe('openai/gpt-5.5')
  expect(store.getConfig().desktopUseGroundingBackend).toBe('uitars')
  expect(store.getConfig().desktopUseAllowBrowserFallback).toBe(false)
})

test('artifacts:delete removes active artifact and records deletion metadata', async () => {
  const ipcMain = createIpcMain()
  artifacts.register(ipcMain)
  store.addArtifact({ id: 'artifact-1', type: 'word', title: 'Report', path: path.join(store.GENERATED_DIR, 'report.docx') })

  const deleted = await ipcMain.handlers.get('artifacts:delete')({}, { id: 'artifact-1' })

  expect(deleted.ok).toBe(true)
  expect(store.listArtifacts().some((item) => item.id === 'artifact-1')).toBe(false)
  expect(store.getData().deletedArtifacts[0].id).toBe('artifact-1')
})

test('deleted artifact is restored to active list when system-trash item still exists', () => {
  const filePath = path.join(store.GENERATED_DIR, 'restore.docx')
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, 'x')
  store.saveData({
    version: 1,
    conversations: [],
    artifacts: [],
    deletedArtifacts: [{
      id: 'artifact-restore',
      type: 'word',
      title: 'Restorable',
      path: filePath,
      deletedAt: new Date().toISOString(),
      deleteInfo: { status: 'system-trash' }
    }],
    scheduledTasks: []
  })

  expect(store.listArtifacts().map((item) => item.id)).toContain('artifact-restore')
  expect(store.getData().deletedArtifacts).toEqual([])
})

test('conversation upsert and get handlers round trip data', async () => {
  const ipcMain = createIpcMain()
  registerAll(ipcMain)

  await ipcMain.handlers.get('conversations:upsert')({}, {
    id: 'conv-1',
    title: 'Hello',
    messages: [{ role: 'user', content: 'hi' }]
  })

  const result = await ipcMain.handlers.get('conversations:get')({}, { id: 'conv-1' })
  expect(result.ok).toBe(true)
  expect(result.conversation.messages).toEqual([{ role: 'user', content: 'hi' }])
})

test('conversation list, rename, and delete handlers manage chat history', async () => {
  const ipcMain = createIpcMain()
  registerAll(ipcMain)

  await ipcMain.handlers.get('conversations:upsert')({}, {
    id: 'conv-search-1',
    title: 'Alpha project',
    messages: [{ role: 'user', content: 'first alpha message' }]
  })
  await ipcMain.handlers.get('conversations:upsert')({}, {
    id: 'conv-search-2',
    title: 'Beta notes',
    messages: [{ role: 'user', content: 'first beta message' }]
  })

  const filtered = await ipcMain.handlers.get('conversations:list')({}, { search: 'alpha' })
  expect(filtered.ok).toBe(true)
  expect(filtered.conversations.map(c => c.id)).toEqual(['conv-search-1'])
  expect(filtered.conversations[0].firstMessagePreview).toBe('first alpha message')

  const renamed = await ipcMain.handlers.get('conversations:rename')({}, { id: 'conv-search-1', title: 'Gamma project' })
  expect(renamed.ok).toBe(true)
  expect(renamed.conversation.title).toBe('Gamma project')

  const badRename = await ipcMain.handlers.get('conversations:rename')({}, { id: 'conv-search-1', title: '' })
  expect(badRename.ok).toBe(false)
  expect(badRename.error.code).toBe('BAD_REQUEST')

  const deleted = await ipcMain.handlers.get('conversations:delete')({}, { id: 'conv-search-2' })
  expect(deleted.ok).toBe(true)
  const missing = await ipcMain.handlers.get('conversations:get')({}, { id: 'conv-search-2' })
  expect(missing.ok).toBe(false)
})

test('files:list returns directory entries in full permission mode', async () => {
  const root = path.join(TMP, 'files')
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(path.join(root, 'a.txt'), 'a')
  store.setConfig({ permissionMode: 'full' })

  const ipcMain = createIpcMain()
  registerAll(ipcMain)
  const result = await ipcMain.handlers.get('files:list')({}, { dir: root })

  expect(result.ok).toBe(true)
  expect(result.items.map((item) => item.name)).toContain('a.txt')
})
