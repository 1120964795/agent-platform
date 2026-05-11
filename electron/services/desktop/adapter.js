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

async function execute(action, context = {}) {
  const { type, payload = {} } = action
  const sessionId = context.sessionId || 'default'
  let cancelPromise = null

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
    if (context.signal) {
      context.signal.removeEventListener('abort', onAbort)
    }
  }
}

module.exports = { healthCheck, execute, cancel, endpoint, PORT }
