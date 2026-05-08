const MODEL_PROVIDERS = Object.freeze({
  QWEN: 'qwen',
  DEEPSEEK: 'deepseek'
})

const MODEL_ROLES = Object.freeze({
  PLAIN_CHAT: 'plain-chat',
  TASK_PLANNING: 'task-planning',
  ACTION_INTENT: 'action-intent',
  CODING_REASONING: 'coding-reasoning'
})

const DEFAULT_QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const DEFAULT_QWEN_PRIMARY_MODEL = 'qwen-max-latest'
const DEFAULT_QWEN_CODING_MODEL = 'qwen3-coder-plus'
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
    allowedProviders: [MODEL_PROVIDERS.QWEN, MODEL_PROVIDERS.DEEPSEEK],
    defaultProvider: MODEL_PROVIDERS.QWEN
  },
  [MODEL_ROLES.TASK_PLANNING]: {
    allowedProviders: [MODEL_PROVIDERS.QWEN],
    defaultProvider: MODEL_PROVIDERS.QWEN
  },
  [MODEL_ROLES.ACTION_INTENT]: {
    allowedProviders: [MODEL_PROVIDERS.QWEN],
    defaultProvider: MODEL_PROVIDERS.QWEN
  },
  [MODEL_ROLES.CODING_REASONING]: {
    allowedProviders: [MODEL_PROVIDERS.QWEN],
    defaultProvider: MODEL_PROVIDERS.QWEN
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
  DEFAULT_QWEN_BASE_URL,
  DEFAULT_QWEN_PRIMARY_MODEL,
  DEFAULT_QWEN_CODING_MODEL,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  normalizeBaseUrl
}
