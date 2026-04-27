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
  throw new DeepSeekError('DEEPSEEK_RUNTIME', 'Global fetch is not available in this runtime.')
}

function createRequestSignal(timeout, externalSignal) {
  const timeoutSignal = AbortSignal.timeout(timeout)
  if (!externalSignal) return timeoutSignal
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([externalSignal, timeoutSignal])

  const controller = new AbortController()
  const abort = () => controller.abort()
  externalSignal.addEventListener('abort', abort, { once: true })
  timeoutSignal.addEventListener('abort', abort, { once: true })
  controller.signal.addEventListener('abort', () => {
    externalSignal.removeEventListener('abort', abort)
    timeoutSignal.removeEventListener('abort', abort)
  }, { once: true })
  return controller.signal
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

function buildBody({ messages, json = false, temperature, stream = false, tools, config }) {
  const activeConfig = config || store.getConfig()
  const resolvedTemperature = typeof temperature === 'number'
    ? temperature
    : (typeof activeConfig.temperature === 'number' ? activeConfig.temperature : 0.7)
  return {
    model: activeConfig.model || 'deepseek-chat',
    messages,
    temperature: resolvedTemperature,
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

async function postChat(body, timeout = 60000, config, signal) {
  const activeConfig = config || store.getConfig()
  if (!activeConfig.apiKey) throw new DeepSeekError('DEEPSEEK_AUTH', 'API key is not configured.')
  let resp
  try {
    const requestSignal = createRequestSignal(timeout, signal)
    resp = await getFetch()(`${activeConfig.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${activeConfig.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: requestSignal
    })
  } catch (error) {
    if (signal?.aborted) throw new DeepSeekError('CHAT_CANCELLED', '生成已停止。')
    if (error.name === 'AbortError' || error.name === 'TimeoutError') throw new DeepSeekError('DEEPSEEK_TIMEOUT', 'Model response timed out.')
    throw new DeepSeekError('DEEPSEEK_NETWORK', `Network error: ${error.message}`)
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new DeepSeekError(mapErrorCode(resp.status), `DeepSeek ${resp.status}: ${text.slice(0, 200)}`, resp.status)
  }
  return resp
}

async function chat({ messages, json = false, temperature, tools, stream = false, onDelta, config, signal }) {
  if (stream) return chatStreamingResult({ messages, temperature, tools, onDelta, config, signal })
  const resp = await postChat(buildBody({ messages, json, temperature, stream: false, tools, config }), 60000, config, signal)
  const data = await resp.json()
  const message = data.choices?.[0]?.message || {}
  if (tools?.length) return messageToChatResult(message)
  return message.content ?? ''
}

async function chatStreamingResult({ messages, temperature, tools, onDelta, config, signal }) {
  const resp = await postChat(buildBody({ messages, temperature, stream: true, tools, config }), 120000, config, signal)
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

  try {
    for await (const chunk of resp.body) {
      if (signal?.aborted) throw new DeepSeekError('CHAT_CANCELLED', '生成已停止。')
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
  } catch (error) {
    if (signal?.aborted) throw new DeepSeekError('CHAT_CANCELLED', '生成已停止。')
    throw error
  }
  const toolCalls = [...toolCallMap.keys()].sort((a, b) => a - b).map((key) => toolCallMap.get(key))
  return { content, assistant_message: { role: 'assistant', content: content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, tool_calls: normalizeToolCalls(toolCalls) }
}

async function* chatStream({ messages, temperature, tools, config, signal }) {
  const result = await chatStreamingResult({ messages, temperature, tools, onDelta: null, config, signal })
  if (result.content) yield result.content
}

function parseJsonStrict(raw) {
  const cleaned = String(raw || '').replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object found in response')
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
