const fs = require('fs')
const path = require('path')
const { store } = require('../store')

const HEADER = '<!-- Rules below are managed by remember_user_rule. You may edit this file manually. -->\n'

function rulesPath() {
  return path.join(path.dirname(store.DATA_DIR), 'user_rules.md')
}

function ensureFile() {
  const filePath = rulesPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, HEADER, 'utf-8')
  return filePath
}

function readRules() {
  const filePath = ensureFile()
  const raw = fs.readFileSync(filePath, 'utf-8')
  return raw.split(/\r?\n/).map((line) => {
    const match = line.match(/^\s*- \[(r_[^\]]+)\]\s+(.+)$/)
    return match ? { id: match[1], text: match[2], raw_line: line } : null
  }).filter(Boolean)
}

function appendRule(text) {
  if (!text || typeof text !== 'string') {
    const error = new Error('需要提供偏好规则。')
    error.code = 'INVALID_ARGS'
    throw error
  }
  const id = `r_${new Date().toISOString()}`
  fs.appendFileSync(ensureFile(), `- [${id}] ${text.trim()}\n`, 'utf-8')
  return { id, text: text.trim() }
}

function removeRuleById(id) {
  const filePath = ensureFile()
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

function removeRulesBySubstring(substring) {
  const filePath = ensureFile()
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

function buildSystemPromptSection() {
  const rules = readRules()
  if (!rules.length) return ''
  return ['## 用户长期偏好', '请严格遵循用户明确表达的跨会话偏好：', ...rules.map((rule) => `- ${rule.text}`)].join('\n')
}

module.exports = { rulesPath, readRules, appendRule, removeRuleById, removeRulesBySubstring, buildSystemPromptSection }
