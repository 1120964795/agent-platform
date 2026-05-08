const { toUiTarsRequest, normalizeUiTarsResult } = require('./protocol')

function getFetch() {
  if (typeof fetch === 'function') return fetch
  return null
}

async function executeThroughBridge(endpoint, action, context = {}) {
  const fetchImpl = getFetch()
  if (!fetchImpl) throw new Error('当前运行时无法调用 UI-TARS 桥接服务：fetch 不可用。')
  const request = toUiTarsRequest(action)
  const resp = await fetchImpl(endpoint.replace(/\/+$/, '') + '/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: context.signal
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    return normalizeUiTarsResult(action, { ok: false, stderr: `UI-TARS 桥接服务返回 ${resp.status}：${text.slice(0, 200)}` })
  }
  return normalizeUiTarsResult(action, await resp.json())
}

module.exports = { executeThroughBridge }
