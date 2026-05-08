import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { createActionBroker } = require('../security/actionBroker')

function action(patch = {}) {
  return {
    id: patch.id || 'act1',
    sessionId: patch.sessionId || 'sess1',
    runtime: patch.runtime || 'open-interpreter',
    type: patch.type || 'shell.command',
    title: patch.title || 'Run command',
    summary: patch.summary || 'Run command',
    payload: patch.payload || { command: 'git status' },
    risk: patch.risk || 'low',
    status: patch.status || 'pending',
    createdAt: '2026-05-08T00:00:00.000Z',
    ...patch
  }
}

test('auto-runs low-risk actions through registered adapter', async () => {
  const audit = vi.fn()
  const adapter = { execute: vi.fn(async () => ({ ok: true, stdout: 'clean' })) }
  const broker = createActionBroker({ audit, storeRef: { getConfig: () => ({}) } })
  broker.registerAdapter('open-interpreter', adapter)

  const result = await broker.submitActions([action()])
  expect(adapter.execute).toHaveBeenCalledTimes(1)
  expect(result[0].status).toBe('completed')
  expect(broker.listActions()[0].result.stdout).toBe('clean')
  expect(audit.mock.calls.map((call) => call[0].phase)).toEqual(expect.arrayContaining(['proposed', 'approved', 'started', 'completed']))
})

test('pauses medium and high risk actions for approval', async () => {
  const adapter = { execute: vi.fn(async () => ({ ok: true })) }
  const broker = createActionBroker({ audit: vi.fn(), storeRef: { getConfig: () => ({}) } })
  broker.registerAdapter('open-interpreter', adapter)

  const [pending] = await broker.submitActions([action({ id: 'act2', payload: { command: 'npm test' } })])
  expect(pending.status).toBe('pending')
  expect(adapter.execute).not.toHaveBeenCalled()

  const approved = await broker.approveAction('act2')
  expect(approved.status).toBe('completed')
  expect(adapter.execute).toHaveBeenCalledTimes(1)
})

test('rejects blocked actions before adapter dispatch', async () => {
  const adapter = { execute: vi.fn(async () => ({ ok: true })) }
  const broker = createActionBroker({ audit: vi.fn(), storeRef: { getConfig: () => ({}) } })
  broker.registerAdapter('open-interpreter', adapter)

  const [blocked] = await broker.submitActions([action({ id: 'act3', payload: { command: 'format C:' } })])
  expect(blocked.status).toBe('blocked')
  expect(adapter.execute).not.toHaveBeenCalled()
})

test('denies pending actions', async () => {
  const broker = createActionBroker({ audit: vi.fn(), storeRef: { getConfig: () => ({}) } })
  const [pending] = await broker.submitActions([action({ id: 'act4', payload: { command: 'npm test' } })])
  expect(pending.status).toBe('pending')
  const denied = broker.denyAction('act4', 'No thanks')
  expect(denied.status).toBe('denied')
  expect(denied.deniedReason).toBe('No thanks')
})

test('emergency stop cancels queued actions and notifies adapters', async () => {
  const adapter = { execute: vi.fn(async () => ({ ok: true })), emergencyStop: vi.fn() }
  const broker = createActionBroker({ audit: vi.fn(), storeRef: { getConfig: () => ({}) } })
  broker.registerAdapter('open-interpreter', adapter)
  await broker.submitActions([action({ id: 'act5', payload: { command: 'npm test' } })])

  const stopped = broker.emergencyStop()
  expect(stopped[0].status).toBe('cancelled')
  expect(adapter.emergencyStop).toHaveBeenCalledTimes(1)
})
