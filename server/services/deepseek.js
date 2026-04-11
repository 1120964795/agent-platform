import fetch from 'node-fetch'
import { store } from '../store.js'

export class DeepSeekError extends Error {
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

/** 非流式调用，返回字符串 content */
export async function chat({ messages, json = false, temperature = 0.7 }) {
  const config = store.getConfig()
  if (!config.apiKey) throw new DeepSeekError('DEEPSEEK_AUTH', 'API Key 未配置')

  const body = {
    model: config.model || 'deepseek-chat',
    messages,
    temperature,
    stream: false,
    ...(json && { response_format: { type: 'json_object' } })
  }

  let resp
  try {
    resp = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    })
  } catch (e) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') {
      throw new DeepSeekError('DEEPSEEK_TIMEOUT', '模型响应超时（60秒）')
    }
    throw new DeepSeekError('DEEPSEEK_NETWORK', `网络错误: ${e.message}`)
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new DeepSeekError(mapErrorCode(resp.status), `DeepSeek ${resp.status}: ${text.slice(0, 200)}`, resp.status)
  }

  const data = await resp.json()
  return data.choices?.[0]?.message?.content ?? ''
}

/** 流式调用，返回 async iterator，每个元素是一个 delta 字符串 */
export async function* chatStream({ messages, temperature = 0.7 }) {
  const config = store.getConfig()
  if (!config.apiKey) throw new DeepSeekError('DEEPSEEK_AUTH', 'API Key 未配置')

  const body = {
    model: config.model || 'deepseek-chat',
    messages,
    temperature,
    stream: true
  }

  const resp = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new DeepSeekError(mapErrorCode(resp.status), `DeepSeek ${resp.status}: ${text.slice(0, 200)}`, resp.status)
  }

  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of resp.body) {
    buffer += decoder.decode(chunk, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        const json = JSON.parse(payload)
        const delta = json.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {
        // ignore partial parse
      }
    }
  }
}

/** 强解析 JSON，容忍 ```json wrapper */
export function parseJsonStrict(raw) {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object found in response')
  return JSON.parse(cleaned.slice(start, end + 1))
}

/** 调用 LLM 返回 JSON，失败自动重试一次 */
export async function chatJson(messages, opts = {}) {
  try {
    const raw = await chat({ messages, json: true, ...opts })
    return parseJsonStrict(raw)
  } catch (e) {
    if (e instanceof DeepSeekError) throw e
    // JSON parse 失败才重试
    const retry = await chat({
      messages: [
        ...messages,
        { role: 'user', content: '上次输出不是合法 JSON，请只输出一个 JSON 对象，不要 markdown 代码块，不要任何其他文字。' }
      ],
      json: true,
      ...opts
    })
    return parseJsonStrict(retry)
  }
}
