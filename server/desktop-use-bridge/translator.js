function num(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function nonEmpty(value) {
  return String(value ?? '').trim()
}

function pointPayload(value = {}) {
  return { x: num(value.x), y: num(value.y) }
}

function classify(action = {}) {
  const type = action.type
  const payload = action.payload || {}

  if (type === 'desktop.observe') return { backend: 'observe' }

  if (type === 'desktop.click') {
    const hasCoordinates = Number.isFinite(Number(payload.x)) && Number.isFinite(Number(payload.y))
    const target = nonEmpty(payload.target)
    if (hasCoordinates) {
      return {
        backend: 'coordinate-click',
        x: num(payload.x),
        y: num(payload.y),
        button: payload.button || 'left'
      }
    }
    if (target) return { backend: 'semantic-click', target }
    return { backend: 'invalid', reason: 'desktop.click requires x/y or target' }
  }

  if (type === 'desktop.type') return { backend: 'type', text: String(payload.text ?? '') }

  if (type === 'desktop.hotkey') {
    const keys = Array.isArray(payload.keys)
      ? payload.keys.map((key) => String(key).trim()).filter(Boolean)
      : String(payload.keys || '').split('+').map((key) => key.trim()).filter(Boolean)
    if (!keys.length) return { backend: 'invalid', reason: 'desktop.hotkey requires keys' }
    return { backend: 'hotkey', keys }
  }

  if (type === 'desktop.scroll') {
    return {
      backend: 'scroll',
      x: num(payload.x),
      y: num(payload.y),
      direction: payload.direction || 'down',
      amount: num(payload.amount, 3)
    }
  }

  if (type === 'desktop.drag') {
    return {
      backend: 'drag',
      from: pointPayload(payload.from),
      to: pointPayload(payload.to),
      durationMs: Math.max(0, num(payload.durationMs, 300))
    }
  }

  if (type === 'desktop.wait') {
    return { backend: 'wait', ms: Math.max(0, num(payload.ms, 500)) }
  }

  if (type === 'desktop.task') {
    const goal = nonEmpty(payload.goal)
    if (!goal) return { backend: 'invalid', reason: 'desktop.task requires goal' }
    return { backend: 'task', goal, maxSteps: Math.max(1, num(payload.maxSteps, 12)) }
  }

  return { backend: 'invalid', reason: `Unsupported ${type || 'desktop action'}` }
}

module.exports = { classify }
