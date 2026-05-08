import { test, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-diagnostics-store-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')
const require = createRequire(import.meta.url)
const { store } = require('../store')

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
  fs.mkdirSync(TMP, { recursive: true })
})

test('experiences are username-scoped and searchable', () => {
  const first = store.upsertExperience({
    id: 'exp_1',
    username: 'alice',
    title: 'Flask 依赖缺失处理方法',
    status: 'draft',
    errorSignature: 'python.module_not_found.flask',
    errorKeywords: ['ModuleNotFoundError', 'flask'],
    projectDirs: ['D:\\demo'],
    commands: [],
    notes: [],
    createdAt: '2026-05-02T10:00:00.000Z',
    updatedAt: '2026-05-02T10:00:00.000Z',
    successCount: 0
  })
  store.upsertExperience({
    id: 'exp_2',
    username: 'bob',
    title: 'Bob card',
    status: 'draft',
    errorSignature: 'node.module_not_found.vite',
    errorKeywords: ['vite'],
    projectDirs: ['D:\\other'],
    commands: [],
    notes: [],
    createdAt: '2026-05-02T10:00:00.000Z',
    updatedAt: '2026-05-02T10:00:00.000Z',
    successCount: 0
  })

  expect(store.listExperiences('alice').map((item) => item.id)).toEqual(['exp_1'])
  expect(store.searchExperiences('alice', 'flask').map((item) => item.id)).toEqual(['exp_1'])
  expect(store.searchExperiences('bob', 'flask')).toEqual([])
})

test('diagnostics keep most recent records and are username-scoped', () => {
  store.upsertDiagnosis({ id: 'diag_1', username: 'alice', title: 'Python 依赖缺失', createdAt: '2026-05-02T10:00:00.000Z' })
  store.upsertDiagnosis({ id: 'diag_2', username: 'bob', title: 'Node 依赖缺失', createdAt: '2026-05-02T10:01:00.000Z' })

  expect(store.listDiagnostics('alice').map((item) => item.id)).toEqual(['diag_1'])
  expect(store.getDiagnosis('diag_2', 'alice')).toBeNull()
  expect(store.getDiagnosis('diag_2', 'bob').title).toBe('Node 依赖缺失')
})

test('deleteExperience only deletes records owned by that username', () => {
  store.upsertExperience({ id: 'exp_1', username: 'alice', title: 'A', errorKeywords: [], projectDirs: [], commands: [], notes: [] })
  expect(store.deleteExperience('exp_1', 'bob')).toBe(false)
  expect(store.getExperience('exp_1', 'alice')).not.toBeNull()
  expect(store.deleteExperience('exp_1', 'alice')).toBe(true)
  expect(store.getExperience('exp_1', 'alice')).toBeNull()
})
