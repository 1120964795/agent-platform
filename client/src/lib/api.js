export class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

async function request(method, url, body) {
  const resp = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  const json = await resp.json().catch(() => ({}))
  if (!resp.ok || json.ok === false) {
    const err = json.error || { code: 'HTTP', message: `HTTP ${resp.status}` }
    throw new ApiError(err.code, err.message)
  }
  return json
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  del: (url) => request('DELETE', url),
  patch: (url, body) => request('PATCH', url, body),

  /** SSE 流式，回调式。返回 abort 函数 */
  async stream(url, body, onDelta, onDone, onError) {
    const ctrl = new AbortController()
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal
      })
      if (!resp.ok) {
        onError?.(new ApiError('HTTP', `HTTP ${resp.status}`))
        return () => ctrl.abort()
      }
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const t = line.trim()
          if (!t.startsWith('data:')) continue
          try {
            const obj = JSON.parse(t.slice(5).trim())
            if (obj.delta) onDelta?.(obj.delta)
            else if (obj.done) onDone?.()
            else if (obj.error) onError?.(new ApiError(obj.error.code, obj.error.message))
          } catch {}
        }
      }
      onDone?.()
    } catch (e) {
      if (e.name !== 'AbortError') onError?.(e)
    }
    return () => ctrl.abort()
  }
}

export function getConfig() {
  return api.get('/api/config')
}

export function setConfig(patch) {
  return api.post('/api/config', patch)
}
