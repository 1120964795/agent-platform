const { register } = require('./index')
const { healthCheck, execute } = require('../services/desktop/adapter')
const { requestConfirm } = require('../confirm')

function hasNumber(value) {
  return Number.isFinite(Number(value))
}

function buildPayload(args = {}) {
  const target = typeof args.target === 'string' ? args.target.trim() : ''
  if (target) return { target }
  if (hasNumber(args.x) && hasNumber(args.y)) {
    return {
      x: Number(args.x),
      y: Number(args.y),
      button: args.button || 'left',
    }
  }
  return null
}

async function desktopClick(args, context = {}) {
  const payload = buildPayload(args)
  if (!payload) {
    return { error: { code: 'INVALID_ARGS', message: 'desktop_click requires target or x/y coordinates.' } }
  }

  if (!context.skipInternalConfirm) {
    const allowed = await requestConfirm({
      kind: 'desktop-click',
      payload,
    })
    if (!allowed) {
      return { error: { code: 'USER_CANCELLED', message: 'Desktop click cancelled by user.' } }
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
    { type: 'desktop.click', payload },
    { signal: context.signal, sessionId: context.sessionId || context.convId }
  )

  if (!result.ok) {
    return { error: result.error || { code: 'CLICK_FAILED', message: 'Desktop click failed.' } }
  }

  return {
    ...payload,
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
    metadata: result.metadata,
  }
}

register({
  name: 'desktop_click',
  description: 'Click on the desktop by natural-language target or explicit coordinates. Args: target (optional) describes the UI element, or x/y coordinates with optional button.',
  parameters: {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'Natural-language description of the element to click.' },
      x: { type: 'number', description: 'Screen x coordinate.' },
      y: { type: 'number', description: 'Screen y coordinate.' },
      button: { type: 'string', enum: ['left', 'right'], description: 'Mouse button. Default: left.' },
    },
    required: [],
  },
}, desktopClick)

module.exports = { desktopClick, buildPayload }
