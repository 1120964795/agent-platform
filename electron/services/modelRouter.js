const qwenProvider = require('./models/qwenProvider')
const deepseekProvider = require('./models/deepseekProvider')
const {
  MODEL_PROVIDERS,
  MODEL_ROLES,
  ROLE_REQUIREMENTS,
  DEFAULT_QWEN_PRIMARY_MODEL,
  DEFAULT_QWEN_CODING_MODEL,
  DEFAULT_DEEPSEEK_MODEL
} = require('./models/modelTypes')

class ModelRouterError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function assertKnownRole(role) {
  if (!ROLE_REQUIREMENTS[role]) throw new ModelRouterError('MODEL_ROLE_UNKNOWN', `未知模型角色：${role}`)
}

function qwenReady(config) {
  return Boolean(config.qwenApiKey)
}

function deepseekReady(config) {
  return Boolean(config.deepseekApiKey || config.apiKey)
}

function selectModelForRole(role, config = {}) {
  assertKnownRole(role)
  if (role === MODEL_ROLES.PLAIN_CHAT) {
    if (qwenReady(config)) {
      return {
        provider: MODEL_PROVIDERS.QWEN,
        role,
        model: config.qwenPrimaryModel || DEFAULT_QWEN_PRIMARY_MODEL
      }
    }
    if (config.fallbackProvider === MODEL_PROVIDERS.DEEPSEEK && deepseekReady(config)) {
      return {
        provider: MODEL_PROVIDERS.DEEPSEEK,
        role,
        model: config.fallbackModel || config.model || DEFAULT_DEEPSEEK_MODEL
      }
    }
    throw new ModelRouterError('MODEL_NOT_CONFIGURED', '尚未配置 Qwen，也没有可用的普通聊天备用模型。')
  }

  if (!qwenReady(config)) {
    throw new ModelRouterError('QWEN_REQUIRED', `${role} 需要配置 Qwen。`)
  }

  return {
    provider: MODEL_PROVIDERS.QWEN,
    role,
    model: role === MODEL_ROLES.CODING_REASONING
      ? (config.qwenCodingModel || DEFAULT_QWEN_CODING_MODEL)
      : (config.qwenPrimaryModel || DEFAULT_QWEN_PRIMARY_MODEL)
  }
}

function getProviderForRole(role, config = {}) {
  const selected = selectModelForRole(role, config)
  if (selected.provider === MODEL_PROVIDERS.QWEN) return { selected, provider: qwenProvider }
  if (selected.provider === MODEL_PROVIDERS.DEEPSEEK) return { selected, provider: deepseekProvider }
  throw new ModelRouterError('MODEL_PROVIDER_UNKNOWN', `未知模型提供方：${selected.provider}`)
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
