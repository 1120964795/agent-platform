import { test, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-diagnostics-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')
const require = createRequire(import.meta.url)
const { registerAll } = require('../ipc')
const { detectError } = require('../services/diagnostics/errorDetector')
const { CompanionService } = require('../services/diagnostics/companionService')
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

test('error detector covers Python, Node port, Git, and Java signatures', () => {
  expect(detectError("ModuleNotFoundError: No module named 'flask'")).toMatchObject({
    errorSignature: 'python:module-not-found:flask'
  })
  expect(detectError('Error: listen EADDRINUSE: address already in use :::5173')).toMatchObject({
    errorSignature: 'port:in-use:5173'
  })
  expect(detectError('git fatal: not a git repository')).toMatchObject({ category: 'git' })
  expect(detectError('Exception in thread "main" java.lang.NullPointerException')).toMatchObject({ category: 'java' })
})

test('diagnostics IPC creates diagnosis cards and experience drafts', async () => {
  const ipcMain = createIpcMain()
  registerAll(ipcMain)

  const started = await ipcMain.handlers.get('diagnostics:start')({}, { target: { type: 'manual' } })
  expect(started.status.status).toBe('running')

  const result = await ipcMain.handlers.get('diagnostics:ingestText')({}, {
    username: 'alice',
    text: "Traceback\nModuleNotFoundError: No module named 'flask'"
  })
  expect(result.ok).toBe(true)
  expect(result.diagnosis.title).toContain('flask')
  expect(result.experience.status).toBe('draft')

  const list = await ipcMain.handlers.get('diagnostics:list')({}, { username: 'alice' })
  expect(list.diagnostics).toHaveLength(1)

  const experiences = await ipcMain.handlers.get('experiences:list')({}, { username: 'alice' })
  expect(experiences.experiences[0]).toMatchObject({
    errorSignature: 'python:module-not-found:flask',
    status: 'draft'
  })

  const repeated = await ipcMain.handlers.get('diagnostics:ingestText')({}, {
    username: 'alice',
    text: "ModuleNotFoundError: No module named 'flask'"
  })
  expect(repeated.diagnosis.experienceMatches[0].experienceId).toBe(result.experience.id)
  expect(store.listExperiences('alice')).toHaveLength(1)
})

test('diagnosis fix execution requires confirmation and updates experience on success', async () => {
  const ipcMain = createIpcMain()
  registerAll(ipcMain, {
    requestConfirm: vi.fn(async () => true),
    execute: vi.fn(async () => ({ stdout: 'ok', stderr: '', exit_code: 0 }))
  })

  const result = await ipcMain.handlers.get('diagnostics:ingestText')({}, {
    username: 'alice',
    text: "ModuleNotFoundError: No module named 'flask'"
  })
  const executed = await ipcMain.handlers.get('diagnostics:executeFix')({}, {
    username: 'alice',
    diagnosisId: result.diagnosis.id,
    fixId: 'fix_1',
    cwd: TMP
  })

  expect(executed.ok).toBe(true)
  expect(store.listExperiences('alice')[0]).toMatchObject({
    status: 'resolved',
    successCount: 1
  })
})

test('diagnostics can list window targets and poll collector text in the background', async () => {
  const collector = {
    listWindowTargets: vi.fn(async () => [
      { id: 'manual', type: 'manual', title: '手动粘贴错误文本' },
      { id: 'uia:1', type: 'window', title: 'Windows Terminal', nativeWindowHandle: 1 }
    ]),
    collectTargetText: vi.fn(async () => "ModuleNotFoundError: No module named 'pytest'")
  }
  const companionService = new CompanionService({ collector, intervalMs: 10000 })
  const ipcMain = createIpcMain()
  registerAll(ipcMain, { collector, companionService })

  const targets = await ipcMain.handlers.get('diagnostics:targets')()
  expect(targets.targets.map((target) => target.id)).toContain('uia:1')

  const started = await ipcMain.handlers.get('diagnostics:start')({}, {
    username: 'alice',
    target: targets.targets[1]
  })
  expect(started.status.status).toBe('running')

  await companionService.tick()
  expect(store.listDiagnostics('alice')[0].title).toContain('pytest')
  companionService.stop()
})
