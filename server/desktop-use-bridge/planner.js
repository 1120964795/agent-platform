function extractJson(text) {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('Planner did not return JSON.')
  return JSON.parse(candidate.slice(start, end + 1))
}

const ALLOWED_ACTION_TYPES = Object.freeze(['click', 'type', 'hotkey', 'wait', 'scroll', 'drag', 'ask_user', 'done', 'fail'])
const ACTION_TYPES = new Set(ALLOWED_ACTION_TYPES)

function actionType(action) {
  return String(action?.action || action?.type || '').trim().toLowerCase()
}

function rawActionName(action) {
  return String(action?.action || action?.type || '').trim().toLowerCase()
}

function stringifyCompact(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function buildActionContractText() {
  return [
    `Allowed actions: ${ALLOWED_ACTION_TYPES.join(', ')}`,
    'Return exactly one JSON object for one next desktop action.',
    'Use only action/type plus action-specific fields; do not wrap the JSON in prose.',
    'Do not return open_app, launch_app, or focus_window.',
    'Do not return search_contact.',
    'Do not return send_message.',
    'Do not return locate, inspect, or any other high-level action.',
    'Break high-level intentions into low-level desktop actions: click, type, hotkey, wait, scroll, drag, ask_user, done, or fail.',
    'If the target app, contact, conversation, form, or input field is already visible and the goal includes text to send or submit, prioritize focusing the input, typing the requested text, and submitting it.',
    'Avoid repeating search/navigation actions once the destination is visible.',
    'Use done only after the requested final action appears completed.',
    'Use ask_user when login, permission, ambiguity, missing app state, or low confidence blocks safe execution.',
    'For pointer actions, include screenshot coordinates and confidence from 0 to 1.'
  ].join('\n')
}

function buildCorrectionText(correction) {
  if (!correction) return ''
  return [
    'Previous planner output was invalid.',
    `Invalid reason: ${correction.message || correction.code || 'unsupported action'}`,
    `Invalid action name: ${correction.invalidActionName || 'unknown'}`,
    `Raw invalid action: ${stringifyCompact(correction.rawAction)}`,
    `Allowed actions: ${(correction.allowedActions || ALLOWED_ACTION_TYPES).join(', ')}`,
    'Return a replacement action using only the allowed actions. Do not repeat the invalid action.'
  ].join('\n')
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizePoint(value = {}) {
  return { x: finiteNumber(value.x), y: finiteNumber(value.y) }
}

function normalizeConfidence(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(0, Math.min(1, parsed))
}

function normalizeAction(action) {
  const type = actionType(action)
  const base = {
    type: ACTION_TYPES.has(type) ? type : 'unsupported',
    confidence: normalizeConfidence(action?.confidence),
    reason: String(action?.reason || ''),
    userVisibleSummary: String(action?.userVisibleSummary || action?.summary || action?.reason || ''),
    raw: action,
    unsupportedAction: ACTION_TYPES.has(type) ? '' : (rawActionName(action) || 'unknown')
  }
  if (base.type === 'click') return { ...base, x: finiteNumber(action.x), y: finiteNumber(action.y), button: action.button || 'left' }
  if (base.type === 'type') return { ...base, text: String(action.text ?? '') }
  if (base.type === 'hotkey') return { ...base, keys: Array.isArray(action.keys) ? action.keys.map(String) : String(action.keys || '').split('+') }
  if (base.type === 'wait') return { ...base, ms: Math.max(0, finiteNumber(action.ms, 500)) }
  if (base.type === 'scroll') return { ...base, x: finiteNumber(action.x), y: finiteNumber(action.y), direction: action.direction || 'down', amount: finiteNumber(action.amount, 3) }
  if (base.type === 'drag') return { ...base, from: normalizePoint(action.from), to: normalizePoint(action.to), durationMs: Math.max(0, finiteNumber(action.durationMs, 300)) }
  if (base.type === 'ask_user') return { ...base, question: String(action.question || action.userVisibleSummary || 'Computer Use needs your input to continue.') }
  if (base.type === 'done') return { ...base, summary: String(action.summary || 'Desktop task completed.') }
  if (base.type === 'fail') return { ...base, summary: String(action.summary || action.reason || 'Desktop task failed.') }
  return base
}

function buildPlannerMessages({ goal, step, maxSteps, observation = {}, steps = [], correction = null }) {
  const screen = observation.screen || {}
  const history = steps.slice(-8).map((item) => ({
    type: item.type,
    action: item.action,
    summary: item.summary,
    ok: item.ok
  }))
  const correctionText = buildCorrectionText(correction)
  const text = [
    `Goal: ${goal}`,
    `Step: ${step} of ${maxSteps}`,
    `Screen: ${JSON.stringify(screen)}`,
    `Recent history: ${JSON.stringify(history)}`,
    buildActionContractText(),
    correctionText
  ].filter(Boolean).join('\n\n')
  const content = [{ type: 'text', text }]
  if (observation.screenshotBase64) {
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:${observation.mime || 'image/png'};base64,${observation.screenshotBase64}`
      }
    })
  }
  return [
    { role: 'system', content: 'You operate a Windows desktop. Plan one safe next desktop action. Return strict JSON only.' },
    { role: 'user', content }
  ]
}

function createPlanner({ fetchImpl = fetch, env = process.env } = {}) {
  const endpoint = env.DESKTOP_USE_MODEL_ENDPOINT || 'https://zenmux.ai/api/v1'
  const apiKey = env.DESKTOP_USE_MODEL_API_KEY || ''
  const model = env.DESKTOP_USE_MODEL_NAME || 'openai/gpt-5.5'
  return {
    async nextAction({ goal, step, maxSteps = 12, observation, steps = [], correction = null }) {
      if (!apiKey) return { type: 'fail', summary: 'Desktop Use API key is not configured.' }
      const response = await fetchImpl(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: buildPlannerMessages({ goal, step, maxSteps, observation, steps, correction })
        })
      })
      const data = await response.json()
      return normalizeAction(extractJson(data.choices?.[0]?.message?.content || ''))
    }
  }
}

module.exports = { createPlanner, normalizeAction, extractJson, buildPlannerMessages, ALLOWED_ACTION_TYPES }
