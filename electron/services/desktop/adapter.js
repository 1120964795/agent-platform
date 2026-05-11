const PORT = 8790

function endpoint() {
  return `http://127.0.0.1:${PORT}`
}

async function healthCheck() {
  try {
    const resp = await fetch(`${endpoint()}/health`, { signal: AbortSignal.timeout(3000) })
    const data = await resp.json()
    return { available: resp.ok !== false && data.ok === true, detail: data }
  } catch {
    return { available: false, detail: { ok: false } }
  }
}

async function cancel(context = {}) {
  const sessionId = context.sessionId || 'default'
  try {
    const resp = await fetch(`${endpoint()}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
    const data = await resp.json().catch(() => ({}))
    return { ok: resp.ok !== false && data.ok !== false, ...data }
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'CANCEL_FAILED',
        message: `Desktop-use cancel failed: ${err.message}`,
      },
    }
  }
}

async function postResume({ sessionId, requestId, answer }) {
  const resp = await fetch(`${endpoint()}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, requestId, answer }),
  })
  return resp.json().catch(() => ({ ok: false }))
}

async function readEventStream(resp, context = {}) {
  if (!resp?.body?.getReader) return
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''
    for (const frame of frames) {
      const line = frame.split('\n').find((entry) => entry.startsWith('data: '))
      if (!line) continue
      const event = JSON.parse(line.slice(6))
      context.onEvent?.(event)
      if (event.type === 'ask_user') {
        const answer = context.waitForUser
          ? await context.waitForUser(event)
          : 'cancel'
        await postResume({ sessionId: context.sessionId || 'default', requestId: event.requestId, answer })
      }
    }
  }
}

async function execute(action, context = {}) {
  const { type, payload = {} } = action
  const sessionId = context.sessionId || 'default'
  let cancelPromise = null
  let eventController = null
  let eventsPromise = null

  const onAbort = () => {
    cancelPromise = cancel({ sessionId })
  }

  if (context.signal?.aborted) {
    await cancel({ sessionId })
    return { ok: false, error: { code: 'ABORTED', message: 'Desktop operation was cancelled.' } }
  }

  if (context.signal) {
    context.signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    if (context.onEvent || context.waitForUser) {
      eventController = new AbortController()
      eventsPromise = fetch(`${endpoint()}/events/${encodeURIComponent(sessionId)}`, { signal: eventController.signal })
        .then((resp) => readEventStream(resp, { ...context, sessionId }))
        .catch(() => null)
      await Promise.resolve()
    }

    const resp = await fetch(`${endpoint()}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        payload,
        approved: true,
        actionId: `desktop-${Date.now()}`,
        sessionId,
      }),
      signal: context.signal,
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return { ok: false, error: { code: 'BRIDGE_ERROR', message: `Desktop-use bridge ${resp.status}: ${text.slice(0, 200)}` } }
    }

    const data = await resp.json()
    return {
      ok: data.ok !== false,
      exitCode: data.exitCode,
      stdout: data.stdout,
      stderr: data.stderr,
      metadata: data.metadata || {},
      durationMs: data.durationMs,
      error: data.error,
    }
  } catch (err) {
    if (context.signal?.aborted || err.name === 'AbortError') {
      if (cancelPromise) await cancelPromise.catch(() => null)
      else await cancel({ sessionId }).catch(() => null)
      return { ok: false, error: { code: 'ABORTED', message: 'Desktop operation was cancelled.' } }
    }
    return { ok: false, error: { code: 'BRIDGE_UNREACHABLE', message: `Desktop-use bridge unavailable: ${err.message}` } }
  } finally {
    eventController?.abort()
    await eventsPromise?.catch(() => null)
    if (context.signal) {
      context.signal.removeEventListener('abort', onAbort)
    }
  }
}

module.exports = { healthCheck, execute, cancel, endpoint, PORT, readEventStream, postResume }
