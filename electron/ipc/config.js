const { store } = require('../store')

function sanitizeConfigPatch(input = {}) {
  const patch = {}
  if (typeof input.apiKey === 'string' && input.apiKey && !input.apiKey.includes('***')) patch.apiKey = input.apiKey.trim()
  if (typeof input.baseUrl === 'string' && input.baseUrl) patch.baseUrl = input.baseUrl.trim()
  if (typeof input.model === 'string' && input.model) patch.model = input.model.trim()
  if (input.fallbackProvider === '' || input.fallbackProvider === 'deepseek') patch.fallbackProvider = input.fallbackProvider
  if (typeof input.fallbackModel === 'string' && input.fallbackModel) patch.fallbackModel = input.fallbackModel.trim()
  if (typeof input.deepseekApiKey === 'string' && input.deepseekApiKey && !input.deepseekApiKey.includes('***')) patch.deepseekApiKey = input.deepseekApiKey.trim()
  if (typeof input.deepseekBaseUrl === 'string' && input.deepseekBaseUrl) patch.deepseekBaseUrl = input.deepseekBaseUrl.trim()
  if (typeof input.browserUseApiKey === 'string' && !input.browserUseApiKey.includes('***')) {
    const browserUseApiKey = input.browserUseApiKey.trim()
    if (browserUseApiKey) patch.browserUseApiKey = browserUseApiKey
  }
  if (typeof input.browserUseEndpoint === 'string') {
    const browserUseEndpoint = input.browserUseEndpoint.trim()
    if (browserUseEndpoint) patch.browserUseEndpoint = browserUseEndpoint
  }
  if (typeof input.browserUseModel === 'string') {
    const browserUseModel = input.browserUseModel.trim()
    if (browserUseModel) patch.browserUseModel = browserUseModel
  }
  if (typeof input.browserUseVisionEnabled === 'boolean') patch.browserUseVisionEnabled = input.browserUseVisionEnabled
  if (typeof input.browserUseHeadless === 'boolean') patch.browserUseHeadless = input.browserUseHeadless
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
