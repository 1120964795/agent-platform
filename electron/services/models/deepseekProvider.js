const deepseek = require('../deepseek')
const { store } = require('../../store')
const { DEFAULT_DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_MODEL, normalizeBaseUrl } = require('./modelTypes')

function getDeepSeekConfig(config = store.getConfig()) {
  return {
    apiKey: config.deepseekApiKey || config.apiKey || '',
    baseUrl: normalizeBaseUrl(config.deepseekBaseUrl || config.baseUrl, DEFAULT_DEEPSEEK_BASE_URL),
    model: config.fallbackModel || config.model || DEFAULT_DEEPSEEK_MODEL,
    enabled: config.fallbackProvider === 'deepseek' || Boolean(config.deepseekApiKey || config.apiKey)
  }
}

function assertReady(config = store.getConfig()) {
  const deepseekConfig = getDeepSeekConfig(config)
  if (!deepseekConfig.apiKey) throw new deepseek.DeepSeekError('DEEPSEEK_NOT_CONFIGURED', '尚未配置 DeepSeek 备用 API Key。')
  return deepseekConfig
}

async function chat(options = {}) {
  assertReady()
  return deepseek.chat(options)
}

async function chatJson(messages, opts = {}) {
  assertReady()
  return deepseek.chatJson(messages, opts)
}

function getStatus(config = store.getConfig()) {
  const deepseekConfig = getDeepSeekConfig(config)
  return {
    provider: 'deepseek',
    configured: Boolean(deepseekConfig.apiKey),
    enabled: Boolean(deepseekConfig.enabled),
    baseUrl: deepseekConfig.baseUrl,
    model: deepseekConfig.model,
    plainChatOnly: true
  }
}

module.exports = { chat, chatJson, getDeepSeekConfig, getStatus, assertReady, DeepSeekError: deepseek.DeepSeekError }
