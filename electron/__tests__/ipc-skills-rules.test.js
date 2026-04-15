import { test, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-ipc-skills-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')
process.env.AGENTDEV_BUILTIN_SKILLS_DIR = path.join(TMP, 'builtin')
process.env.AGENTDEV_USER_SKILLS_DIR = path.join(TMP, 'user')
const require = createRequire(import.meta.url)
const { registerAll } = require('../ipc')
const registry = require('../skills/registry')
const userRules = require('../services/userRules')

function createIpcMain() {
  const handlers = new Map()
  return { handlers, handle: vi.fn((channel, handler) => handlers.set(channel, handler)) }
}

function writeBuiltinSkill() {
  const dir = path.join(process.env.AGENTDEV_BUILTIN_SKILLS_DIR, 'demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: demo\ndescription: demo skill\n---\n\n# Demo\n', 'utf-8')
}

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
  writeBuiltinSkill()
  registry.reload()
})

test('skills IPC lists, creates, copies and deletes user skills', async () => {
  const ipcMain = createIpcMain()
  registerAll(ipcMain, { shell: { openPath: vi.fn(async () => '') } })

  const listed = await ipcMain.handlers.get('skills:list')()
  expect(listed.skills.map((skill) => skill.name)).toContain('demo')

  const created = await ipcMain.handlers.get('skills:create')({}, { name: 'mine', description: 'my skill' })
  expect(created.ok).toBe(true)
  expect(registry.findSkill('mine').readonly).toBe(false)

  const copied = await ipcMain.handlers.get('skills:copyBuiltin')({}, { name: 'demo', destName: 'demo-copy' })
  expect(copied.ok).toBe(true)
  expect(registry.findSkill('demo-copy')).toBeTruthy()

  const deleted = await ipcMain.handlers.get('skills:delete')({}, { name: 'mine' })
  expect(deleted.ok).toBe(true)
  expect(registry.findSkill('mine')).toBe(null)
})

test('rules IPC lists and deletes rules', async () => {
  const ipcMain = createIpcMain()
  registerAll(ipcMain)
  const added = userRules.appendRule('Prefer npm.')

  const listed = await ipcMain.handlers.get('rules:list')()
  expect(listed.rules[0].text).toBe('Prefer npm.')

  const removed = await ipcMain.handlers.get('rules:delete')({}, { rule_id: added.id })
  expect(removed.removed_count).toBe(1)
})