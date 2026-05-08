const { store } = require('../../store')
const {
  DEFAULT_QWEN_BASE_URL,
  DEFAULT_QWEN_PRIMARY_MODEL,
  DEFAULT_QWEN_CODING_MODEL,
  MODEL_ROLES,
  normalizeBaseUrl
} = require('./modelTypes')

class QwenError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

function getFetch() {
  if (typeof fetch === 'function') return fetch
  throw new QwenError('QWEN_RUNTIME', '当前运行时无法使用全局 fetch。')
}

function mapErrorCode(status) {
  if (status === 401 || status === 403) return 'QWEN_AUTH'
  if (status === 429) return 'QWEN_RATE_LIMIT'
  if (status >= 500) return 'QWEN_SERVER'
  return 'QWEN_UNKNOWN'
}

function normalizeTools(tools = []) {
  return tools.map((schema) => {
    if (schema.type === 'function' && schema.function) return schema
    return {
      type: 'function',
      function: {
        name: schema.name,
        description: schema.description || '',
        parameters: schema.parameters || { type: 'object', properties: {} }
      }
    }
  })
}

function getQwenConfig(config = store.getConfig()) {
  return {
    apiKey: config.qwenApiKey || '',
    baseUrl: normalizeBaseUrl(config.qwenBaseUrl, DEFAULT_QWEN_BASE_URL),
    primaryModel: config.qwenPrimaryModel || DEFAULT_QWEN_PRIMARY_MODEL,
    codingModel: config.qwenCodingModel || DEFAULT_QWEN_CODING_MODEL
  }
}

function modelForRole(role, config = store.getConfig()) {
  const qwen = getQwenConfig(config)
  if (role === MODEL_ROLES.CODING_REASONING) return qwen.codingModel
  return qwen.primaryModel
}

function assertReady(config = store.getConfig()) {
  const qwen = getQwenConfig(config)
  if (!qwen.apiKey) throw new QwenError('QWEN_NOT_CONFIGURED', '尚未配置 Qwen API Key。')
  if (!qwen.baseUrl) throw new QwenError('QWEN_NOT_CONFIGURED', '尚未配置 Qwen Base URL。')
  return qwen
}

function buildBody({ messages, json = false, temperature = 0.3, stream = false, tools, model }) {
  return {
    model: model || modelForRole(MODEL_ROLES.PLAIN_CHAT),
    messages,
    temperature,
    stream,
    ...(json && { response_format: { type: 'json_object' } }),
    ...(tools && tools.length ? { tools: normalizeTools(tools) } : {})
  }
}

async function postChat(body, timeout = 120000) {
  const qwen = assertReady()
  let resp
  try {
    resp = await getFetch()(`${qwen.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${qwen.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout)
    })
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') throw new QwenError('QWEN_TIMEOUT', 'Qwen 响应超时。')
    throw new QwenError('QWEN_NETWORK', `网络错误：${error.message}`)
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new QwenError(mapErrorCode(resp.status), `Qwen ${resp.status}: ${text.slice(0, 200)}`, resp.status)
  }
  return resp
}

function parseToolArgs(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
}

function normalizeToolCalls(toolCalls = []) {
  return toolCalls.map((call, index) => ({
    id: call.id || `call_${index}`,
    name: call.name || call.function?.name,
    args: parseToolArgs(call.args ?? call.function?.arguments),
    raw: call
  })).filter((call) => call.name)
}

function messageToChatResult(message = {}) {
  const content = message.content || ''
  const toolCalls = message.tool_calls || []
  return {
    content,
    assistant_message: {
      role: 'assistant',
      content: content || null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {})
    },
    tool_calls: normalizeToolCalls(toolCalls)
  }
}

function extractJson(raw) {
  const text = String(raw || '').replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim()
  const objectStart = text.indexOf('{')
  const objectEnd = text.lastIndexOf('}')
  const arrayStart = text.indexOf('[')
  const arrayEnd = text.lastIndexOf(']')
  if (arrayStart !== -1 && arrayEnd > arrayStart && (objectStart === -1 || arrayStart < objectStart)) return JSON.parse(text.slice(arrayStart, arrayEnd + 1))
  if (objectStart !== -1 && objectEnd > objectStart) return JSON.parse(text.slice(objectStart, objectEnd + 1))
  throw new QwenError('QWEN_JSON_PARSE', 'Qwen 响应中没有找到 JSON 对象或数组。')
}

async function chatStreamingResult({ messages, temperature = 0.3, tools, onDelta, model }) {
  const resp = await postChat(buildBody({ messages, temperature, stream: true, tools, model }), 120000)
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  const toolCallMap = new Map()

  function mergeToolCall(deltaCall = {}) {
    const index = deltaCall.index ?? toolCallMap.size
    const current = toolCallMap.get(index) || { id: deltaCall.id || `call_${index}`, type: 'function', function: { name: '', arguments: '' } }
    if (deltaCall.id) current.id = deltaCall.id
    if (deltaCall.type) current.type = deltaCall.type
    if (deltaCall.function?.name) current.function.name += deltaCall.function.name
    if (deltaCall.function?.arguments) current.function.arguments += deltaCall.function.arguments
    toolCallMap.set(index, current)
  }

  for await (const chunk of resp.body) {
    buffer += decoder.decode(chunk, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') {
        const toolCalls = [...toolCallMap.keys()].sort((a, b) => a - b).map((key) => toolCallMap.get(key))
        return { content, assistant_message: { role: 'assistant', content: content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, tool_calls: normalizeToolCalls(toolCalls), _streamed: true }
      }
      try {
        const json = JSON.parse(payload)
        const delta = json.choices?.[0]?.delta || {}
        if (delta.content) {
          content += delta.content
          onDelta?.(delta.content)
        }
        if (Array.isArray(delta.tool_calls)) delta.tool_calls.forEach(mergeToolCall)
      } catch {
        // Ignore malformed stream fragments.
      }
    }
  }
  const toolCalls = [...toolCallMap.keys()].sort((a, b) => a - b).map((key) => toolCallMap.get(key))
  return { content, assistant_message: { role: 'assistant', content: content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, tool_calls: normalizeToolCalls(toolCalls), _streamed: true }
}

async function chat({ messages, json = false, temperature = 0.3, tools, stream = false, onDelta, model, role }) {
  const selectedModel = model || modelForRole(role || MODEL_ROLES.PLAIN_CHAT)
  if (stream) return chatStreamingResult({ messages, temperature, tools, onDelta, model: selectedModel })
  const resp = await postChat(buildBody({ messages, json, temperature, stream: false, tools, model: selectedModel }))
  const data = await resp.json()
  const message = data.choices?.[0]?.message || {}
  if (tools?.length) return messageToChatResult(message)
  return message.content ?? ''
}

async function chatJson(messages, opts = {}) {
  const raw = await chat({ messages, json: true, ...opts })
  return extractJson(raw)
}

function getStatus(config = store.getConfig()) {
  const qwen = getQwenConfig(config)
  return {
    provider: 'qwen',
    configured: Boolean(qwen.apiKey),
    baseUrl: qwen.baseUrl,
    primaryModel: qwen.primaryModel,
    codingModel: qwen.codingModel
  }
}

module.exports = {
  QwenError,
  chat,
  chatJson,
  extractJson,
  getQwenConfig,
  getStatus,
  modelForRole,
  normalizeTools,
  normalizeToolCalls,
  assertReady
}
