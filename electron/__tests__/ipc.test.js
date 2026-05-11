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
    'app:open-external'
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

test('config handlers ignore removed Qwen and Doubao settings', async () => {
  const ipcMain = createIpcMain()
  registerAll(ipcMain)

  const result = await ipcMain.handlers.get('config:set')({}, {
    qwenApiKey: 'sk-qwen-secret',
    qwenBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    qwenPrimaryModel: 'qwen-max-latest',
    doubaoVisionApiKey: 'sk-doubao-secret',
    doubaoVisionEndpoint: 'https://ark.cn-beijing.volces.com/api/v3',
    doubaoVisionModel: 'doubao-seed-1-6-vision-250815'
  })

  expect(result.ok).toBe(true)
  expect(result.config).not.toHaveProperty('qwenApiKey')
  expect(result.config).not.toHaveProperty('doubaoVisionApiKey')
  expect(store.getConfig()).not.toHaveProperty('qwenApiKey')
  expect(store.getConfig()).not.toHaveProperty('doubaoVisionApiKey')
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

test('artifact delete handler moves generated file to system trash', async () => {
  const ipcMain = createIpcMain()
  const trashItem = vi.fn(async (targetPath) => {
    fs.unlinkSync(targetPath)
  })
  registerAll(ipcMain, { shell: { trashItem } })
  const generatedDir = path.join(TMP, 'generated')
  fs.mkdirSync(generatedDir, { recursive: true })
  const filePath = path.join(generatedDir, 'report.docx')
  fs.writeFileSync(filePath, 'hello')
  store.addArtifact({
    id: 'artifact-1',
    type: 'word',
    filename: 'report.docx',
    path: filePath,
    title: '测试报告',
    createdAt: new Date().toISOString()
  })

  const deleted = await ipcMain.handlers.get('artifacts:delete')({}, { id: 'artifact-1' })

  expect(deleted.ok).toBe(true)
  expect(trashItem).toHaveBeenCalledWith(filePath)
  expect(fs.existsSync(filePath)).toBe(false)
  expect(store.listArtifacts()).toEqual([])
})

test('artifact list restores metadata when a trashed file is restored', async () => {
  const ipcMain = createIpcMain()
  const trashItem = vi.fn(async (targetPath) => {
    fs.unlinkSync(targetPath)
  })
  registerAll(ipcMain, { shell: { trashItem } })
  const generatedDir = path.join(TMP, 'generated')
  fs.mkdirSync(generatedDir, { recursive: true })
  const filePath = path.join(generatedDir, 'restore-me.docx')
  fs.writeFileSync(filePath, 'hello')
  store.addArtifact({
    id: 'artifact-restore',
    type: 'word',
    filename: 'restore-me.docx',
    path: filePath,
    title: 'Restore report',
    createdAt: new Date().toISOString()
  })

  const deleted = await ipcMain.handlers.get('artifacts:delete')({}, { id: 'artifact-restore' })
  expect(deleted.ok).toBe(true)
  expect(store.listArtifacts()).toEqual([])

  fs.writeFileSync(filePath, 'hello')
  const listed = await ipcMain.handlers.get('artifacts:list')()

  expect(listed.ok).toBe(true)
  expect(listed.items).toEqual([expect.objectContaining({
    id: 'artifact-restore',
    title: 'Restore report',
    path: filePath
  })])
})

test('artifact delete handler falls back when system trash fails', async () => {
  const ipcMain = createIpcMain()
  const trashItem = vi.fn(async () => {
    throw new Error('trash unavailable')
  })
  registerAll(ipcMain, { shell: { trashItem } })
  const generatedDir = path.join(TMP, 'generated')
  fs.mkdirSync(generatedDir, { recursive: true })
  const filePath = path.join(generatedDir, 'locked-report.docx')
  fs.writeFileSync(filePath, 'hello')
  store.addArtifact({
    id: 'artifact-fallback',
    type: 'word',
    filename: 'locked-report.docx',
    path: filePath,
    title: 'Fallback report',
    createdAt: new Date().toISOString()
  })

  const deleted = await ipcMain.handlers.get('artifacts:delete')({}, { id: 'artifact-fallback' })

  expect(deleted.ok).toBe(true)
  expect(deleted.file.status).toBe('app-trash')
  expect(deleted.warning).toContain('系统回收站')
  expect(fs.existsSync(filePath)).toBe(false)
  expect(fs.existsSync(deleted.file.trashedPath)).toBe(true)
  expect(fs.readFileSync(deleted.file.trashedPath, 'utf8')).toBe('hello')
  expect(store.listArtifacts()).toEqual([])
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
