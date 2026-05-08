import { test, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `aionui-audit-test-${Date.now()}`)
const require = createRequire(import.meta.url)
const { appendAuditEvent, listAuditEvents, exportAuditEvents, sanitizePayload, auditPath } = require('../security/auditLog')

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
})

test('appends audit events as JSONL', () => {
  appendAuditEvent({ sessionId: 'sess1', runtime: 'open-interpreter', phase: 'proposed', risk: 'medium', payload: { command: 'npm test' } }, { baseDir: TMP, now: new Date('2026-05-08T00:00:00Z') })
  appendAuditEvent({ sessionId: 'sess1', runtime: 'open-interpreter', phase: 'approved', risk: 'medium', payload: { command: 'npm test' } }, { baseDir: TMP, now: new Date('2026-05-08T00:00:01Z') })
  const lines = fs.readFileSync(auditPath(TMP), 'utf-8').trim().split(/\r?\n/)
  expect(lines).toHaveLength(2)
  expect(JSON.parse(lines[0]).phase).toBe('proposed')
})

test('masks obvious secrets in nested payloads', () => {
  const sanitized = sanitizePayload({
    command: 'curl https://x.test?api_key=abc123 -H "Authorization: Bearer token-value-123456"',
    env: { OPENAI_API_KEY: 'sk-testsecretvalue' },
    headers: { Authorization: 'Bearer secretsecretsecret' }
  })
  const text = JSON.stringify(sanitized)
  expect(text).not.toContain('abc123')
  expect(text).not.toContain('token-value-123456')
  expect(text).not.toContain('sk-testsecretvalue')
  expect(text).toContain('***')
})

test('lists audit events with filters', () => {
  appendAuditEvent({ sessionId: 'a', runtime: 'ui-tars', phase: 'blocked', risk: 'blocked', summary: 'blocked click' }, { baseDir: TMP })
  appendAuditEvent({ sessionId: 'b', runtime: 'open-interpreter', phase: 'completed', risk: 'low', summary: 'git status' }, { baseDir: TMP })
  expect(listAuditEvents({ runtime: 'ui-tars' }, { baseDir: TMP })).toHaveLength(1)
  expect(listAuditEvents({ text: 'git' }, { baseDir: TMP })[0].sessionId).toBe('b')
})

test('exports sanitized JSONL logs', () => {
  appendAuditEvent({ sessionId: 'a', runtime: 'open-interpreter', phase: 'completed', risk: 'medium', payload: { stdout: 'token=secret123456789' } }, { baseDir: TMP })
  const outPath = path.join(TMP, 'export.jsonl')
  const result = exportAuditEvents({}, { baseDir: TMP, outputPath: outPath })
  expect(result.count).toBe(1)
  const text = fs.readFileSync(outPath, 'utf-8')
  expect(text).not.toContain('secret123456789')
  expect(text).toContain('***')
})
