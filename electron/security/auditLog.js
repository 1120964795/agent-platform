const fs = require('fs')
const path = require('path')
const { store } = require('../store')

const AUDIT_FILE = 'audit.jsonl'

function auditPath(baseDir = store.DATA_DIR) {
  return path.join(baseDir, AUDIT_FILE)
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function makeAuditId(date = new Date()) {
  const stamp = date.toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = `${date.getTime()}${Math.floor(Math.random() * 1000)}`.slice(-6)
  return `audit_${stamp}_${suffix}`
}

function sanitizeText(value) {
  return String(value || '')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"'`]+/gi, '$1***')
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, '$1***')
    .replace(/((api[_-]?key|secret|token|password|passwd|credential)\s*[:=]\s*)[^\s"'`]+/gi, '$1***')
    .replace(/([?&](api[_-]?key|token|secret|password)=)[^&\s]+/gi, '$1***')
    .replace(/(sk-[A-Za-z0-9]{8,})/g, 'sk-***')
    .replace(/(AKIA[0-9A-Z]{12,})/g, 'AKIA***')
}

function sanitizePayload(value, key = '') {
  const keyName = String(key || '').toLowerCase()
  if (value == null) return value
  if (typeof value === 'string') return sanitizeText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((item) => sanitizePayload(item, key))
  if (typeof value === 'object') {
    const out = {}
    for (const [childKey, childValue] of Object.entries(value)) {
      const lowerKey = childKey.toLowerCase()
      if (/api.?key|secret|token|password|passwd|credential|authorization|cookie/.test(lowerKey)) {
        out[childKey] = childValue ? '***' : childValue
      } else if (/content|snippet|stdout|stderr|log|command|url|header|env/.test(lowerKey) || /content|snippet|stdout|stderr|log|command|url|header|env/.test(keyName)) {
        out[childKey] = sanitizePayload(childValue, childKey)
      } else {
        out[childKey] = sanitizePayload(childValue, childKey)
      }
    }
    return out
  }
  return value
}

function normalizeEvent(event = {}, options = {}) {
  const now = options.now || new Date()
  return {
    id: event.id || makeAuditId(now),
    sessionId: event.sessionId || '',
    actionId: event.actionId || '',
    runtime: event.runtime || '',
    type: event.type || '',
    phase: event.phase || '',
    risk: event.risk || '',
    summary: sanitizeText(event.summary || ''),
    sanitizedPayload: sanitizePayload(event.sanitizedPayload ?? event.payload ?? {}),
    createdAt: event.createdAt || now.toISOString()
  }
}

function appendAuditEvent(event, options = {}) {
  const filePath = options.filePath || auditPath(options.baseDir)
  ensureDir(filePath)
  const normalized = normalizeEvent(event, options)
  fs.appendFileSync(filePath, `${JSON.stringify(normalized)}\n`, 'utf-8')
  return normalized
}

function readEvents(filePath) {
  if (!fs.existsSync(filePath)) return []
  return fs.readFileSync(filePath, 'utf-8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line) } catch { return null }
    })
    .filter(Boolean)
}

function matchesText(event, text) {
  if (!text) return true
  const haystack = JSON.stringify(event).toLowerCase()
  return haystack.includes(String(text).toLowerCase())
}

function listAuditEvents(filters = {}, options = {}) {
  const filePath = options.filePath || auditPath(options.baseDir)
  return readEvents(filePath)
    .filter((event) => !filters.sessionId || event.sessionId === filters.sessionId)
    .filter((event) => !filters.runtime || event.runtime === filters.runtime)
    .filter((event) => !filters.risk || event.risk === filters.risk)
    .filter((event) => !filters.phase || event.phase === filters.phase)
    .filter((event) => matchesText(event, filters.text))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

function exportAuditEvents(filters = {}, options = {}) {
  const outPath = options.outputPath || path.join(options.baseDir || store.DATA_DIR, `audit-export-${Date.now()}.jsonl`)
  ensureDir(outPath)
  const events = listAuditEvents(filters, options)
  fs.writeFileSync(outPath, events.map((event) => JSON.stringify(sanitizePayload(event))).join('\n') + (events.length ? '\n' : ''), 'utf-8')
  return { path: outPath, count: events.length }
}

module.exports = {
  AUDIT_FILE,
  appendAuditEvent,
  auditPath,
  exportAuditEvents,
  listAuditEvents,
  sanitizePayload,
  sanitizeText
}
