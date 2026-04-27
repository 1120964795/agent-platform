const { register } = require('./index')
const userRules = require('../services/userRules')

function rememberUserRule({ rule }, context = {}) {
  const added = userRules.appendRule(rule, context.username)
  return { ok: true, rule_id: added.id, rule: added.text }
}

function forgetUserRule({ rule_id, substring }, context = {}) {
  if (rule_id) {
    const result = userRules.removeRuleById(rule_id, context.username)
    return { ok: true, removed_count: result.removed ? 1 : 0 }
  }
  if (substring) {
    const result = userRules.removeRulesBySubstring(substring, context.username)
    return { ok: true, removed_count: result.removed_count }
  }
  return { error: { code: 'INVALID_ARGS', message: '缺少偏好 ID 或匹配文本' } }
}

register({ name: 'remember_user_rule', description: 'Persist a cross-session user preference. Use only for durable preferences, not one-off task details.', parameters: { type: 'object', properties: { rule: { type: 'string' } }, required: ['rule'] } }, rememberUserRule)
register({ name: 'forget_user_rule', description: 'Remove persisted user preferences by id or substring.', parameters: { type: 'object', properties: { rule_id: { type: 'string' }, substring: { type: 'string' } } } }, forgetUserRule)

module.exports = { rememberUserRule, forgetUserRule }
