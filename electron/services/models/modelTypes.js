const MODEL_PROVIDERS = Object.freeze({
  DEEPSEEK: 'deepseek'
})

const MODEL_ROLES = Object.freeze({
  PLAIN_CHAT: 'plain-chat',
  TASK_PLANNING: 'task-planning',
  ACTION_INTENT: 'action-intent',
  CODING_REASONING: 'coding-reasoning'
})

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'

const MODEL_CAPABILITIES = Object.freeze({
  planning: 'planning',
  actionIntent: 'action-intent',
  coding: 'coding',
  plainChat: 'plain-chat',
  streaming: 'streaming',
  json: 'json',
  tools: 'tools'
})

const ROLE_REQUIREMENTS = Object.freeze({
  [MODEL_ROLES.PLAIN_CHAT]: {
    allowedProviders: [MODEL_PROVIDERS.DEEPSEEK],
    defaultProvider: MODEL_PROVIDERS.DEEPSEEK
  },
  [MODEL_ROLES.TASK_PLANNING]: {
    allowedProviders: [MODEL_PROVIDERS.DEEPSEEK],
    defaultProvider: MODEL_PROVIDERS.DEEPSEEK
  },
  [MODEL_ROLES.ACTION_INTENT]: {
    allowedProviders: [MODEL_PROVIDERS.DEEPSEEK],
    defaultProvider: MODEL_PROVIDERS.DEEPSEEK
  },
  [MODEL_ROLES.CODING_REASONING]: {
    allowedProviders: [MODEL_PROVIDERS.DEEPSEEK],
    defaultProvider: MODEL_PROVIDERS.DEEPSEEK
  }
})

function normalizeBaseUrl(value, fallback) {
  const raw = String(value || fallback || '').trim()
  return raw.replace(/\/+$/, '')
}

module.exports = {
  MODEL_PROVIDERS,
  MODEL_ROLES,
  MODEL_CAPABILITIES,
  ROLE_REQUIREMENTS,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  normalizeBaseUrl
}
