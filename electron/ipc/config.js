const { store } = require('../store')

function sanitizeConfigPatch(input = {}) {
  const patch = {}
  if (typeof input.apiKey === 'string' && input.apiKey && !input.apiKey.includes('***')) patch.apiKey = input.apiKey.trim()
  if (typeof input.baseUrl === 'string' && input.baseUrl) patch.baseUrl = input.baseUrl.trim()
  if (typeof input.model === 'string' && input.model) patch.model = input.model.trim()
  if (typeof input.qwenApiKey === 'string' && input.qwenApiKey && !input.qwenApiKey.includes('***')) patch.qwenApiKey = input.qwenApiKey.trim()
  if (typeof input.qwenBaseUrl === 'string' && input.qwenBaseUrl) patch.qwenBaseUrl = input.qwenBaseUrl.trim()
  if (typeof input.qwenPrimaryModel === 'string' && input.qwenPrimaryModel) patch.qwenPrimaryModel = input.qwenPrimaryModel.trim()
  if (typeof input.qwenCodingModel === 'string' && input.qwenCodingModel) patch.qwenCodingModel = input.qwenCodingModel.trim()
  if (input.fallbackProvider === '' || input.fallbackProvider === 'deepseek') patch.fallbackProvider = input.fallbackProvider
  if (typeof input.fallbackModel === 'string' && input.fallbackModel) patch.fallbackModel = input.fallbackModel.trim()
  if (typeof input.deepseekApiKey === 'string' && input.deepseekApiKey && !input.deepseekApiKey.includes('***')) patch.deepseekApiKey = input.deepseekApiKey.trim()
  if (typeof input.deepseekBaseUrl === 'string' && input.deepseekBaseUrl) patch.deepseekBaseUrl = input.deepseekBaseUrl.trim()
  if (typeof input.openInterpreterCommand === 'string') patch.openInterpreterCommand = input.openInterpreterCommand.trim()
  if (typeof input.openInterpreterEndpoint === 'string') patch.openInterpreterEndpoint = input.openInterpreterEndpoint.trim()
  if (typeof input.uiTarsEndpoint === 'string') patch.uiTarsEndpoint = input.uiTarsEndpoint.trim()
  if (typeof input.uiTarsCommand === 'string') patch.uiTarsCommand = input.uiTarsCommand.trim()
  if (typeof input.uiTarsScreenAuthorized === 'boolean') patch.uiTarsScreenAuthorized = input.uiTarsScreenAuthorized
  if (typeof input.dryRunEnabled === 'boolean') patch.dryRunEnabled = input.dryRunEnabled
  if (typeof input.auditRetentionDays === 'number') patch.auditRetentionDays = input.auditRetentionDays
  if (typeof input.outputRetentionDays === 'number') patch.outputRetentionDays = input.outputRetentionDays
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
    return { ok: true, config: store.getMaskedConfig() }
  })
}

module.exports = { register, sanitizeConfigPatch }
