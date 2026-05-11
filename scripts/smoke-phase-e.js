// Phase E acceptance smoke test
// Tests the full AionUi stack: agent loop, tools, bridges, persistence
// Usage: node scripts/smoke-phase-e.js

const path = require('path')
const fs = require('fs')
const os = require('os')

// Mock Electron before any project module touches it
const smokeDir = path.join(os.tmpdir(), 'aionui-smoke-e')
fs.mkdirSync(smokeDir, { recursive: true })

const mockElectron = {
  app: {
    getPath: (key) => smokeDir,
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
  console.log('[smoke:e] Starting Phase E acceptance smoke test...')

  const results = []

  // --- Phase A: Agent loop ---
  console.log('[smoke:e] Phase A: Agent loop')

  // Test 1: Agent loop module loads
  const { runTurn } = require('../electron/services/agentLoop')
  results.push({ test: 'agent loop module loads', passed: typeof runTurn === 'function' })
  console.log(`[smoke:e]   agent loop: ${typeof runTurn === 'function' ? 'PASS' : 'FAIL'}`)

  // --- Phase B: Frontend wiring ---
  console.log('[smoke:e] Phase B: Frontend wiring')

  // Test 2: IPC agent module loads
  const agentIpc = require('../electron/ipc/agent')
  results.push({ test: 'agent IPC module loads', passed: typeof agentIpc.register === 'function' })
  console.log(`[smoke:e]   agent IPC: ${typeof agentIpc.register === 'function' ? 'PASS' : 'FAIL'}`)

  // --- Phase C: Browser-use ---
  console.log('[smoke:e] Phase C: Browser-use')

  // Test 3: browser_task tool registered
  const { TOOL_SCHEMAS: toolsC } = require('../electron/tools')
  const browserTask = toolsC.find(s => s.name === 'browser_task')
  results.push({ test: 'browser_task tool registered', passed: !!browserTask && browserTask.parameters.required.includes('goal') })
  console.log(`[smoke:e]   browser_task: ${browserTask ? 'PASS' : 'FAIL'}`)

  // Test 4: Browser adapter loads
  global.fetch = async () => ({ json: async () => ({ ok: true }) })
  const bUse = require('../electron/services/browserUse/adapter')
  results.push({ test: 'browser adapter loads', passed: typeof bUse.healthCheck === 'function' })
  console.log(`[smoke:e]   browser adapter: ${typeof bUse.healthCheck === 'function' ? 'PASS' : 'FAIL'}`)

  // --- Phase D: Desktop tools ---
  console.log('[smoke:e] Phase D: Desktop tools')

  // Test 5: desktop_observe registered
  const desktopObs = toolsC.find(s => s.name === 'desktop_observe')
  results.push({ test: 'desktop_observe registered', passed: !!desktopObs })
  console.log(`[smoke:e]   desktop_observe: ${desktopObs ? 'PASS' : 'FAIL'}`)

  // Test 6: desktop_click policy HIGH risk
  const { evaluateToolCall } = require('../electron/security/toolPolicy')
  const clickPolicy = evaluateToolCall('desktop_click', { target: 'test' })
  results.push({ test: 'desktop_click HIGH risk', passed: clickPolicy.risk === 'high' && clickPolicy.requiresApproval })
  console.log(`[smoke:e]   desktop_click policy: ${clickPolicy.risk === 'high' ? 'PASS' : 'FAIL'}`)

  // --- Phase E: Cleanup ---
  console.log('[smoke:e] Phase E: Cleanup')

  // Test 7: No midscene in RUNTIME_NAMES
  const { RUNTIME_NAMES } = require('../electron/security/actionTypes')
  results.push({ test: 'no midscene in RUNTIME_NAMES', passed: !RUNTIME_NAMES.MIDSCENE })
  console.log(`[smoke:e]   no midscene in RUNTIME_NAMES: ${!RUNTIME_NAMES.MIDSCENE ? 'PASS' : 'FAIL'}`)

  // Test 8: No midscene in bridge supervisor DEFAULTS
  const { createSupervisor } = require('../electron/services/bridgeSupervisor')
  const sup = createSupervisor({
    spawnImpl: () => ({ on() {}, kill() {} }),
    healthImpl: async () => ({ ok: true })
  })
  const state = sup.getState()
  results.push({ test: 'no midscene in bridge state', passed: !state.midscene })
  console.log(`[smoke:e]   no midscene bridge: ${!state.midscene ? 'PASS' : 'FAIL'}`)

  // Test 9: Conversation store works
  const { upsertConversation, getConversation, listConversations, deleteConversation, close } = require('../electron/services/conversationStore')
  close()
  const conv = upsertConversation('smoke-test', { title: 'Smoke Test', messages: [{ role: 'user', content: 'hello' }] })
  results.push({ test: 'conversation store create', passed: conv.id === 'smoke-test' && conv.title === 'Smoke Test' })
  console.log(`[smoke:e]   conversation store create: ${conv.id === 'smoke-test' ? 'PASS' : 'FAIL'}`)

  const retrieved = getConversation('smoke-test')
  results.push({ test: 'conversation store read', passed: retrieved !== null && retrieved.messages.length === 1 })
  console.log(`[smoke:e]   conversation store read: ${retrieved !== null ? 'PASS' : 'FAIL'}`)

  deleteConversation('smoke-test')
  results.push({ test: 'conversation store delete', passed: getConversation('smoke-test') === null })
  console.log(`[smoke:e]   conversation store delete: ${getConversation('smoke-test') === null ? 'PASS' : 'FAIL'}`)
  close()

  // --- Summary ---
  const allPassed = results.every(r => r.passed)
  const summary = {
    passed: allPassed,
    tests: results,
    totalTests: results.length,
    passedCount: results.filter(r => r.passed).length,
  }

  console.log('\n[smoke:e] === Summary ===')
  console.log(JSON.stringify(summary, null, 2))

  const docsDir = path.join(__dirname, '..', 'docs')
  fs.mkdirSync(docsDir, { recursive: true })
  const reportPath = path.join(docsDir, 'test-report.md')
  const reportEntry = `

## Phase E acceptance smoke

Date: ${new Date().toISOString().split('T')[0]}

\`\`\`json
${JSON.stringify(summary, null, 2)}
\`\`\`

Result: ${allPassed ? 'PASS' : 'FAIL'}
`

  fs.appendFileSync(reportPath, reportEntry)
  console.log('[smoke:e] Appended results to docs/test-report.md')

  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error('[smoke:e] Error:', err.message)
  console.error(err.stack)
  process.exit(1)
})
