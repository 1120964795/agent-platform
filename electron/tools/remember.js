const { register } = require('./index')
const userRules = require('../services/userRules')

function rememberUserRule({ rule }) {
  const added = userRules.appendRule(rule)
  return { ok: true, rule_id: added.id, rule: added.text }
}

function forgetUserRule({ rule_id, substring }) {
  if (rule_id) {
    const result = userRules.removeRuleById(rule_id)
    return { ok: true, removed_count: result.removed ? 1 : 0 }
  }
  if (substring) {
    const result = userRules.removeRulesBySubstring(substring)
    return { ok: true, removed_count: result.removed_count }
  }
  return { error: { code: 'INVALID_ARGS', message: '需要提供规则 ID 或匹配文本。' } }
}

register({ name: 'remember_user_rule', description: '持久保存跨会话用户偏好。只用于长期偏好，不用于一次性任务细节。', parameters: { type: 'object', properties: { rule: { type: 'string' } }, required: ['rule'] } }, rememberUserRule)
register({ name: 'forget_user_rule', description: '通过 ID 或匹配文本删除已保存的用户偏好。', parameters: { type: 'object', properties: { rule_id: { type: 'string' }, substring: { type: 'string' } } } }, forgetUserRule)

module.exports = { rememberUserRule, forgetUserRule }
