const { register } = require('./index')
const { healthCheck, execute } = require('../services/desktop/adapter')

function numberOr(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

async function desktopScroll(args, context = {}) {
  const direction = ['up', 'down', 'left', 'right'].includes(args.direction) ? args.direction : 'down'
  const payload = {
    x: numberOr(args.x, 0),
    y: numberOr(args.y, 0),
    direction,
    amount: Math.max(1, numberOr(args.amount, 3)),
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
    { type: 'desktop.scroll', payload },
    { signal: context.signal, sessionId: context.sessionId || context.convId }
  )

  if (!result.ok) {
    return { error: result.error || { code: 'SCROLL_FAILED', message: 'Desktop scroll failed.' } }
  }

  return {
    ...payload,
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
    metadata: result.metadata,
  }
}

register({
  name: 'desktop_scroll',
  description: 'Scroll the desktop at optional coordinates. Args: direction (up/down/left/right), amount, x, y.',
  parameters: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'Optional screen x coordinate. Default: 0.' },
      y: { type: 'number', description: 'Optional screen y coordinate. Default: 0.' },
      direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Scroll direction. Default: down.' },
      amount: { type: 'number', description: 'Scroll amount. Default: 3.' },
    },
    required: [],
  },
}, desktopScroll)

module.exports = { desktopScroll }
