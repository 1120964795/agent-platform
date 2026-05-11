const express = require('express')
const { classify } = require('./translator')
const { createDriver } = require('./driver')
const { createAgentRunner } = require('./agentRunner')
const { createEventHub } = require('./eventHub')

function normalize(raw = {}) {
  const ok = raw.ok !== false
  return {
    ok,
    exitCode: ok ? 0 : 1,
    stdout: String(raw.stdout || ''),
    stderr: String(raw.stderr || ''),
    durationMs: Number(raw.durationMs) || 0,
    completedAt: new Date().toISOString(),
    metadata: raw.metadata || {},
    ...(raw.error ? { error: raw.error } : {})
  }
}

function createApp(deps = {}) {
  const driver = deps.driver || createDriver()
  const agentRunner = deps.agentRunner || createAgentRunner({ driver })
  const eventHub = deps.eventHub || createEventHub()
  const app = express()
  app.use(express.json({ limit: '20mb' }))
  app.locals.eventHub = eventHub

  app.get('/health', (_req, res) => {
    res.json({ ok: true, runtime: 'desktop-use', version: '0.1.0', ready: agentRunner.ready?.() !== false })
  })

  app.get('/events/:sessionId', (req, res) => {
    eventHub.subscribe(String(req.params.sessionId || 'default'), res)
  })

  app.post('/resume', (req, res) => {
    const ok = eventHub.resume({
      sessionId: String(req.body?.sessionId || 'default'),
      requestId: String(req.body?.requestId || ''),
      answer: req.body?.answer
    })
    res.json({ ok })
  })

  app.post('/execute', async (req, res) => {
    const action = req.body || {}
    if (!action.approved) {
      return res.status(403).json(normalize({ ok: false, stderr: 'action not approved', error: { code: 'NOT_APPROVED', message: 'action not approved' } }))
    }

    const plan = classify(action)
    if (plan.backend === 'invalid') {
      return res.json(normalize({ ok: false, stderr: plan.reason, error: { code: 'INVALID_ACTION', message: plan.reason } }))
    }

    try {
      if (plan.backend === 'observe') {
        const observed = await driver.observe()
        return res.json(normalize({ ok: true, metadata: observed }))
      }
      if (plan.backend === 'coordinate-click') {
        const result = await driver.click({ x: plan.x, y: plan.y, button: plan.button })
        return res.json(normalize({ ok: result.ok, metadata: result }))
      }
      if (plan.backend === 'semantic-click') {
        return res.json(normalize({ ok: false, stderr: 'semantic grounding is not enabled yet', error: { code: 'GROUNDING_UNAVAILABLE', message: 'semantic grounding is not enabled yet' } }))
      }
      if (plan.backend === 'type') {
        const result = await driver.type({ text: plan.text })
        return res.json(normalize({ ok: result.ok, metadata: result }))
      }
      if (plan.backend === 'hotkey') {
        const result = await driver.hotkey({ keys: plan.keys })
        return res.json(normalize({ ok: result.ok, metadata: result }))
      }
      if (plan.backend === 'scroll') {
        const result = await driver.scroll({ x: plan.x, y: plan.y, direction: plan.direction, amount: plan.amount })
        return res.json(normalize({ ok: result.ok, metadata: result }))
      }
      if (plan.backend === 'drag') {
        const result = await driver.drag({ from: plan.from, to: plan.to, durationMs: plan.durationMs })
        return res.json(normalize({ ok: result.ok, metadata: result }))
      }
      if (plan.backend === 'wait') {
        const result = await driver.wait({ ms: plan.ms })
        return res.json(normalize({ ok: result.ok, metadata: result }))
      }
      if (plan.backend === 'task') {
        const sessionId = String(action.sessionId || 'default')
        const events = []
        const result = await agentRunner.runTask({
          goal: plan.goal,
          maxSteps: plan.maxSteps,
          onEvent: event => {
            events.push(event)
            eventHub.publish(sessionId, event)
          },
          waitForUser: request => eventHub.waitForUser({
            sessionId,
            requestId: request.requestId,
            question: request.question,
            publishInitial: false
          })
        })
        return res.json(normalize({ ok: result.ok, metadata: { ...result, events }, error: result.error }))
      }
      return res.json(normalize({ ok: false, stderr: `Unsupported backend ${plan.backend}` }))
    } catch (error) {
      return res.json(normalize({ ok: false, stderr: String(error.message || error), error: { code: 'DESKTOP_USE_ERROR', message: String(error.message || error) } }))
    }
  })

  app.post('/cancel', async (_req, res) => {
    const result = agentRunner.cancel ? await agentRunner.cancel() : { ok: true }
    res.json(result)
  })

  return app
}

function wireDefaultRuntime() {
  const driver = createDriver()
  return { driver, agentRunner: createAgentRunner({ driver }) }
}

function start({ port = 8790, host = '127.0.0.1', deps = {} } = {}) {
  const app = createApp(deps)
  return new Promise((resolve) => {
    const server = app.listen(port, host, () => resolve(server))
  })
}

if (require.main === module) {
  const portArg = process.argv.indexOf('--port')
  const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 8790
  start({ port, deps: wireDefaultRuntime() }).then((server) => {
    process.stdout.write(`desktop-use-bridge listening on 127.0.0.1:${server.address().port}\n`)
  })
}

module.exports = { createApp, start, wireDefaultRuntime, normalize }
