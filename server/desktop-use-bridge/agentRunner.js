const { createPlanner, normalizeAction } = require('./planner')

function unsupportedAction(action) {
  return {
    ok: false,
    summary: 'Desktop planner returned an unsupported action.',
    steps: [],
    error: {
      code: 'UNSUPPORTED_PLANNER_ACTION',
      message: `Unsupported planner action: ${action?.type || 'unknown'}`
    }
  }
}

function finitePoint(action) {
  return Number.isFinite(Number(action.x)) && Number.isFinite(Number(action.y))
}

function createAgentRunner({ driver, planner = createPlanner() } = {}) {
  let cancelled = false

  async function executeAction(action, onEvent) {
    if (action.type === 'click') {
      if (!finitePoint(action)) return unsupportedAction(action)
      const payload = { x: Number(action.x), y: Number(action.y), button: action.button || 'left' }
      onEvent?.({ type: 'cursor.move', x: payload.x, y: payload.y, reason: action.reason || '' })
      const result = await driver.click(payload)
      onEvent?.({ type: 'cursor.click', x: payload.x, y: payload.y, button: payload.button })
      return { ok: result?.ok !== false, result }
    }
    if (action.type === 'type') {
      const result = await driver.type({ text: action.text })
      return { ok: result?.ok !== false, result }
    }
    if (action.type === 'hotkey') {
      const keys = Array.isArray(action.keys) ? action.keys.map(String).filter(Boolean) : []
      if (!keys.length) return unsupportedAction(action)
      const result = await driver.hotkey({ keys })
      return { ok: result?.ok !== false, result }
    }
    if (action.type === 'wait') {
      const result = await driver.wait({ ms: Math.max(0, Number(action.ms) || 500) })
      return { ok: result?.ok !== false, result }
    }
    return unsupportedAction(action)
  }

  return {
    ready: () => Boolean(driver && planner),

    async runTask({ goal, maxSteps = 12, onEvent } = {}) {
      cancelled = false
      const steps = []
      for (let step = 1; step <= maxSteps; step += 1) {
        if (cancelled) return { ok: false, summary: 'desktop task cancelled', steps, error: { code: 'CANCELLED', message: 'Desktop task cancelled.' } }
        const observation = driver?.observe ? await driver.observe() : null
        steps.push({ type: 'observe', ok: Boolean(observation) })
        onEvent?.({ type: 'task.observe', step, screen: observation?.screen || null })

        const plannedRaw = await planner.nextAction({ goal, step, observation: observation || {}, steps })
        const action = plannedRaw?.type === 'unsupported' ? plannedRaw : normalizeAction(plannedRaw)
        steps.push({ type: 'plan', action })
        onEvent?.({ type: 'task.plan', step, action })

        if (action.type === 'done') return { ok: true, summary: action.summary, steps }
        if (action.type === 'fail') return { ok: false, summary: action.summary, steps, error: { code: 'PLANNER_FAILED', message: action.summary } }
        if (action.type === 'unsupported') return { ...unsupportedAction(action.raw), steps }

        const executed = await executeAction(action, onEvent)
        if (executed?.ok === false) {
          return {
            ok: false,
            summary: executed.error?.message || 'Desktop action failed.',
            steps,
            error: executed.error || { code: 'ACTION_FAILED', message: 'Desktop action failed.' }
          }
        }
        steps.push({ type: 'action', action: action.type, result: executed.result })
      }
      return {
        ok: false,
        summary: `Desktop task reached max steps (${maxSteps}).`,
        steps,
        error: { code: 'MAX_STEPS_REACHED', message: `Desktop task reached max steps (${maxSteps}).` }
      }
    },

    async cancel() {
      cancelled = true
      return { ok: true }
    }
  }
}

module.exports = { createAgentRunner }
