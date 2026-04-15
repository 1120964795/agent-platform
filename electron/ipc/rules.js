const userRules = require('../services/userRules')

function register(ipcMain) {
  ipcMain.handle('rules:list', async () => ({ ok: true, rules: userRules.readRules(), path: userRules.rulesPath() }))
  ipcMain.handle('rules:delete', async (_event, payload = {}) => {
    if (payload.rule_id || payload.id) {
      const result = userRules.removeRuleById(payload.rule_id || payload.id)
      return { ok: true, removed_count: result.removed ? 1 : 0 }
    }
    if (payload.substring) {
      const result = userRules.removeRulesBySubstring(payload.substring)
      return { ok: true, removed_count: result.removed_count }
    }
    return { ok: false, error: { code: 'INVALID_ARGS', message: 'rule_id or substring is required' } }
  })
}

module.exports = { register }