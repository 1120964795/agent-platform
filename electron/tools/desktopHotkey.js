const { register } = require('./index')
const { healthCheck, execute } = require('../services/desktop/adapter')

function normalizeKeys(value) {
  const keys = Array.isArray(value)
    ? value
    : String(value || '').split('+')
  return keys.map((key) => String(key).trim()).filter(Boolean)
}

async function desktopHotkey(args, context = {}) {
  const keys = normalizeKeys(args.keys)
  if (!keys.length) {
    return { error: { code: 'INVALID_ARGS', message: 'desktop_hotkey requires keys.' } }
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
    { type: 'desktop.hotkey', payload: { keys } },
    { signal: context.signal, sessionId: context.sessionId || context.convId }
  )

  if (!result.ok) {
    return { error: result.error || { code: 'HOTKEY_FAILED', message: 'Desktop hotkey failed.' } }
  }

  return {
    keys,
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
    metadata: result.metadata,
  }
}

register({
  name: 'desktop_hotkey',
  description: 'Press a desktop keyboard shortcut such as CTRL+S or ALT+F4. Args: keys (required) as an array or plus-separated string.',
  parameters: {
    type: 'object',
    properties: {
      keys: {
        oneOf: [
          { type: 'array', items: { type: 'string' } },
          { type: 'string' },
        ],
        description: 'Shortcut keys as an array or plus-separated string.',
      },
    },
    required: ['keys'],
  },
}, desktopHotkey)

module.exports = { desktopHotkey, normalizeKeys }
