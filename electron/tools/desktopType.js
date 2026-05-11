const { register } = require('./index')
const { healthCheck, execute } = require('../services/desktop/adapter')
const { requestConfirm } = require('../confirm')

async function desktopType(args, context = {}) {
  const { text } = args

  if (!text || typeof text !== 'string') {
    return { error: { code: 'INVALID_ARGS', message: 'desktop_type requires text.' } }
  }

  if (!context.skipInternalConfirm) {
    const allowed = await requestConfirm({
      kind: 'desktop-type',
      payload: { text },
    })
    if (!allowed) {
      return { error: { code: 'USER_CANCELLED', message: 'Desktop typing cancelled by user.' } }
    }
  }

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
    { type: 'desktop.type', payload: { text } },
    { signal: context.signal, sessionId: context.sessionId || context.convId }
  )

  if (!result.ok) {
    return { error: result.error || { code: 'TYPE_FAILED', message: 'Desktop typing failed.' } }
  }

  return {
    text,
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
    metadata: result.metadata,
  }
}

register({
  name: 'desktop_type',
  description: 'Type text at the current keyboard focus on the desktop. Use this after clicking into a text field to input content.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The exact text to type at the current focus.' },
    },
    required: ['text'],
  },
}, desktopType)

module.exports = { desktopType }
