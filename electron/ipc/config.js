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
  ipcMain.handle('config:get', async () => ({ ok: true, config: store.getMaskedConfig() }))
  ipcMain.handle('config:set', async (_event, payload = {}) => {
    const next = store.setConfig(sanitizeConfigPatch(payload))
    return { ok: true, config: { ...next, apiKey: next.apiKey ? '***' : '' } }
  })
}

module.exports = { register, sanitizeConfigPatch }
