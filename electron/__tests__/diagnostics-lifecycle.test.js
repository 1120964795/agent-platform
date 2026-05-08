import { test, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-diagnostics-lifecycle-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')
const require = createRequire(import.meta.url)
const { ObserverSessionManager } = require('../services/diagnostics/observerSessionManager')
const { store } = require('../store')

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
  fs.mkdirSync(TMP, { recursive: true })
})

test('observer manager dedupes detections, supports ignore, and cooldown', () => {
  let now = Date.parse('2026-05-02T10:00:00.000Z')
  const manager = new ObserverSessionManager({
    now: () => now,
    setInterval: () => 1,
    clearInterval: () => {}
  })

  manager.start({ username: 'alice', target: { type: 'window', title: 'PowerShell' } })
  manager.noteDetection('python.module_not_found.flask')

  expect(manager.isDuplicate('python.module_not_found.flask')).toBe(true)
  expect(manager.inCooldown()).toBe(true)

  now += (31 * 1000)
  expect(manager.inCooldown()).toBe(false)

  manager.ignore('python.module_not_found.flask')
  expect(manager.isIgnored('python.module_not_found.flask')).toBe(true)

  now += (31 * 60 * 1000)
  expect(manager.isIgnored('python.module_not_found.flask')).toBe(false)
})

test('observer manager can keep region sessions listening after detections', () => {
  let now = Date.parse('2026-05-02T10:00:00.000Z')
  const manager = new ObserverSessionManager({
    now: () => now,
    setInterval: () => 1,
    clearInterval: () => {}
  })

  manager.start({ username: 'alice', target: { type: 'region', title: 'Terminal region' } })
  manager.noteDetection('node.module_not_found.vite', { keepListening: true })

  expect(manager.isDuplicate('node.module_not_found.vite')).toBe(true)
  expect(manager.inCooldown()).toBe(false)
  expect(manager.getStatus()).toMatchObject({ status: 'running' })
})

test('observer manager keeps continuous window sessions responsive after detections and failures', async () => {
  let now = Date.parse('2026-05-02T10:00:00.000Z')
  const manager = new ObserverSessionManager({
    now: () => now,
    setInterval: () => 1,
    clearInterval: () => {}
  })

  manager.start({
    username: 'alice',
    target: { type: 'window', title: 'PowerShell' },
    intervalMs: 500,
    continuous: true
  })
  manager.noteDetection('python.module_not_found.flask', { keepListening: true })

  expect(manager.getStatus()).toMatchObject({
    status: 'running',
    continuous: true,
    intervalMs: 500
  })
  expect(manager.inCooldown()).toBe(false)

  for (let index = 0; index < 10; index += 1) {
    await expect(manager.runTick(async () => { throw new Error('capture failed') })).rejects.toThrow('capture failed')
  }

  expect(manager.getStatus()).toMatchObject({
    status: 'running',
    failureCount: 10
  })
})

test('observer manager pauses after repeated failures', async () => {
  let now = Date.parse('2026-05-02T10:00:00.000Z')
  const manager = new ObserverSessionManager({
    now: () => now,
    setInterval: () => 1,
    clearInterval: () => {}
  })
  manager.start({ username: 'alice', target: { type: 'window', title: 'PowerShell' } })

  for (let index = 0; index < 10; index += 1) {
    await expect(manager.runTick(async () => { throw new Error('boom') })).rejects.toThrow('boom')
  }

  expect(manager.getStatus()).toMatchObject({
    status: 'paused',
    pauseReason: 'too-many-failures'
  })
})

test('observer manager keeps region sessions running after repeated capture failures', async () => {
  let now = Date.parse('2026-05-02T10:00:00.000Z')
  const manager = new ObserverSessionManager({
    now: () => now,
    setInterval: () => 1,
    clearInterval: () => {}
  })
  manager.start({ username: 'alice', target: { type: 'region', title: 'Terminal region' } })

  for (let index = 0; index < 10; index += 1) {
    await expect(manager.runTick(async () => { throw new Error('ocr failed') })).rejects.toThrow('ocr failed')
  }

  expect(manager.getStatus()).toMatchObject({
    status: 'running',
    failureCount: 10
  })
})

test('cleanupExpiredExperiences removes stale draft and unresolved items but keeps resolved or pinned', () => {
  store.upsertExperience({
    id: 'exp_old_draft',
    username: 'alice',
    title: 'Old Draft',
    status: 'draft',
    updatedAt: '2026-03-01T10:00:00.000Z'
  })
  store.upsertExperience({
    id: 'exp_old_unresolved',
    username: 'alice',
    title: 'Old Unresolved',
    status: 'unresolved',
    updatedAt: '2026-03-01T10:00:00.000Z'
  })
  store.upsertExperience({
    id: 'exp_resolved',
    username: 'alice',
    title: 'Resolved',
    status: 'resolved',
    updatedAt: '2026-03-01T10:00:00.000Z'
  })
  store.upsertExperience({
    id: 'exp_pinned',
    username: 'alice',
    title: 'Pinned',
    status: 'draft',
    pinned: true,
    updatedAt: '2026-03-01T10:00:00.000Z'
  })

  const result = store.cleanupExpiredExperiences({
    username: 'alice',
    now: new Date('2026-05-02T10:00:00.000Z')
  })

  expect(result).toEqual({ removed: 2 })
  const remainingIds = store.listExperiences('alice').map((item) => item.id)
  expect(remainingIds).toHaveLength(2)
  expect(remainingIds).toEqual(expect.arrayContaining(['exp_resolved', 'exp_pinned']))
})

test('exportExperiences returns versioned username-scoped payload', () => {
  store.upsertExperience({
    id: 'exp_1',
    username: 'alice',
    title: 'Flask',
    status: 'resolved',
    updatedAt: '2026-05-02T10:00:00.000Z'
  })
  store.upsertExperience({
    id: 'exp_2',
    username: 'bob',
    title: 'Bob',
    status: 'draft',
    updatedAt: '2026-05-02T10:00:00.000Z'
  })

  const exported = store.exportExperiences('alice', {
    now: new Date('2026-05-02T12:00:00.000Z')
  })

  expect(exported).toMatchObject({
    version: 1,
    exportedAt: '2026-05-02T12:00:00.000Z',
    username: 'alice'
  })
  expect(exported.experiences.map((item) => item.id)).toEqual(['exp_1'])
})
