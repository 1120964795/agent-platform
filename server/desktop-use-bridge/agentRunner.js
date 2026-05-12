const { createPlanner, normalizeAction, ALLOWED_ACTION_TYPES } = require('./planner')

const LOW_CONFIDENCE_THRESHOLD = 0.55
const POINTER_ACTIONS = new Set(['click', 'drag', 'scroll'])

function emit(onEvent, event) {
  onEvent?.({ ts: Date.now(), ...event })
}

function unsupportedActionName(action) {
  const raw = action?.raw || action
  const name = action?.unsupportedAction || raw?.action || raw?.type || action?.type || 'unknown'
  return String(name || 'unknown')
}

function buildUnsupportedError(action, options = {}) {
  const name = unsupportedActionName(action)
  return {
    code: 'UNSUPPORTED_PLANNER_ACTION',
    message: `Unsupported planner action: ${name}`,
    invalidActionName: name,
    allowedActions: ALLOWED_ACTION_TYPES,
    rawAction: action?.raw || action,
    retryAttempted: Boolean(options.retryAttempted)
  }
}

function unsupportedAction(action, options = {}) {
  return {
    ok: false,
    summary: 'Desktop planner returned an unsupported action.',
    steps: [],
    error: buildUnsupportedError(action, options)
  }
}

function finitePoint(action) {
  return Number.isFinite(Number(action.x)) && Number.isFinite(Number(action.y))
}

function finitePair(point) {
  return Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y))
}

function isLowConfidence(action) {
  return POINTER_ACTIONS.has(action.type) && Number(action.confidence) < LOW_CONFIDENCE_THRESHOLD
}

function normalizePlannerResult(plannedRaw) {
  return plannedRaw?.type === 'unsupported' ? plannedRaw : normalizeAction(plannedRaw)
}

function createAgentRunner({ driver, planner = createPlanner() } = {}) {
  let cancelled = false

  async function executeAction(action, onEvent) {
    if (action.type === 'click') {
      if (!finitePoint(action)) return unsupportedAction(action)
      const payload = { x: Number(action.x), y: Number(action.y), button: action.button || 'left' }
      emit(onEvent, { type: 'cursor_move', x: payload.x, y: payload.y, state: 'moving', reason: action.reason || '' })
      emit(onEvent, { type: 'cursor.move', x: payload.x, y: payload.y, reason: action.reason || '' })
      emit(onEvent, { type: 'action_start', action: 'click', target: payload })
      const result = await driver.click(payload)
      emit(onEvent, { type: 'cursor.click', x: payload.x, y: payload.y, button: payload.button })
      return { ok: result?.ok !== false, result }
    }
    if (action.type === 'type') {
      emit(onEvent, { type: 'action_start', action: 'type', textLength: String(action.text ?? '').length })
      const result = await driver.type({ text: action.text })
      return { ok: result?.ok !== false, result }
    }
    if (action.type === 'hotkey') {
      const keys = Array.isArray(action.keys) ? action.keys.map(String).filter(Boolean) : []
      if (!keys.length) return unsupportedAction(action)
      emit(onEvent, { type: 'action_start', action: 'hotkey', keys })
      const result = await driver.hotkey({ keys })
      return { ok: result?.ok !== false, result }
    }
    if (action.type === 'wait') {
      const payload = { ms: Math.max(0, Number(action.ms) || 500) }
      emit(onEvent, { type: 'action_start', action: 'wait', target: payload })
      const result = await driver.wait(payload)
      return { ok: result?.ok !== false, result }
    }
    if (action.type === 'scroll') {
      const payload = {
        x: Number(action.x) || 0,
        y: Number(action.y) || 0,
        direction: action.direction || 'down',
        amount: Number(action.amount) || 3
      }
      emit(onEvent, { type: 'cursor_move', x: payload.x, y: payload.y, state: 'scrolling', reason: action.reason || '' })
      emit(onEvent, { type: 'action_start', action: 'scroll', target: payload })
      const result = await driver.scroll(payload)
      return { ok: result?.ok !== false, result }
    }
    if (action.type === 'drag') {
      if (!finitePair(action.from) || !finitePair(action.to)) return unsupportedAction(action)
      const payload = {
        from: { x: Number(action.from.x), y: Number(action.from.y) },
        to: { x: Number(action.to.x), y: Number(action.to.y) },
        durationMs: Number(action.durationMs) || 300
      }
      emit(onEvent, { type: 'cursor_move', x: payload.from.x, y: payload.from.y, state: 'dragging', reason: action.reason || '' })
      emit(onEvent, { type: 'action_start', action: 'drag', target: payload })
      const result = await driver.drag(payload)
      return { ok: result?.ok !== false, result }
    }
    return unsupportedAction(action)
  }

  return {
    ready: () => Boolean(driver && planner),

    async runTask({ goal, maxSteps = 12, onEvent, waitForUser } = {}) {
      cancelled = false
      const steps = []
      const userReplies = []
      emit(onEvent, { type: 'task_started', goal, maxSteps })
      for (let step = 1; step <= maxSteps; step += 1) {
        if (cancelled) {
          const error = { code: 'CANCELLED', message: 'Desktop task cancelled.' }
          emit(onEvent, { type: 'cancelled', summary: error.message })
          return { ok: false, summary: 'desktop task cancelled', steps, error }
        }
        const observation = driver?.observe ? await driver.observe() : null
        steps.push({ type: 'observe', ok: Boolean(observation), screen: observation?.screen || null })
        emit(onEvent, { type: 'observe', step, screen: observation?.screen || null })
        emit(onEvent, { type: 'task.observe', step, screen: observation?.screen || null })

        const planInput = { goal, step, maxSteps, observation: observation || {}, steps, userReplies }
        let action = normalizePlannerResult(await planner.nextAction(planInput))
        steps.push({ type: 'plan', action })
        emit(onEvent, { type: 'plan', step, action, summary: action.userVisibleSummary || action.reason || action.summary || action.type })
        emit(onEvent, { type: 'task.plan', step, action })

        if (action.type === 'unsupported') {
          const correction = buildUnsupportedError(action, { retryAttempted: false })
          emit(onEvent, {
            type: 'planner_correction',
            step,
            code: correction.code,
            message: correction.message,
            allowedActions: correction.allowedActions,
            rawAction: correction.rawAction
          })
          steps.push({ type: 'planner_correction', ok: false, error: correction })

          action = normalizePlannerResult(await planner.nextAction({ ...planInput, correction }))
          steps.push({ type: 'plan', action, correction: true })
          emit(onEvent, { type: 'plan', step, action, correction: true, summary: action.userVisibleSummary || action.reason || action.summary || action.type })
          emit(onEvent, { type: 'task.plan', step, action, correction: true })
        }

        if (action.type === 'done') {
          emit(onEvent, { type: 'done', summary: action.summary })
          return { ok: true, summary: action.summary, steps }
        }
        if (action.type === 'fail') {
          const error = { code: 'PLANNER_FAILED', message: action.summary }
          emit(onEvent, { type: 'fail', code: error.code, summary: action.summary })
          return { ok: false, summary: action.summary, steps, error }
        }
        if (action.type === 'unsupported') {
          const result = { ...unsupportedAction(action, { retryAttempted: true }), steps }
          emit(onEvent, { type: 'fail', code: result.error.code, summary: result.summary })
          return result
        }
        if (isLowConfidence(action)) {
          const error = { code: 'LOW_CONFIDENCE_ACTION', message: action.reason || 'Planner confidence is too low for desktop input.' }
          emit(onEvent, { type: 'fail', code: error.code, summary: error.message })
          return { ok: false, summary: error.message, steps, error }
        }
        if (action.type === 'ask_user') {
          const requestId = `ask-${Date.now()}-${step}`
          emit(onEvent, { type: 'ask_user', requestId, question: action.question, summary: action.userVisibleSummary || action.question })
          if (!waitForUser) {
            const error = { code: 'USER_INPUT_REQUIRED', message: action.question }
            return { ok: false, paused: true, summary: action.question, steps, error, requestId }
          }
          const answer = await waitForUser({ requestId, question: action.question, action, step })
          userReplies.push({ requestId, question: action.question, answer: String(answer || '') })
          emit(onEvent, { type: 'resumed', requestId })
          continue
        }

        const executed = await executeAction(action, onEvent)
        if (executed?.ok === false) {
          emit(onEvent, { type: 'fail', code: executed.error?.code || 'ACTION_FAILED', summary: executed.error?.message || 'Desktop action failed.' })
          return {
            ok: false,
            summary: executed.error?.message || 'Desktop action failed.',
            steps,
            error: executed.error || { code: 'ACTION_FAILED', message: 'Desktop action failed.' }
          }
        }
        steps.push({ type: 'action', action: action.type, result: executed.result })
        emit(onEvent, { type: 'action_result', step, action: action.type, ok: true, result: executed.result })
        const verification = driver?.observe ? await driver.observe() : null
        steps.push({ type: 'verify', ok: Boolean(verification), screen: verification?.screen || null })
        emit(onEvent, { type: 'verify', step, screen: verification?.screen || null })
      }
      emit(onEvent, { type: 'fail', code: 'MAX_STEPS_REACHED', summary: `Desktop task reached max steps (${maxSteps}).` })
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
