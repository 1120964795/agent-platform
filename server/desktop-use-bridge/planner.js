function extractJson(text) {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('Planner did not return JSON.')
  return JSON.parse(candidate.slice(start, end + 1))
}

function normalizeAction(action) {
  const type = String(action?.type || '').trim().toLowerCase()
  if (type === 'click') return { type: 'click', x: Number(action.x), y: Number(action.y), button: action.button || 'left', reason: action.reason || '' }
  if (type === 'type') return { type: 'type', text: String(action.text ?? ''), reason: action.reason || '' }
  if (type === 'hotkey') return { type: 'hotkey', keys: Array.isArray(action.keys) ? action.keys : String(action.keys || '').split('+'), reason: action.reason || '' }
  if (type === 'wait') return { type: 'wait', ms: Math.max(0, Number(action.ms) || 500), reason: action.reason || '' }
  if (type === 'done') return { type: 'done', summary: String(action.summary || 'Desktop task completed.') }
  if (type === 'fail') return { type: 'fail', summary: String(action.summary || 'Desktop task failed.') }
  return { type: 'unsupported', raw: action }
}

function createPlanner({ fetchImpl = fetch, env = process.env } = {}) {
  const endpoint = env.DESKTOP_USE_MODEL_ENDPOINT || 'https://zenmux.ai/api/v1'
  const apiKey = env.DESKTOP_USE_MODEL_API_KEY || ''
  const model = env.DESKTOP_USE_MODEL_NAME || 'openai/gpt-5.5'
  return {
    async nextAction({ goal, step, observation }) {
      if (!apiKey) return { type: 'fail', summary: 'Desktop Use API key is not configured.' }
      const response = await fetchImpl(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You control a Windows desktop. Return only JSON with type: click/type/hotkey/wait/done/fail.' },
            { role: 'user', content: `Goal: ${goal}\nStep: ${step}\nScreen: ${JSON.stringify(observation.screen || {})}\nReturn next action JSON.` }
          ]
        })
      })
      const data = await response.json()
      return normalizeAction(extractJson(data.choices?.[0]?.message?.content || ''))
    }
  }
}

module.exports = { createPlanner, normalizeAction, extractJson }
