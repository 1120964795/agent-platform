const userRules = require('../services/userRules')

function register(ipcMain) {
  ipcMain.handle('rules:list', async () => ({ ok: true, rules: userRules.readRules(), path: userRules.rulesPath() }))
  ipcMain.handle('rules:append', async (_event, payload = {}) => {
    if (!payload.text || typeof payload.text !== 'string') {
      return { ok: false, error: { code: 'INVALID_ARGS', message: '需要提供规则文本。' } }
    }
    try {
      const rule = userRules.appendRule(payload.text)
      return { ok: true, rule }
    } catch (error) {
      return { ok: false, error: { code: error.code || 'APPEND_ERROR', message: error.message } }
    }
  })

  ipcMain.handle('rules:update', async (_event, payload = {}) => {
    if (!payload.id || !payload.text) {
      return { ok: false, error: { code: 'INVALID_ARGS', message: '需要提供规则 ID 和新文本。' } }
    }
    try {
      const rule = userRules.updateRule(payload.id, payload.text)
      return { ok: true, rule }
    } catch (error) {
      return { ok: false, error: { code: error.code || 'UPDATE_ERROR', message: error.message } }
    }
  })

  ipcMain.handle('rules:delete', async (_event, payload = {}) => {
    if (payload.rule_id || payload.id) {
      const result = userRules.removeRuleById(payload.rule_id || payload.id)
      return { ok: true, removed_count: result.removed ? 1 : 0 }
    }
    if (payload.substring) {
      const result = userRules.removeRulesBySubstring(payload.substring)
      return { ok: true, removed_count: result.removed_count }
    }
    return { ok: false, error: { code: 'INVALID_ARGS', message: '需要提供规则 ID 或匹配文本。' } }
  })
}

module.exports = { register }
