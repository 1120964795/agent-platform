const deepseek = require('./deepseek')
const {
  MODEL_PROVIDERS,
  MODEL_ROLES,
  ROLE_REQUIREMENTS,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  normalizeBaseUrl
} = require('./models/modelTypes')

const DEFAULT_DEEPSEEK_CODING_MODEL = 'deepseek-coder'

class ModelRouterError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function assertKnownRole(role) {
  if (!ROLE_REQUIREMENTS[role]) throw new ModelRouterError('MODEL_ROLE_UNKNOWN', `Unknown model role: ${role}`)
}

function deepseekReady(config) {
  return Boolean(config.deepseekApiKey || config.apiKey)
}

function selectModelForRole(role, config = {}) {
  assertKnownRole(role)
  if (!deepseekReady(config)) {
    throw new ModelRouterError('DEEPSEEK_REQUIRED', `${role} requires DeepSeek configuration.`)
  }
  const endpoint = normalizeBaseUrl(
    config.deepseekChatEndpoint || config.deepseekBaseUrl || config.baseUrl,
    DEFAULT_DEEPSEEK_BASE_URL
  )
  return {
    provider: MODEL_PROVIDERS.DEEPSEEK,
    role,
    endpoint,
    apiKey: config.deepseekApiKey || config.apiKey || '',
    model: role === MODEL_ROLES.CODING_REASONING
      ? (config.deepseekCodingModel || DEFAULT_DEEPSEEK_CODING_MODEL)
      : (config.deepseekPlannerModel || config.fallbackModel || config.model || DEFAULT_DEEPSEEK_MODEL)
  }
}

function getProviderForRole(role, config = {}) {
  const selected = selectModelForRole(role, config)
  if (selected.provider === MODEL_PROVIDERS.DEEPSEEK) return { selected, provider: deepseek }
  throw new ModelRouterError('MODEL_PROVIDER_UNKNOWN', `Unknown model provider: ${selected.provider}`)
}

function verifyProviderReadiness(role, config = {}) {
  const { selected } = getProviderForRole(role, config)
  return { ok: true, selected }
}

async function chatForRole(role, options = {}, config) {
  const { selected, provider } = getProviderForRole(role, config)
  return provider.chat({ ...options, role, model: selected.model })
}

async function jsonForRole(role, messages, options = {}, config) {
  const { selected, provider } = getProviderForRole(role, config)
  return provider.chatJson(messages, { ...options, role, model: selected.model })
}

module.exports = {
  ModelRouterError,
  selectModelForRole,
  getProviderForRole,
  verifyProviderReadiness,
  chatForRole,
  jsonForRole
}
