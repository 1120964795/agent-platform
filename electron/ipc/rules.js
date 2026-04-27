const userRules = require('../services/userRules')

function register(ipcMain) {
  ipcMain.handle('rules:list', async (_event, payload = {}) => {
    const username = typeof payload === 'string' ? payload : payload.username
    return { ok: true, rules: userRules.readRules(username), path: userRules.rulesPath(username) }
  })
  ipcMain.handle('rules:delete', async (_event, payload = {}) => {
    const username = payload.username
    if (payload.rule_id || payload.id) {
      const result = userRules.removeRuleById(payload.rule_id || payload.id, username)
      return { ok: true, removed_count: result.removed ? 1 : 0 }
    }
    if (payload.substring) {
      const result = userRules.removeRulesBySubstring(payload.substring, username)
      return { ok: true, removed_count: result.removed_count }
    }
    return { ok: false, error: { code: 'INVALID_ARGS', message: '缺少偏好 ID 或匹配文本' } }
  })
}

module.exports = { register }
