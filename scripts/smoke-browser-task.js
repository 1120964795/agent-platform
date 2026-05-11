// Phase C acceptance smoke test
// Tests the browser-use sidecar adapter + tool registration chain
// Usage: node scripts/smoke-browser-task.js

const path = require('path')
const fs = require('fs')
const os = require('os')

// Mock Electron before any project module touches it
const mockElectron = {
  app: {
    getPath: () => path.join(os.tmpdir(), 'agentdev-smoke'),
    getName: () => 'AionUi',
    getVersion: () => '0.1.0',
    requestSingleInstanceLock: () => true,
    on: () => {},
    whenReady: () => Promise.resolve()
  },
  BrowserWindow: {
    getFocusedWindow: () => null,
    getAllWindows: () => []
  },
  dialog: {
    showMessageBox: async () => ({ response: 0, checkboxChecked: false })
  },
  ipcMain: {
    on: () => {},
    handle: () => {}
  }
}

require.cache[require.resolve('electron')] = { exports: mockElectron }

async function main() {
  console.log('[smoke] Starting Phase C browser-use smoke test...')

  const results = []

  // Test 1: adapter parseSSE
  console.log('[smoke] Test 1: parseSSE')
  const { parseSSE } = require('../electron/services/browserUse/adapter')

  const sseText = [
    'event: start',
    'data: {"goal":"test"}',
    '',
    'event: result',
    'data: {"success":true,"summary":"done","final_url":"https://example.com","steps_completed":3,"duration_ms":1500}',
    '',
    'event: done',
    'data: {"duration_ms":2000}',
    '',
  ].join('\n')

  const events = parseSSE(sseText)
  const parseOk = events.length === 3
    && events[0].type === 'start'
    && events[1].type === 'result'
    && events[2].type === 'done'
    && events[1].data.success === true
  results.push({ test: 'parseSSE', passed: parseOk })
  console.log(`[smoke]   parseSSE: ${parseOk ? 'PASS' : 'FAIL'} (${events.length} events)`)

  // Test 2: parseSSE without trailing blank line (edge case from code review)
  console.log('[smoke] Test 2: parseSSE (no trailing blank line)')
  const noTrailingText = 'event: done\ndata: {"duration_ms":1000}'
  const noTrailingEvents = parseSSE(noTrailingText)
  const trailingOk = noTrailingEvents.length === 1
    && noTrailingEvents[0].type === 'done'
    && noTrailingEvents[0].data.duration_ms === 1000
  results.push({ test: 'parseSSE (no trailing blank line)', passed: trailingOk })
  console.log(`[smoke]   parseSSE no-trail: ${trailingOk ? 'PASS' : 'FAIL'} (${noTrailingEvents.length} events)`)

  // Test 3: browser_task tool is registered in tool registry
  console.log('[smoke] Test 3: tool registration')
  const { TOOL_SCHEMAS } = require('../electron/tools')
  const browserTaskSchema = TOOL_SCHEMAS.find(s => s.name === 'browser_task')
  const regOk = !!browserTaskSchema
    && browserTaskSchema.parameters.required.includes('goal')
    && browserTaskSchema.parameters.properties.max_steps.type === 'number'
  results.push({ test: 'tool registration', passed: regOk })
  console.log(`[smoke]   tool registration: ${regOk ? 'PASS' : 'FAIL'}`)

  // Test 4: tool policy
  console.log('[smoke] Test 4: tool policy')
  const { evaluateToolCall } = require('../electron/security/toolPolicy')
  const decision = evaluateToolCall('browser_task', { goal: 'test' })
  const policyOk = decision.risk === 'medium'
    && decision.allowed === true
    && decision.requiresApproval === true
  results.push({ test: 'tool policy', passed: policyOk })
  console.log(`[smoke]   tool policy: ${policyOk ? 'PASS' : 'FAIL'} (risk=${decision.risk}, allowed=${decision.allowed}, requiresApproval=${decision.requiresApproval})`)

  // Test 5: browser_task rejects empty goal
  console.log('[smoke] Test 5: rejects empty goal')
  const { browserTask } = require('../electron/tools/browserTask')
  const emptyResult = await browserTask({}, { skipInternalConfirm: true })
  const emptyOk = emptyResult.error && emptyResult.error.code === 'INVALID_ARGS'
  results.push({ test: 'rejects empty goal', passed: emptyOk })
  console.log(`[smoke]   rejects empty goal: ${emptyOk ? 'PASS' : 'FAIL'}`)

  // Summary
  const allPassed = results.every(r => r.passed)
  const summary = {
    passed: allPassed,
    tests: results,
    totalTests: results.length,
    passedCount: results.filter(r => r.passed).length,
  }

  console.log('\n[smoke] === Summary ===')
  console.log(JSON.stringify(summary, null, 2))

  // Append to test-report.md
  const reportPath = path.join(__dirname, '..', 'docs', 'test-report.md')
  const reportEntry = `

## Phase C acceptance smoke

Date: ${new Date().toISOString().split('T')[0]}

\`\`\`json
${JSON.stringify(summary, null, 2)}
\`\`\`

Result: ${allPassed ? 'PASS' : 'FAIL'}
`

  fs.appendFileSync(reportPath, reportEntry)
  console.log('[smoke] Appended results to docs/test-report.md')

  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error('[smoke] Error:', err.message)
  console.error(err.stack)
  process.exit(1)
})
