const { register } = require('./index')
const { healthCheck, execute } = require('../services/desktop/adapter')

async function desktopObserve(args, context = {}) {
  const health = await healthCheck()
  if (!health.available) {
    return {
      error: {
        code: 'RUNTIME_UNAVAILABLE',
        message: 'UI-TARS 桌面运行时不可用。请确认 uitars-bridge（端口 8765）正在运行。',
        detail: health.detail,
      },
    }
  }

  const result = await execute(
    { type: 'screen.observe', payload: {} },
    { signal: context.signal, sessionId: context.sessionId }
  )

  if (!result.ok) {
    return { error: result.error || { code: 'OBSERVE_FAILED', message: '屏幕捕获失败。' } }
  }

  return {
    screenshot_base64: result.metadata?.screenshotBase64 || '',
    mime: result.metadata?.mime || 'image/png',
    duration_ms: result.durationMs,
  }
}

register({
  name: 'desktop_observe',
  description: '捕获当前桌面屏幕截图，返回 base64 编码的 PNG 图片。点击或输入前可用它查看屏幕当前内容。',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
}, desktopObserve)

module.exports = { desktopObserve }
