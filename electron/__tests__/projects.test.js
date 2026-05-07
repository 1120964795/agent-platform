import { test, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-projects-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')
const require = createRequire(import.meta.url)
const { registerAll } = require('../ipc')
const sqliteFts = require('../services/sqliteFtsIndex')
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
  sqliteFts.resetForTests()
})

function seedViteProject() {
  const root = path.join(TMP, 'vite-demo')
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    scripts: { dev: 'vite --host 127.0.0.1' },
    dependencies: { '@vitejs/plugin-react': 'latest', vite: 'latest', react: 'latest' }
  }, null, 2))
  fs.writeFileSync(path.join(root, 'src', 'main.jsx'), 'import React from "react"\nconsole.log("Vite hello")\n')
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=not-indexed')
  return root
}

test('project IPC adds, profiles, indexes, searches, and answers with sources', async () => {
  const root = seedViteProject()
  const ipcMain = createIpcMain()
  registerAll(ipcMain)

  const added = await ipcMain.handlers.get('projects:add')({}, { rootPath: root, username: 'alice' })
  expect(added.ok).toBe(true)
  expect(added.profile.frameworks).toEqual(expect.arrayContaining(['Vite', 'React']))

  const indexed = await ipcMain.handlers.get('projects:index:start')({}, { projectId: added.project.id, username: 'alice' })
  expect(indexed.indexedFileCount).toBeGreaterThan(0)
  expect(fs.existsSync(sqliteFts.databasePath())).toBe(true)
  expect(await sqliteFts.countProjectEntries(added.project.id)).toBe(indexed.indexedFileCount)
  expect(store.listProjectIndex(added.project.id)[0].content).toBeUndefined()

  const search = await ipcMain.handlers.get('projects:search')({}, { projectId: added.project.id, username: 'alice', query: 'hello' })
  expect(search.results[0].relativePath).toBe('src/main.jsx')
  expect(search.results.map((item) => item.relativePath)).not.toContain('.env')

  const answer = await ipcMain.handlers.get('projects:ask')({}, { projectId: added.project.id, username: 'alice', question: 'where is hello' })
  expect(answer.sources[0].relativePath).toBe('src/main.jsx')
  expect(answer.answer).toContain('src/main.jsx')
})

test('patch drafts are preview-only and require confirmation inside allowed files', async () => {
  const root = seedViteProject()
  const ipcMain = createIpcMain()
  registerAll(ipcMain)
  const added = await ipcMain.handlers.get('projects:add')({}, { rootPath: root, username: 'alice' })

  const preview = await ipcMain.handlers.get('projects:patch:preview')({}, {
    projectId: added.project.id,
    username: 'alice',
    relativePath: 'src/main.jsx',
    newContent: 'console.log("patched")\n'
  })
  expect(preview.ok).toBe(true)
  expect(fs.readFileSync(path.join(root, 'src', 'main.jsx'), 'utf-8')).toContain('Vite hello')

  const denied = await ipcMain.handlers.get('projects:patch:apply')({}, {
    projectId: added.project.id,
    username: 'alice',
    patchId: preview.patch.id,
    confirmed: false
  })
  expect(denied.ok).toBe(false)

  const applied = await ipcMain.handlers.get('projects:patch:apply')({}, {
    projectId: added.project.id,
    username: 'alice',
    patchId: preview.patch.id,
    confirmed: true
  })
  expect(applied.ok).toBe(true)
  expect(fs.readFileSync(path.join(root, 'src', 'main.jsx'), 'utf-8')).toContain('patched')

  const outside = await ipcMain.handlers.get('projects:patch:preview')({}, {
    projectId: added.project.id,
    username: 'alice',
    relativePath: '../outside.js',
    newContent: 'bad'
  })
  expect(outside.ok).toBe(false)
})
