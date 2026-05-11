const { store } = require('../store')

class DeepSeekError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

function mapErrorCode(status) {
  if (status === 401 || status === 403) return 'DEEPSEEK_AUTH'
  if (status === 429) return 'DEEPSEEK_RATE_LIMIT'
  if (status >= 500) return 'DEEPSEEK_SERVER'
  return 'DEEPSEEK_UNKNOWN'
}

function getFetch() {
  if (typeof fetch === 'function') return fetch
  throw new DeepSeekError('DEEPSEEK_RUNTIME', '当前运行时无法使用全局 fetch。')
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

function buildBody({ messages, model: modelOverride, json = false, temperature = 0.7, stream = false, tools }) {
  const config = store.getConfig()
  return {
    model: modelOverride || config.fallbackModel || config.model || 'deepseek-chat',
    messages,
    temperature,
    stream,
    ...(json && { response_format: { type: 'json_object' } }),
    ...(tools && tools.length ? { tools: normalizeTools(tools) } : {})
  }
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

async function postChat(body, timeout = 60000, signal) {
  const config = store.getConfig()
  const apiKey = config.deepseekApiKey || config.apiKey
  const baseUrl = (config.deepseekBaseUrl || config.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '')
  if (!apiKey) throw new DeepSeekError('DEEPSEEK_AUTH', '尚未配置 API Key。')
  const timeoutSignal = AbortSignal.timeout(timeout)
  const effectiveSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  let resp
  try {
    resp = await getFetch()(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: effectiveSignal
    })
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      if (signal?.aborted) throw error
      throw new DeepSeekError('DEEPSEEK_TIMEOUT', '模型响应超时。')
    }
    throw new DeepSeekError('DEEPSEEK_NETWORK', `网络错误：${error.message}`)
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new DeepSeekError(mapErrorCode(resp.status), `DeepSeek ${resp.status}: ${text.slice(0, 200)}`, resp.status)
  }
  return resp
}

async function chat({ messages, model: modelOverride, json = false, temperature = 0.7, tools, stream = false, onDelta, signal }) {
  if (stream) return chatStreamingResult({ messages, model: modelOverride, temperature, tools, onDelta, signal })
  const resp = await postChat(buildBody({ messages, model: modelOverride, json, temperature, stream: false, tools }), 60000, signal)
  const data = await resp.json()
  const message = data.choices?.[0]?.message || {}
  if (tools?.length) return messageToChatResult(message)
  return message.content ?? ''
}

async function chatStreamingResult({ messages, model: modelOverride, temperature = 0.7, tools, onDelta, signal }) {
  const resp = await postChat(buildBody({ messages, model: modelOverride, temperature, stream: true, tools }), 120000, signal)
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
        return { content, assistant_message: { role: 'assistant', content: content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, tool_calls: normalizeToolCalls(toolCalls) }
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
  return { content, assistant_message: { role: 'assistant', content: content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, tool_calls: normalizeToolCalls(toolCalls) }
}

async function* chatStream({ messages, temperature = 0.7, tools }) {
  const result = await chatStreamingResult({ messages, temperature, tools, onDelta: null })
  if (result.content) yield result.content
}

function parseJsonStrict(raw) {
  const cleaned = String(raw || '').replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('响应中没有找到 JSON 对象')
  return JSON.parse(cleaned.slice(start, end + 1))
}

async function chatJson(messages, opts = {}) {
  try {
    const raw = await chat({ messages, json: true, ...opts })
    return parseJsonStrict(raw)
  } catch (error) {
    if (error instanceof DeepSeekError) throw error
    const retry = await chat({ messages: [...messages, { role: 'user', content: 'Return one valid JSON object only. Do not include markdown fences or extra text.' }], json: true, ...opts })
    return parseJsonStrict(retry)
  }
}

module.exports = { DeepSeekError, chat, chatStream, chatJson, parseJsonStrict, normalizeTools, normalizeToolCalls }
