const fs = require('fs')
const path = require('path')
const { store } = require('../store')

const HEADER = '<!-- Rules below are managed by remember_user_rule. You may edit this file manually. -->\n'

function normalizeUsername(username) {
  return String(username || 'guest').trim() || 'guest'
}

function rulesPath(username) {
  const userKey = encodeURIComponent(normalizeUsername(username))
  return path.join(path.dirname(store.DATA_DIR), `user_rules.${userKey}.md`)
}

function ensureFile(username) {
  const filePath = rulesPath(username)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, HEADER, 'utf-8')
  return filePath
}

function readRules(username) {
  const filePath = ensureFile(username)
  const raw = fs.readFileSync(filePath, 'utf-8')
  return raw.split(/\r?\n/).map((line) => {
    const match = line.match(/^\s*- \[(r_[^\]]+)\]\s+(.+)$/)
    return match ? { id: match[1], text: match[2], raw_line: line } : null
  }).filter(Boolean)
}

function appendRule(text, username) {
  if (!text || typeof text !== 'string') {
    const error = new Error('缺少偏好内容')
    error.code = 'INVALID_ARGS'
    throw error
  }
  const id = `r_${new Date().toISOString()}`
  fs.appendFileSync(ensureFile(username), `- [${id}] ${text.trim()}\n`, 'utf-8')
  return { id, text: text.trim() }
}

function removeRuleById(id, username) {
  const filePath = ensureFile(username)
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)
  let removed = false
  const next = lines.filter((line) => {
    if (line.includes(`[${id}]`)) {
      removed = true
      return false
    }
    return true
  })
  fs.writeFileSync(filePath, next.join('\n').replace(/\n*$/, '\n'), 'utf-8')
  return { removed }
}

function removeRulesBySubstring(substring, username) {
  const filePath = ensureFile(username)
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)
  let removedCount = 0
  const next = lines.filter((line) => {
    if (substring && line.includes(substring) && /^\s*- \[r_/.test(line)) {
      removedCount += 1
      return false
    }
    return true
  })
  fs.writeFileSync(filePath, next.join('\n').replace(/\n*$/, '\n'), 'utf-8')
  return { removed_count: removedCount }
}

function buildSystemPromptSection(username) {
  const rules = readRules(username)
  if (!rules.length) return ''
  return ['## User Persistent Preferences', 'Follow these cross-session preferences explicitly stated by the user:', ...rules.map((rule) => `- ${rule.text}`)].join('\n')
}

module.exports = { rulesPath, readRules, appendRule, removeRuleById, removeRulesBySubstring, buildSystemPromptSection }
