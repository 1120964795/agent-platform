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
const { normalizeDirectoryPath, getParentDir } = require('../ipc/files')

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
    'chat:send',
    'chat:cancel',
    'files:list',
    'files:search',
    'dialog:selectFile',
    'dialog:selectDirectory',
    'dialog:saveFileAs',
    'shell:openPath',
    'app:getPaths'
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

test('auth migration imports legacy localStorage accounts once', async () => {
  const ipcMain = createIpcMain()
  registerAll(ipcMain)

  const migrateResult = await ipcMain.handlers.get('auth:migrateLocalStorage')({}, {
    accounts: [
      { username: 'alice', password: '123456' },
      { username: 'bob', password: 'abcdef' }
    ],
    loginHistory: ['bob', 'alice'],
    loginPrefs: {
      username: 'bob',
      password: 'abcdef',
      rememberPassword: true,
      autoLogin: false
    },
    session: {
      username: 'alice',
      autoLogin: true
    }
  })

  expect(migrateResult.ok).toBe(true)
  expect(migrateResult.currentUser).toEqual({ username: 'alice' })
  expect(migrateResult.usernameOptions).toEqual(['alice', 'bob'])

  await ipcMain.handlers.get('auth:migrateLocalStorage')({}, {
    accounts: [{ username: 'alice', password: 'changed' }]
  })

  expect(store.getAuth().accounts).toHaveLength(2)
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

test('config handlers keep user settings isolated', async () => {
  const ipcMain = createIpcMain()
  registerAll(ipcMain)

  await ipcMain.handlers.get('config:set')({}, { username: 'alice', apiKey: 'sk-alice', permissionMode: 'full' })
  const aliceResult = await ipcMain.handlers.get('config:get')({}, { username: 'alice' })
  const bobResult = await ipcMain.handlers.get('config:get')({}, { username: 'bob' })

  expect(aliceResult.config.apiKey).toBe('***')
  expect(aliceResult.config.permissionMode).toBe('full')
  expect(bobResult.config.apiKey).toBe('')
  expect(bobResult.config.permissionMode).toBe('default')
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
  expect(result.dir).toBe(path.normalize(root))
  expect(result.parentDir).toBe(path.dirname(root))
  expect(result.breadcrumbs.at(-1)).toMatchObject({ label: 'files', path: path.normalize(root) })
  expect(result.items.map((item) => item.name)).toContain('a.txt')
})

test('file path helpers normalize Windows drive roots and parents', () => {
  expect(normalizeDirectoryPath('C:')).toBe('C:\\')
  expect(normalizeDirectoryPath('C:Users')).toBe('C:\\Users')
  expect(getParentDir('C:\\Users')).toBe('C:\\')
  expect(getParentDir('C:\\')).toBeNull()
})

test('dialog:saveFileAs copies generated files through a save dialog', async () => {
  const root = path.join(TMP, 'save-as')
  const source = path.join(root, 'source.txt')
  const dest = path.join(root, 'out', 'exported.txt')
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(source, 'generated content')

  const ipcMain = createIpcMain()
  registerAll(ipcMain, {
    dialog: {
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: dest }))
    },
    mainWindow: null
  })

  const result = await ipcMain.handlers.get('dialog:saveFileAs')({}, {
    sourcePath: source,
    defaultPath: 'source.txt'
  })

  expect(result).toEqual({ ok: true, path: dest })
  expect(fs.readFileSync(dest, 'utf-8')).toBe('generated content')
})
