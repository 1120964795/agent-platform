import { test, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { normalizeActionPlan, parseModelJson, buildPlannerPrompt } = require('../services/actionPlanner')

const NOW = new Date('2026-05-08T00:00:00.000Z')

test('parses fenced Qwen JSON arrays', () => {
  expect(parseModelJson('```json\n[{"runtime":"aionui-dry-run","type":"screen.observe"}]\n```')).toEqual([
    { runtime: 'aionui-dry-run', type: 'screen.observe' }
  ])
})

test('normalizes model actions into local action proposals', () => {
  const actions = normalizeActionPlan({
    actions: [{
      runtime: 'open-interpreter',
      type: 'shell.command',
      payload: { command: 'npm test', cwd: 'C:\\work' },
      risk: 'medium'
    }]
  }, { sessionId: 'sess_test', now: NOW })

  expect(actions[0]).toMatchObject({
    id: 'act_20260508_000001',
    sessionId: 'sess_test',
    runtime: 'open-interpreter',
    type: 'shell.command',
    title: 'npm test',
    summary: 'npm test',
    risk: 'medium',
    requiresConfirmation: true,
    status: 'pending',
    createdAt: NOW.toISOString()
  })
})

test('keeps model IDs when present', () => {
  const actions = normalizeActionPlan([
    { id: 'act_model', sessionId: 'sess_model', runtime: 'ui-tars', type: 'screen.observe', payload: {}, risk: 'low' }
  ], { sessionId: 'sess_local', now: NOW })
  expect(actions[0].id).toBe('act_model')
  expect(actions[0].sessionId).toBe('sess_model')
  expect(actions[0].requiresConfirmation).toBe(false)
})

test('rejects unknown runtime names', () => {
  expect(() => normalizeActionPlan([
    { runtime: 'raw-shell', type: 'shell.command', payload: {} }
  ], { now: NOW })).toThrow(/未知运行时/)
})

test('rejects unknown action types', () => {
  expect(() => normalizeActionPlan([
    { runtime: 'open-interpreter', type: 'shell.raw', payload: {} }
  ], { now: NOW })).toThrow(/未知动作类型/)
})

test('planner prompt requires JSON proposals', () => {
  const messages = buildPlannerPrompt('run tests')
  expect(messages[0].content).toContain('Return only JSON')
  expect(messages[1].content).toBe('run tests')
})
