const { store } = require('../store')

function sanitizeConfigPatch(input = {}) {
  const patch = {}
  if (typeof input.apiKey === 'string' && input.apiKey && !input.apiKey.includes('***')) patch.apiKey = input.apiKey.trim()
  if (typeof input.baseUrl === 'string' && input.baseUrl) patch.baseUrl = input.baseUrl.trim()
  if (typeof input.model === 'string' && input.model) patch.model = input.model.trim()
  if (typeof input.temperature === 'number') patch.temperature = input.temperature
  if (input.permissionMode === 'default' || input.permissionMode === 'full') patch.permissionMode = input.permissionMode
  if (typeof input.workspace_root === 'string' && input.workspace_root) patch.workspace_root = input.workspace_root.trim()
  if (Array.isArray(input.shell_whitelist_extra)) patch.shell_whitelist_extra = input.shell_whitelist_extra.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
  if (Array.isArray(input.shell_blacklist_extra)) patch.shell_blacklist_extra = input.shell_blacklist_extra.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
  if (typeof input.session_confirm_cache_enabled === 'boolean') patch.session_confirm_cache_enabled = input.session_confirm_cache_enabled
  return patch
}

function register(ipcMain) {
  ipcMain.handle('config:get', async (_event, payload = {}) => {
    const username = typeof payload === 'string' ? payload : payload.username
    return { ok: true, config: store.getMaskedConfig(username) }
  })
  ipcMain.handle('config:set', async (_event, payload = {}) => {
    const username = typeof payload.username === 'string' ? payload.username : ''
    const patch = sanitizeConfigPatch(payload)
    const next = username ? store.setUserConfig(username, patch) : store.setConfig(patch)
    const { userConfigs, ...safeConfig } = next
    return { ok: true, config: { ...safeConfig, apiKey: next.apiKey ? '***' : '' } }
  })
}

module.exports = { register, sanitizeConfigPatch }
