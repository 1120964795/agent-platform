// Bridge end-to-end integration test
// Starts both bridges with real API keys, runs real browser + desktop tasks
// Usage:
//   set BROWSER_USE_MODEL_API_KEY=xxx
//   set UITARS_MODEL_API_KEY=xxx
//   node scripts/smoke-bridges-e2e.js
//
// Or pass API key on command line:
//   node scripts/smoke-bridges-e2e.js --api-key=xxx

const { spawn, execSync } = require('child_process')
const http = require('http')
const path = require('path')
const fs = require('fs')
const os = require('os')

// --- Config ---
const API_KEY = process.env.AIONUI_API_KEY || ''
const ENDPOINT = process.env.AIONUI_MODEL_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3'
const BU_MODEL = process.env.BROWSER_USE_MODEL_NAME || 'ep-20260509193331-bf5px'
const UT_MODEL = process.env.UITARS_MODEL_NAME || 'ep-20260509193331-bf5px'
const BU_PORT = 8780
const UT_PORT = 8765

// Parse CLI args
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--api-key=')) process.env.AIONUI_API_KEY = arg.slice('--api-key='.length)
  if (arg.startsWith('--endpoint=')) process.env.AIONUI_MODEL_ENDPOINT = arg.slice('--endpoint='.length)
}

const key = process.env.AIONUI_API_KEY || API_KEY
if (!key) {
  console.error('[e2e] ERROR: No API key. Set AIONUI_API_KEY env var or use --api-key=')
  process.exit(1)
}

// --- Helpers ---
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function httpGet(port, route) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${route}`, { timeout: 5000 }, (res) => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch { resolve(body) }
      })
    }).on('error', reject)
  })
}

function httpPost(port, route, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data)
    const req = http.request({
      hostname: '127.0.0.1', port, path: route, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 300000
    }, (res) => {
      let chunks = ''
      res.on('data', c => chunks += c)
      res.on('end', () => {
        // SSE stream — extract "result" event
        if (chunks.startsWith('event:')) {
          const lines = chunks.split('\n')
          for (let i = 0; i < lines.length; i++) {
            if (lines[i] === 'event: result') {
              try { resolve(JSON.parse(lines[i + 1].replace('data: ', ''))) } catch { resolve(chunks) }
              return
            }
          }
          resolve({ raw: chunks })
        } else {
          try { resolve(JSON.parse(chunks)) } catch { resolve(chunks) }
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.write(body)
    req.end()
  })
}

function spawnBridge(name, command, args, env) {
  console.log(`[e2e] Starting ${name} bridge...`)
  const logDir = path.join(os.tmpdir(), 'aionui-e2e-logs')
  fs.mkdirSync(logDir, { recursive: true })
  const logFile = path.join(logDir, `${name}-e2e.log`)
  const logStream = fs.createWriteStream(logFile)
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  })
  child.stdout.pipe(logStream)
  child.stderr.pipe(logStream)
  child.logFile = logFile
  return child
}

async function waitForHealth(port, name, maxRetries = 20) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await httpGet(port, '/health')
      if (resp.ok || resp.ready !== false) {
        console.log(`[e2e]   ${name} healthy after ${i + 1}s:`, JSON.stringify(resp))
        return resp
      }
    } catch {}
    await sleep(1000)
  }
  throw new Error(`${name} failed to become healthy on port ${port}`)
}

// --- Main ---
async function main() {
  const results = []
  const children = []

  try {
    // ===== Browser-Use Bridge =====
    console.log('\n[e2e] ===== Browser-Use Bridge (port 8780) =====')

    // Check python deps
    console.log('[e2e] Checking Python dependencies...')
    try {
      execSync('python -c "import browser_use; import fastapi; import uvicorn"', { encoding: 'utf8', timeout: 10000 })
      console.log('[e2e]   Python deps OK')
    } catch (e) {
      console.error('[e2e]   Python deps MISSING:', e.message)
      results.push({ test: 'browser-use deps', passed: false, error: e.message })
      process.exit(1)
    }

    // Start browser-use bridge
    const buChild = spawnBridge('browser-use', 'python', [
      path.join(__dirname, '..', 'server', 'browser-use-bridge', 'main.py')
    ], {
      BROWSER_USE_MODEL_ENDPOINT: ENDPOINT,
      BROWSER_USE_MODEL_API_KEY: key,
      BROWSER_USE_MODEL_NAME: BU_MODEL,
      BROWSER_USE_PORT: String(BU_PORT)
    })
    children.push(buChild)

    await waitForHealth(BU_PORT, 'browser-use')
    results.push({ test: 'browser-use bridge health', passed: true })
    console.log('[e2e]   PASS: browser-use bridge health')

    // Run simple browser task
    console.log('[e2e] Running browser task: navigate to example.com...')
    try {
      const bResult = await httpPost(BU_PORT, '/execute', {
        goal: 'Navigate to https://example.com and read the page title',
        max_steps: 5,
        headless: true
      })
      console.log('[e2e]   browser task result:', JSON.stringify(bResult, null, 2).slice(0, 500))
      const success = bResult.success === true
      results.push({ test: 'browser-use execute task', passed: success, detail: bResult })
      console.log(`[e2e]   ${success ? 'PASS' : 'FAIL'}: browser-use execute task`)
    } catch (e) {
      console.error('[e2e]   browser task error:', e.message)
      results.push({ test: 'browser-use execute task', passed: false, error: e.message })
    }

    // ===== UI-TARS Bridge =====
    console.log('\n[e2e] ===== UI-TARS Bridge (port 8765) =====')

    // Check node deps for UI-TARS
    console.log('[e2e] Checking UI-TARS dependencies...')
    try {
      require.resolve('@ui-tars/sdk')
      require.resolve('screenshot-desktop')
      require.resolve('@nut-tree-fork/nut-js')
      console.log('[e2e]   UI-TARS deps OK')
      results.push({ test: 'ui-tars deps', passed: true })
    } catch (e) {
      console.error('[e2e]   UI-TARS deps MISSING:', e.message)
      results.push({ test: 'ui-tars deps', passed: false, error: e.message })
    }

    // Start UI-TARS bridge
    const utChild = spawnBridge('ui-tars', 'node', [
      path.join(__dirname, '..', 'server', 'uitars-bridge', 'index.js'),
      '--port', String(UT_PORT)
    ], {
      UITARS_MODEL_ENDPOINT: ENDPOINT,
      UITARS_MODEL_API_KEY: key,
      UITARS_MODEL_NAME: UT_MODEL,
    })
    children.push(utChild)

    await waitForHealth(UT_PORT, 'ui-tars')
    results.push({ test: 'ui-tars bridge health', passed: true })
    console.log('[e2e]   PASS: ui-tars bridge health')

    // Test 1: Desktop observe (screenshot)
    console.log('[e2e] Running desktop observe (screenshot)...')
    try {
      const obsResult = await httpPost(UT_PORT, '/execute', {
        type: 'screen.observe',
        payload: {},
        approved: true,
        actionId: 'e2e-test-1',
        sessionId: 'e2e'
      })
      const hasScreenshot = obsResult.metadata?.screenshotBase64?.length > 100
      results.push({ test: 'desktop observe screenshot', passed: hasScreenshot, detail: { mime: obsResult.metadata?.mime, screenshotLen: obsResult.metadata?.screenshotBase64?.length } })
      console.log(`[e2e]   ${hasScreenshot ? 'PASS' : 'FAIL'}: desktop observe (screenshot: ${(obsResult.metadata?.screenshotBase64?.length || 0)} bytes)`)
    } catch (e) {
      console.error('[e2e]   desktop observe error:', e.message)
      results.push({ test: 'desktop observe screenshot', passed: false, error: e.message })
    }

    // Test 2: Vision model grounding test (direct API call)
    console.log('[e2e] Testing vision model grounding capability...')
    try {
      const screenshot = require('screenshot-desktop')
      const imgBuf = await screenshot()
      const imgBase64 = Buffer.from(imgBuf).toString('base64')

      // Call Doubao vision model directly (OpenAI-compatible API)
      const visionResp = await new Promise((resolve, reject) => {
        const body = JSON.stringify({
          model: UT_MODEL,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:image/png;base64,${imgBase64}` } },
              { type: 'text', text: 'Describe what you see on this desktop screen in 2-3 sentences. What applications or windows are visible?' }
            ]
          }],
          max_tokens: 200
        })
        const req = http.request({
          hostname: 'ark.cn-beijing.volces.com',
          path: '/api/v3/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'Authorization': `Bearer ${key}`
          },
          timeout: 60000
        }, (res) => {
          let chunks = ''
          res.on('data', c => chunks += c)
          res.on('end', () => { try { resolve(JSON.parse(chunks)) } catch { resolve(chunks) } })
        })
        req.on('error', reject)
        req.write(body)
        req.end()
      })

      const visionText = visionResp?.choices?.[0]?.message?.content || ''
      const visionOk = visionText.length > 20
      results.push({ test: 'vision model grounding', passed: visionOk, detail: visionText.slice(0, 300) })
      console.log(`[e2e]   ${visionOk ? 'PASS' : 'FAIL'}: vision model described desktop: "${visionText.slice(0, 150)}..."`)
    } catch (e) {
      console.error('[e2e]   vision model error:', e.message)
      results.push({ test: 'vision model grounding', passed: false, error: e.message })
    }

    // Test 3: Desktop semantic click (real model → coordinates → real click)
    console.log('[e2e] Running desktop semantic click (model-driven)...')
    try {
      const clickResult = await httpPost(UT_PORT, '/execute', {
        type: 'mouse.click',
        payload: { target: 'click on the Windows Start button in the bottom-left corner of the taskbar' },
        approved: true,
        actionId: 'e2e-test-3',
        sessionId: 'e2e'
      })
      const clickOk = clickResult.ok === true && typeof clickResult.metadata?.x === 'number'
      results.push({ test: 'desktop semantic click', passed: clickOk, detail: { x: clickResult.metadata?.x, y: clickResult.metadata?.y } })
      console.log(`[e2e]   ${clickOk ? 'PASS' : 'FAIL'}: desktop semantic click (x=${clickResult.metadata?.x}, y=${clickResult.metadata?.y})`)
    } catch (e) {
      console.error('[e2e]   desktop semantic click error:', e.message)
      results.push({ test: 'desktop semantic click', passed: false, error: e.message })
    }

    // Test 4: Desktop type text (keyboard simulation)
    console.log('[e2e] Running desktop type text...')
    try {
      const typeResult = await httpPost(UT_PORT, '/execute', {
        type: 'keyboard.type',
        payload: { text: '' },
        approved: true,
        actionId: 'e2e-test-4',
        sessionId: 'e2e'
      })
      results.push({ test: 'desktop type text', passed: typeResult.ok === true, detail: typeResult.metadata })
      console.log(`[e2e]   ${typeResult.ok === true ? 'PASS' : 'FAIL'}: desktop type text`)
    } catch (e) {
      console.error('[e2e]   desktop type error:', e.message)
      results.push({ test: 'desktop type text', passed: false, error: e.message })
    }

  } catch (e) {
    console.error('[e2e] Bridge startup failed:', e.message)
    results.push({ test: 'bridge startup', passed: false, error: e.message })
  } finally {
    // Cleanup
    console.log('\n[e2e] Cleaning up bridges...')
    for (const child of children) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' })
        } else {
          child.kill('SIGTERM')
        }
      } catch {}
    }
    await sleep(1000)
  }

  // --- Summary ---
  const passed = results.filter(r => r.passed).length
  const allPassed = passed === results.length
  console.log('\n[e2e] ===== E2E BRIDGE INTEGRATION TEST SUMMARY =====')
  for (const r of results) {
    console.log(`  ${r.passed ? 'PASS' : 'FAIL'}: ${r.test}`)
  }
  console.log(`  Total: ${passed}/${results.length} passed`)
  console.log(allPassed ? '\n[e2e] 全部通过！' : '\n[e2e] 有失败项，检查上方日志。')

  process.exit(allPassed ? 0 : 1)
}

main().catch(e => {
  console.error('[e2e] Fatal:', e.message)
  console.error(e.stack)
  process.exit(1)
})
