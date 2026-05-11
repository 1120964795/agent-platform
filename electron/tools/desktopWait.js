const { register } = require('./index')
const { healthCheck, execute } = require('../services/desktop/adapter')

function parseMs(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 500
}

async function desktopWait(args, context = {}) {
  const ms = parseMs(args.ms)

  const health = await healthCheck()
  if (!health.available) {
    return {
      error: {
        code: 'RUNTIME_UNAVAILABLE',
        message: 'Desktop-use runtime is unavailable. Make sure desktop-use-bridge is running on port 8790.',
        detail: health.detail,
      },
    }
  }

  const result = await execute(
    { type: 'desktop.wait', payload: { ms } },
    { signal: context.signal, sessionId: context.sessionId || context.convId }
  )

  if (!result.ok) {
    return { error: result.error || { code: 'WAIT_FAILED', message: 'Desktop wait failed.' } }
  }

  return {
    ms,
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
    metadata: result.metadata,
  }
}

register({
  name: 'desktop_wait',
  description: 'Wait for the desktop to settle before observing or taking the next action.',
  parameters: {
    type: 'object',
    properties: {
      ms: { type: 'number', description: 'Milliseconds to wait. Default: 500.' },
    },
    required: [],
  },
}, desktopWait)

module.exports = { desktopWait }
