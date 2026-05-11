const { register } = require('./index')
const { healthCheck, execute } = require('../services/desktop/adapter')
const { requestConfirm } = require('../confirm')

function parseMaxSteps(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 12
}

async function desktopTask(args, context = {}) {
  const goal = typeof args.goal === 'string' ? args.goal.trim() : ''
  if (!goal) {
    return { error: { code: 'INVALID_ARGS', message: 'desktop_task requires goal.' } }
  }

  const payload = {
    goal,
    maxSteps: parseMaxSteps(args.max_steps ?? args.maxSteps),
  }

  if (!context.skipInternalConfirm) {
    const allowed = await requestConfirm({
      kind: 'desktop-task',
      payload,
    })
    if (!allowed) {
      return { error: { code: 'USER_CANCELLED', message: 'Desktop task cancelled by user.' } }
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
    { type: 'desktop.task', payload },
    {
      signal: context.signal,
      sessionId: context.sessionId || context.convId,
      onEvent: context.onDesktopEvent,
      waitForUser: context.waitForDesktopUser,
    }
  )

  if (!result.ok) {
    return { error: result.error || { code: 'TASK_FAILED', message: 'Desktop task failed.' } }
  }

  return {
    goal,
    max_steps: payload.maxSteps,
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
    metadata: result.metadata,
  }
}

register({
  name: 'desktop_task',
  description: 'Run a self-contained desktop automation task using the desktop-use runtime. Args: goal (required), max_steps (optional).',
  parameters: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'Natural-language desktop task description.' },
      max_steps: { type: 'number', description: 'Maximum desktop interaction steps. Default: 12.' },
    },
    required: ['goal'],
  },
}, desktopTask)

module.exports = { desktopTask }
