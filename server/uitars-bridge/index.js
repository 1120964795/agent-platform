const express = require('express')
const { classify } = require('./translator')

function normalize(raw = {}) {
  const ok = raw.ok !== false
  return {
    ok,
    exitCode: ok ? 0 : 1,
    stdout: String(raw.stdout || ''),
    stderr: String(raw.stderr || ''),
    filesChanged: [],
    durationMs: Number(raw.durationMs) || 0,
    completedAt: new Date().toISOString(),
    metadata: raw.metadata || {}
  }
}

function createApp(deps = {}) {
  const runner = deps.agentRunner || { ready: () => false }
  const app = express()
  app.use(express.json({ limit: '20mb' }))

  app.get('/health', (_req, res) => {
    res.json({ ok: true, runtime: 'ui-tars', agentReady: Boolean(runner.ready()) })
  })

  app.post('/execute', async (req, res) => {
    const action = req.body || {}
    if (!action.approved) return res.status(403).json(normalize({ ok: false, stderr: 'action not approved' }))
    const plan = classify(action)
    try {
      if (plan.backend === 'not-implemented') {
        return res.json(normalize({ ok: false, stderr: plan.reason, metadata: { notImplemented: true, reason: plan.reason } }))
      }
      if (plan.backend === 'screenshot') {
        const buf = await runner.screenshot()
        return res.json(normalize({ ok: true, metadata: { screenshotBase64: Buffer.from(buf).toString('base64'), mime: 'image/png' } }))
      }
      if (plan.backend === 'semantic-click') {
        const r = await runner.semanticClick(plan.instruction)
        return res.json(normalize({ ok: r.ok, stderr: r.reason, metadata: r }))
      }
      if (plan.backend === 'direct-type') {
        const r = await runner.type(plan.text)
        return res.json(normalize({ ok: r.ok, metadata: r }))
      }
      return res.json(normalize({ ok: false, stderr: plan.reason || 'unknown' }))
    } catch (err) {
      return res.json(normalize({ ok: false, stderr: String(err.message || err) }))
    }
  })

  return app
}

function wireDefaultRunner() {
  const { createAgentRunner } = require('./agentRunner')
  return {
    agentRunner: createAgentRunner({
      modelProvider: process.env.UITARS_MODEL_PROVIDER || '',
      modelEndpoint: process.env.UITARS_MODEL_ENDPOINT || '',
      modelApiKey: process.env.UITARS_MODEL_API_KEY || '',
      modelName: process.env.UITARS_MODEL_NAME || ''
    })
  }
}

function start({ port = 8765, host = '127.0.0.1', deps = {} } = {}) {
  const app = createApp(deps)
  return new Promise((resolve) => {
    const server = app.listen(port, host, () => resolve(server))
  })
}

if (require.main === module) {
  const portArg = process.argv.indexOf('--port')
  const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 8765
  start({ port, deps: wireDefaultRunner() }).then((s) => process.stdout.write(`uitars-bridge listening on 127.0.0.1:${s.address().port}\n`))
}

module.exports = { createApp, start, wireDefaultRunner }
