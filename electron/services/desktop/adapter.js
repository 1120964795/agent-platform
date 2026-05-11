const PORT = 8765

function endpoint() {
  return `http://127.0.0.1:${PORT}`
}

async function healthCheck() {
  try {
    const resp = await fetch(`${endpoint()}/health`, { signal: AbortSignal.timeout(3000) })
    const data = await resp.json()
    return { available: data.ok === true, detail: data }
  } catch {
    return { available: false, detail: { ok: false } }
  }
}

async function execute(action, context = {}) {
  const { type, payload = {} } = action

  try {
    const resp = await fetch(`${endpoint()}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        payload,
        approved: true,
        actionId: `desktop-${Date.now()}`,
        sessionId: context.sessionId || 'default',
      }),
      signal: context.signal,
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return { ok: false, error: { code: 'BRIDGE_ERROR', message: `UI-TARS bridge ${resp.status}: ${text.slice(0, 200)}` } }
    }

    const data = await resp.json()
    return {
      ok: data.ok !== false,
      exitCode: data.exitCode,
      stdout: data.stdout,
      stderr: data.stderr,
      metadata: data.metadata || {},
      durationMs: data.durationMs,
    }
  } catch (err) {
    if (context.signal?.aborted) {
      return { ok: false, error: { code: 'ABORTED', message: '桌面操作已取消。' } }
    }
    return { ok: false, error: { code: 'BRIDGE_UNREACHABLE', message: `UI-TARS bridge 不可达: ${err.message}` } }
  }
}

module.exports = { healthCheck, execute, endpoint, PORT }
