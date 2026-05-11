// Phase D acceptance smoke test
// Tests the desktop tools adapter + tool registration chain
// Usage: node scripts/smoke-desktop-tools.js

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
  console.log('[smoke] Starting Phase D desktop tools smoke test...')

  const results = []

  // Test 1: adapter healthCheck with mock
  console.log('[smoke] Test 1: adapter healthCheck')
  global.fetch = async (url, opts) => {
    if (url.includes('/health')) {
      return { json: async () => ({ ok: true, runtime: 'ui-tars', agentReady: true }) }
    }
    return { ok: true, json: async () => ({ ok: true, exitCode: 0 }) }
  }
  const { healthCheck } = require('../electron/services/desktop/adapter')
  const health = await healthCheck()
  results.push({ test: 'adapter healthCheck', passed: health.available === true })
  console.log(`[smoke]   healthCheck: ${health.available ? 'PASS' : 'FAIL'}`)

  // Test 2-4: tool registration
  const { TOOL_SCHEMAS } = require('../electron/tools')
  const toolNames = ['desktop_observe', 'desktop_click', 'desktop_type']

  for (const name of toolNames) {
    const schema = TOOL_SCHEMAS.find(s => s.name === name)
    const ok = !!schema
    results.push({ test: `tool ${name} registered`, passed: ok })
    console.log(`[smoke]   ${name} registration: ${ok ? 'PASS' : 'FAIL'}`)
  }

  // Test 5-7: tool policy
  console.log('[smoke] Test 5-7: tool policy')
  const { evaluateToolCall } = require('../electron/security/toolPolicy')

  const observeDecision = evaluateToolCall('desktop_observe', {})
  results.push({ test: 'desktop_observe policy', passed: observeDecision.risk === 'low' && !observeDecision.requiresApproval })
  console.log(`[smoke]   desktop_observe policy: ${observeDecision.risk === 'low' ? 'PASS' : 'FAIL'}`)

  const clickDecision = evaluateToolCall('desktop_click', { target: 'test' })
  results.push({ test: 'desktop_click policy', passed: clickDecision.risk === 'high' && clickDecision.requiresApproval })
  console.log(`[smoke]   desktop_click policy: ${clickDecision.risk === 'high' ? 'PASS' : 'FAIL'}`)

  const typeDecision = evaluateToolCall('desktop_type', { text: 'hello' })
  results.push({ test: 'desktop_type policy', passed: typeDecision.risk === 'medium' && typeDecision.requiresApproval })
  console.log(`[smoke]   desktop_type policy: ${typeDecision.risk === 'medium' ? 'PASS' : 'FAIL'}`)

  // Test 8: argument validation
  console.log('[smoke] Test 8: argument validation')
  const { desktopClick } = require('../electron/tools/desktopClick')
  const emptyClick = await desktopClick({}, { skipInternalConfirm: true })
  results.push({ test: 'desktop_click rejects empty target', passed: emptyClick.error?.code === 'INVALID_ARGS' })
  console.log(`[smoke]   desktop_click validation: ${emptyClick.error?.code === 'INVALID_ARGS' ? 'PASS' : 'FAIL'}`)

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

  const docsDir = path.join(__dirname, '..', 'docs')
  fs.mkdirSync(docsDir, { recursive: true })
  const reportPath = path.join(docsDir, 'test-report.md')
  const reportEntry = `

## Phase D acceptance smoke

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
