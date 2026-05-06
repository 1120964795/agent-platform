import { test, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-ipc-test-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')
const require = createRequire(import.meta.url)
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
  fs.rmSync(TMP, { recursive: true, force: true })
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
    'auth:getState',
    'auth:register',
    'auth:login',
    'auth:logout',
    'auth:migrateLocalStorage',
    'config:get',
    'config:set',
    'conversations:list',
    'conversations:get',
    'conversations:upsert',
    'artifacts:list',
    'files:list',
    'files:search',
    'dialog:selectFile',
    'dialog:selectDirectory',
    'shell:openPath',
    'app:getPaths'
  ]))
})

test('config handlers read and patch config', async () => {
  const ipcMain = createIpcMain()
  registerAll(ipcMain)

  const setResult = await ipcMain.handlers.get('config:set')({}, { apiKey: 'sk-test', minimaxApiKey: 'mini-test', modelProvider: 'minimax', workspace_root: 'D:\\work' })
  expect(setResult.ok).toBe(true)
  expect(setResult.config.apiKey).toBe('***')
  expect(setResult.config.minimaxApiKey).toBe('***')

  const getResult = await ipcMain.handlers.get('config:get')()
  expect(getResult.config.workspace_root).toBe('D:\\work')
  expect(getResult.config.modelProvider).toBe('minimax')
  expect(store.getConfig().apiKey).toBe('sk-test')
  expect(store.getConfig().minimaxApiKey).toBe('mini-test')
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

test('auth handlers register and login accounts through the main process store', async () => {
  const ipcMain = createIpcMain()
  registerAll(ipcMain)

  const registerResult = await ipcMain.handlers.get('auth:register')({}, {
    username: 'alice',
    password: '123456'
  })
  expect(registerResult.ok).toBe(true)

  const duplicateResult = await ipcMain.handlers.get('auth:register')({}, {
    username: 'ALICE',
    password: '123456'
  })
  expect(duplicateResult.ok).toBe(false)
  expect(duplicateResult.error.code).toBe('AUTH_ACCOUNT_EXISTS')

  const loginResult = await ipcMain.handlers.get('auth:login')({}, {
    username: 'alice',
    password: '123456',
    rememberPassword: true,
    autoLogin: true
  })
  expect(loginResult.ok).toBe(true)
  expect(loginResult.user).toEqual({ username: 'alice' })
  expect(loginResult.currentUser).toEqual({ username: 'alice' })
  expect(loginResult.usernameOptions).toEqual(['alice'])

  const auth = store.getAuth()
  expect(auth.accounts).toHaveLength(1)
  expect(auth.accounts[0].passwordHash).toBeTruthy()
  expect(auth.accounts[0].password).toBeUndefined()
  expect(auth.loginPrefs).toMatchObject({
    username: 'alice',
    rememberPassword: true,
    autoLogin: true
  })
})

test('conversation handlers filter by username when provided', async () => {
  const ipcMain = createIpcMain()
  registerAll(ipcMain)

  await ipcMain.handlers.get('conversations:upsert')({}, {
    id: 'conv-alice',
    title: 'Alice',
    username: 'alice',
    messages: [{ role: 'user', content: 'alice chat' }]
  })
  await ipcMain.handlers.get('conversations:upsert')({}, {
    id: 'conv-bob',
    title: 'Bob',
    username: 'bob',
    messages: [{ role: 'user', content: 'bob chat' }]
  })

  const listResult = await ipcMain.handlers.get('conversations:list')({}, { username: 'alice' })
  expect(listResult.conversations.map((item) => item.id)).toEqual(['conv-alice'])

  const blockedResult = await ipcMain.handlers.get('conversations:get')({}, { id: 'conv-bob', username: 'alice' })
  expect(blockedResult.ok).toBe(false)
  expect(blockedResult.error.code).toBe('NOT_FOUND')
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
