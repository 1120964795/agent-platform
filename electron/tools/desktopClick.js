const { register } = require('./index')
const { healthCheck, execute } = require('../services/desktop/adapter')
const { requestConfirm } = require('../confirm')

async function desktopClick(args, context = {}) {
  const { target } = args

  if (!target || typeof target !== 'string') {
    return { error: { code: 'INVALID_ARGS', message: '需要提供 target 参数（点击目标的自然语言描述）。' } }
  }

  // High-risk operation: confirm with user.
  if (!context.skipInternalConfirm) {
    const allowed = await requestConfirm({
      kind: 'desktop-click',
      payload: { target },
    })
    if (!allowed) {
      return { error: { code: 'USER_CANCELLED', message: '用户已取消桌面点击操作。' } }
    }
  }

  const health = await healthCheck()
  if (!health.available) {
    return {
      error: {
        code: 'RUNTIME_UNAVAILABLE',
        message: 'UI-TARS 桌面运行时不可用。请确认 uitars-bridge（端口 8765）已启动。',
        detail: health.detail,
      },
    }
  }

  const result = await execute(
    { type: 'mouse.click', payload: { target } },
    { signal: context.signal, sessionId: context.sessionId }
  )

  if (!result.ok) {
    return { error: result.error || { code: 'CLICK_FAILED', message: '桌面点击失败。' } }
  }

  return {
    target,
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
    metadata: result.metadata,
  }
}

register({
  name: 'desktop_click',
  description: '点击桌面屏幕上的界面元素。AI 视觉模型会根据自然语言描述定位并点击目标。参数：target（必填）表示要点击的目标描述。',
  parameters: {
    type: 'object',
    properties: {
      target: { type: 'string', description: '要点击的界面元素的自然语言描述。' },
    },
    required: ['target'],
  },
}, desktopClick)

module.exports = { desktopClick }
