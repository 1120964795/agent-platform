const { register } = require('./index')
const { healthCheck, execute } = require('../services/desktop/adapter')

async function desktopObserve(_args, context = {}) {
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
    { type: 'desktop.observe', payload: {} },
    { signal: context.signal, sessionId: context.sessionId || context.convId }
  )

  if (!result.ok) {
    return { error: result.error || { code: 'OBSERVE_FAILED', message: 'Desktop screenshot failed.' } }
  }

  return {
    screenshot_base64: result.metadata?.screenshotBase64 || '',
    mime: result.metadata?.mime || 'image/png',
    duration_ms: result.durationMs,
  }
}

register({
  name: 'desktop_observe',
  description: 'Capture a screenshot of the current desktop screen. Returns a base64-encoded PNG image. Use this to see what is currently on screen before clicking or typing.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
}, desktopObserve)

module.exports = { desktopObserve }
