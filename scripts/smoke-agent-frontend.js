// Phase B acceptance smoke test
// Tests the full IPC → agentLoop → DeepSeek → write_file chain
// Usage: node scripts/smoke-agent-frontend.js

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

// Set up temp data dir
const DATA_DIR = path.join(os.tmpdir(), 'agentdev-smoke-ipc-' + Date.now())
process.env.AGENTDEV_DATA_DIR = DATA_DIR
fs.mkdirSync(DATA_DIR, { recursive: true })

// Read real API key from existing config
const realConfigPaths = [
  path.join(os.homedir(), 'AppData', 'Roaming', 'agentdev-lite', 'data', 'config.json'),
  path.join(os.homedir(), 'AppData', 'Local', 'Temp', 'agentdev-lite', 'data', 'config.json')
]

let apiKey = ''
for (const p of realConfigPaths) {
  try {
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8'))
    apiKey = cfg.deepseekApiKey || cfg.apiKey || ''
    if (apiKey) {
      console.log('[smoke] Found API key in', p)
      break
    }
  } catch { /* skip */ }
}

if (!apiKey) {
  console.error('[smoke] No API key found. Skipping real smoke test.')
  console.log('[smoke] Result: SKIPPED (no API key)')
  process.exit(0)
}

// Write smoke config
const smokeConfig = {
  apiKey,
  deepseekApiKey: apiKey,
  baseUrl: 'https://api.deepseek.com',
  deepseekBaseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  fallbackModel: 'deepseek-chat',
  permissionMode: 'full',
  workspace_root: path.join(os.homedir(), 'Desktop'),
  session_confirm_cache_enabled: true
}
fs.writeFileSync(path.join(DATA_DIR, 'config.json'), JSON.stringify(smokeConfig))

// Load agent IPC module and register handlers
const { register: agentRegister } = require('../electron/ipc/agent')

function createMockIpcMain() {
  const handlers = new Map()
  const listeners = new Map()
  return {
    handlers,
    listeners,
    handle: (channel, handler) => handlers.set(channel, handler),
    on: (event, listener) => {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(listener)
    },
    emit: (event, data) => {
      const eventListeners = listeners.get(event) || []
      for (const listener of eventListeners) {
        listener({}, data)
      }
    }
  }
}

const targetPath = path.join(os.homedir(), 'Desktop', 'hello.txt')

async function main() {
  console.log('[smoke] Starting Phase B IPC smoke test...')
  console.log('[smoke] Target:', targetPath)

  // Clean up from previous runs
  try { fs.unlinkSync(targetPath) } catch { /* ok */ }

  const ipcMain = createMockIpcMain()
  agentRegister(ipcMain)

  const events = []
  const startTime = Date.now()

  // Collect agent events
  ipcMain.on('agent:event', (_evt, data) => {
    events.push({ time: Date.now() - startTime, ...data })
    console.log(`[smoke] Event: ${data.type}`, JSON.stringify(data).slice(0, 200))
  })

  // Start agent turn
  const convId = 'smoke-test-' + Date.now()
  const runPromise = ipcMain.handlers.get('agent:run-turn')(
    { sender: { send: (event, data) => ipcMain.emit(event, data) } },
    {
      convId,
      messages: [
        {
          role: 'user',
          content: `In ${path.join(os.homedir(), 'Desktop')}, create a file named hello.txt with the content "hello world". Use the write_file tool.`
        }
      ]
    }
  )

  // Auto-approve any approval requests after a short delay
  let approvalResolved = false
  const approvalTimer = setInterval(async () => {
    const approvalEvent = events.find(e => e.type === 'approval_request')
    if (approvalEvent && !approvalResolved) {
      approvalResolved = true
      console.log(`[smoke] Auto-approving tool: ${approvalEvent.call?.name}`)
      await ipcMain.handlers.get('agent:approve-tool')({}, { convId, callId: approvalEvent.call.id, approved: true })
    }
  }, 200)

  const result = await runPromise
  clearInterval(approvalTimer)

  console.log('\n[smoke] === Final Result ===')
  console.log('[smoke] ok:', result.ok)
  console.log('[smoke] finalText:', result.finalText)
  console.log('[smoke] history length:', result.history?.length)
  console.log('[smoke] total events:', events.length)

  // Verify file was created
  const fileExists = fs.existsSync(targetPath)
  let fileContent = ''
  if (fileExists) {
    fileContent = fs.readFileSync(targetPath, 'utf8')
  }
  console.log('[smoke] File exists:', fileExists)
  console.log('[smoke] File content:', fileContent)

  // Test abort
  console.log('\n[smoke] Testing abort...')
  const abortResult = await ipcMain.handlers.get('agent:abort')({}, { convId })
  console.log('[smoke] Abort result:', abortResult)

  // Summary
  const toolCallEvents = events.filter(e => e.type === 'assistant_message' && e.toolCalls?.length)
  const toolResultEvents = events.filter(e => e.type === 'tool_result')
  const writeFileEvents = events.filter(e => e.type === 'tool_result' && e.call?.name === 'write_file')
  const approvalEvents = events.filter(e => e.type === 'approval_request')

  const summary = {
    passed: fileExists && fileContent === 'hello world' && result.ok && approvalEvents.length > 0,
    finalText: result.finalText,
    steps: result.history?.length,
    toolCalls: toolCallEvents.length,
    toolResults: toolResultEvents.length,
    writeFileCalls: writeFileEvents.length,
    approvalRequests: approvalEvents.length,
    fileCreated: fileExists,
    fileContent,
    abortSupported: abortResult.ok === true,
    durationMs: Date.now() - startTime
  }

  console.log('\n[smoke] === Summary ===')
  console.log(JSON.stringify(summary, null, 2))

  // Append to test-report.md
  const reportPath = path.join(__dirname, '..', 'docs', 'test-report.md')
  const reportEntry = `

## Phase B acceptance smoke

Date: ${new Date().toISOString().split('T')[0]}

\`\`\`json
${JSON.stringify(summary, null, 2)}
\`\`\`

Events:
${events.map(e => `- **${e.type}** @${e.time}ms: ${JSON.stringify(e).slice(0, 200)}`).join('\n')}

Result: ${summary.passed ? 'PASS' : 'FAIL'}
`

  fs.appendFileSync(reportPath, reportEntry)
  console.log('[smoke] Appended results to docs/test-report.md')

  // Cleanup
  fs.rmSync(DATA_DIR, { recursive: true, force: true })
  try { fs.unlinkSync(targetPath) } catch { /* ok */ }

  process.exit(summary.passed ? 0 : 1)
}

main().catch((err) => {
  console.error('[smoke] Error:', err.message)
  console.error(err.stack)
  fs.rmSync(DATA_DIR, { recursive: true, force: true })
  process.exit(1)
})
