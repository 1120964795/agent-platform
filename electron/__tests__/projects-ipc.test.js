import { test, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-projects-ipc-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')
const require = createRequire(import.meta.url)
const projects = require('../ipc/projects')
const { store } = require('../store')

function createIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler))
  }
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
}

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
  fs.mkdirSync(TMP, { recursive: true })
})

test('projects IPC registers core V2 project handlers', () => {
  const ipcMain = createIpcMain()
  projects.register(ipcMain, { storeRef: store })

  expect([...ipcMain.handlers.keys()]).toEqual(expect.arrayContaining([
    'projects:list',
    'projects:add',
    'projects:get',
    'projects:remove',
    'projects:settings:get',
    'projects:settings:update',
    'projects:profile:refresh',
    'projects:index:start',
    'projects:index:pause',
    'projects:index:clear',
    'projects:index:status',
    'projects:search',
    'projects:ask',
    'projects:patch:preview',
    'projects:patch:apply',
    'projects:patch:list',
    'projects:experiences:match',
    'projects:embedding:status',
    'projects:embedding:refresh',
    'projects:schema'
  ]))
})

test('projects:add creates settings and profile bundle', async () => {
  const root = path.join(TMP, 'project')
  writeFile(path.join(root, 'package.json'), JSON.stringify({
    scripts: { dev: 'vite', test: 'vitest run' },
    dependencies: { react: '^18.0.0' },
    devDependencies: { vite: '^5.0.0' }
  }, null, 2))

  const ipcMain = createIpcMain()
  projects.register(ipcMain, { storeRef: store })

  const addResult = await ipcMain.handlers.get('projects:add')({}, {
    username: 'alice',
    rootPath: root
  })
  expect(addResult).toMatchObject({
    ok: true,
    project: { username: 'alice', rootPath: path.normalize(root) },
    settings: { watchEnabled: true, embeddingEnabled: false },
    profile: { language: 'JavaScript' }
  })
  expect(addResult.profile.frameworks).toEqual(expect.arrayContaining(['Vite', 'React']))

  const listResult = await ipcMain.handlers.get('projects:list')({}, { username: 'alice' })
  expect(listResult.items).toHaveLength(1)
  expect(listResult.items[0].project.id).toBe(addResult.project.id)

  const updateResult = await ipcMain.handlers.get('projects:settings:update')({}, {
    username: 'alice',
    projectId: addResult.project.id,
    patch: {
      watchEnabled: false,
      debounceMs: 1200
    }
  })
  expect(updateResult.settings).toMatchObject({
    watchEnabled: false,
    debounceMs: 1200
  })

  const searchResult = await ipcMain.handlers.get('projects:search')({}, {
    username: 'alice',
    projectId: addResult.project.id,
    query: 'vite'
  })
  expect(searchResult.results[0]).toMatchObject({ path: 'package.json' })

  const askResult = await ipcMain.handlers.get('projects:ask')({}, {
    username: 'alice',
    projectId: addResult.project.id,
    question: '这个项目怎么启动'
  })
  expect(askResult.result).toMatchObject({
    confidence: 'high',
    suggestedCommands: [expect.objectContaining({ command: 'npm run dev' })]
  })

  writeFile(path.join(root, 'README.md'), 'old\n')
  const diff = [
    'diff --git a/README.md b/README.md',
    '--- a/README.md',
    '+++ b/README.md',
    '@@ -1 +1 @@',
    '-old',
    '+new'
  ].join('\n')
  const patchPreview = await ipcMain.handlers.get('projects:patch:preview')({}, {
    username: 'alice',
    projectId: addResult.project.id,
    title: 'Update README',
    diff
  })
  expect(patchPreview.patch).toMatchObject({
    status: 'draft',
    affectedFiles: [expect.objectContaining({ path: 'README.md' })]
  })

  const patchApply = await ipcMain.handlers.get('projects:patch:apply')({}, {
    username: 'alice',
    projectId: addResult.project.id,
    patchId: patchPreview.patch.id,
    confirmed: true
  })
  expect(patchApply.patch.status).toBe('applied')
  expect(fs.readFileSync(path.join(root, 'README.md'), 'utf-8')).toBe('new\n')
})

test('projects:add returns a structured error for missing paths', async () => {
  const ipcMain = createIpcMain()
  projects.register(ipcMain, { storeRef: store })

  const result = await ipcMain.handlers.get('projects:add')({}, {
    username: 'alice',
    rootPath: path.join(TMP, 'missing')
  })

  expect(result).toMatchObject({
    ok: false,
    error: { code: 'PATH_NOT_FOUND' }
  })
})
