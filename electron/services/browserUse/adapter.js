const PORT = 8780

function endpoint() {
  return `http://127.0.0.1:${PORT}`
}

async function healthCheck() {
  try {
    const resp = await fetch(`${endpoint()}/health`, { signal: AbortSignal.timeout(3000) })
    const data = await resp.json()
    return { available: data.ok === true && data.ready === true, detail: data }
  } catch {
    return { available: false, detail: { ok: false } }
  }
}

function defaultHeadless() {
  try {
    const { store } = require('../../store')
    return store.getConfig().browserUseHeadless !== false
  } catch {
    return true
  }
}

async function execute(action, context = {}) {
  let abortListener = null
  try {
    const payload = action.payload || action
    const { goal, max_steps = 15, start_url } = payload
    const headless = typeof payload.headless === 'boolean' ? payload.headless : defaultHeadless()
    const keep_alive = typeof payload.keep_alive === 'boolean' ? payload.keep_alive : !headless
    const signal = context.signal

    if (signal?.aborted) {
      await cancel()
      return { ok: false, error: { code: 'ABORTED', message: '操作已取消' } }
    }

    if (signal) {
      abortListener = () => { void cancel() }
      signal.addEventListener('abort', abortListener, { once: true })
    }

    const resp = await fetch(`${endpoint()}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, max_steps, start_url, headless, keep_alive }),
      signal,
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return { ok: false, error: { code: 'BRIDGE_ERROR', message: `browser-use bridge ${resp.status}: ${text.slice(0, 200)}` } }
    }

    // Read SSE stream
    const text = await resp.text()
    const events = parseSSE(text)

    const resultEvent = events.find(e => e.type === 'result')
    if (resultEvent) {
      return normalizeBridgeResult(resultEvent.data || {}, { start_url })
    }

    return { ok: false, error: { code: 'NO_RESULT', message: 'browser-use 未返回结果事件。' } }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, error: { code: 'ABORTED', message: '操作已取消' } }
    }
    return { ok: false, error: { code: 'BRIDGE_UNREACHABLE', message: `browser-use bridge 不可达: ${err.message}` } }
  } finally {
    if (context.signal && abortListener) context.signal.removeEventListener('abort', abortListener)
  }
}

function isMissingSummary(summary) {
  const value = String(summary ?? '').trim().toLowerCase()
  return !value || value === 'none' || value === 'null'
}

function isBlankFinalUrl(finalUrl) {
  const value = String(finalUrl ?? '').trim().toLowerCase()
  return !value || value === 'about:blank'
}

function normalizeBridgeError(rawError, summary) {
  if (!rawError) return undefined
  const message = String(rawError)
  const code = message.startsWith('BROWSER_TASK_INCOMPLETE') ? 'BROWSER_TASK_INCOMPLETE' : 'BROWSER_TASK_FAILED'
  return { code, message: summary || message }
}

function normalizeBridgeResult(data, action = {}) {
  const summary = data.summary || ''
  const finalUrl = data.final_url || ''
  const issues = []
  if (isMissingSummary(summary)) issues.push('summary_missing')
  if (action.start_url && isBlankFinalUrl(finalUrl)) issues.push('final_url_about_blank')

  const result = {
    ok: data.success !== false && issues.length === 0,
    summary,
    final_url: finalUrl,
    steps_completed: data.steps_completed || 0,
    duration_ms: data.duration_ms || 0,
    error: normalizeBridgeError(data.error, summary),
    diagnostics: { raw: data, issues },
  }

  if (issues.length) {
    result.error = {
      code: 'BROWSER_TASK_INCOMPLETE',
      message: `browser-use did not return a usable page result: ${issues.join(', ')}`,
      detail: { issues, raw: data },
    }
  }

  return result
}

async function cancel() {
  try {
    await fetch(`${endpoint()}/cancel`, { method: 'POST' })
  } catch { /* bridge may already be down */ }
}

function parseSSE(text) {
  const events = []
  let currentType = ''
  let currentData = ''

  for (const line of text.split('\n')) {
    if (line.startsWith('event: ')) {
      currentType = line.slice(7).trim()
      currentData = ''
    } else if (line.startsWith('data: ')) {
      currentData += line.slice(6)
    } else if (line === '' && currentType) {
      try {
        events.push({ type: currentType, data: JSON.parse(currentData) })
      } catch {
        events.push({ type: currentType, data: currentData })
      }
      currentType = ''
      currentData = ''
    }
  }

  // Flush final event when stream lacks trailing blank line
  if (currentType && currentData) {
    try {
      events.push({ type: currentType, data: JSON.parse(currentData) })
    } catch {
      events.push({ type: currentType, data: currentData })
    }
  }

  return events
}

module.exports = { healthCheck, execute, cancel, endpoint, PORT, parseSSE, normalizeBridgeResult }
