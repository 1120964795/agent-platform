function sseData(event) {
  return `data: ${JSON.stringify(event)}\n\n`
}

function createEventHub() {
  const subscribers = new Map()
  const pendingReplies = new Map()

  function key(sessionId, requestId) {
    return `${sessionId}:${requestId}`
  }

  function publish(sessionId, event) {
    const payload = { sessionId, ts: Date.now(), ...event }
    for (const res of subscribers.get(sessionId) || []) {
      res.write(sseData(payload))
    }
    return payload
  }

  function subscribe(sessionId, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    res.write('\n')
    const set = subscribers.get(sessionId) || new Set()
    set.add(res)
    subscribers.set(sessionId, set)
    res.on('close', () => {
      set.delete(res)
      if (!set.size) subscribers.delete(sessionId)
    })
  }

  function waitForUser({ sessionId, requestId, question, publishInitial = true }) {
    if (publishInitial) publish(sessionId, { type: 'ask_user', requestId, question, summary: question })
    return new Promise((resolve) => {
      pendingReplies.set(key(sessionId, requestId), resolve)
    })
  }

  function resume({ sessionId, requestId, answer }) {
    const pendingKey = key(sessionId, requestId)
    const resolve = pendingReplies.get(pendingKey)
    if (!resolve) return false
    pendingReplies.delete(pendingKey)
    resolve(String(answer || ''))
    publish(sessionId, { type: 'resumed', requestId })
    return true
  }

  return { publish, subscribe, waitForUser, resume }
}

module.exports = { createEventHub }
