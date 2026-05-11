# Phase E: Cleanup, Persistence, Bootstrap & Acceptance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all remaining midscene/legacy stale references from code, build scripts, and docs; add SQLite conversation persistence; add Python detection/bootstrap for browser-use; refresh all documentation to reflect the agent-loop architecture; run final acceptance suite.

**Architecture:** Phase E is a multi-concern cleanup and delivery phase. It covers 5 independent workstreams: (1) stale reference removal from source/build/docs, (2) documentation refresh to match current architecture, (3) SQLite-based conversation storage replacing JSON file persistence, (4) Python/uv detection for browser-use bridge, and (5) final acceptance smoke test covering the full stack.

**Tech Stack:** Node.js (Electron main), better-sqlite3, vitest, React/Vite/Tailwind, Python 3.11+, uv (optional bootstrap), electron-builder (NSIS).

**Prerequisite:** Phases A-D complete. All 37 test files, 225 tests pass. Client build passes.

---

## Reuse pact (MUST honor)

| | What |
|---|---|
| 1 | Do NOT rewrite existing bridges (oi, uitars, browser-use) — they work. |
| 2 | Use `better-sqlite3` for SQLite — already in `optionalDependencies`, electron-rebuild is configured in `postinstall`. |
| 3 | Keep existing `store.js` API surface — add SQLite underneath, don't break callers. |
| 4 | Do NOT touch the agent loop, tool registry, or tool policy — they're stable. |
| 5 | Do NOT add user login/authentication — out of scope. |
| 6 | Do NOT bundle Python into the Electron installer — detect and guide only. |
| 7 | Delete stale code completely — no `// DEPRECATED` comments, no backwards-compat shims. |

---

## File plan

```
NEW
  electron/services/conversationStore.js     SQLite-backed conversation CRUD
  electron/__tests__/conversation-store.test.js
  electron/services/pythonBootstrap.js       Python/uv detect + guided setup
  electron/__tests__/python-bootstrap.test.js
  scripts/smoke-phase-e.js                   Phase E acceptance smoke test

MODIFY
  electron/store.js                          Add SQLite init, delegate conversations to conversationStore
  electron/security/actionTypes.js           Remove MIDSCENE from RUNTIME_NAMES
  electron/ipc/openExternal.js               Remove midscene URL from allowlist
  electron/services/browserUse/index.js      Add Python detection via pythonBootstrap
  package.json                               Remove server/midscene-bridge from workspaces + extraResources
  scripts/prepare-bridges.js                 Remove midscene-bridge from BRIDGES array
  .gitignore                                 Remove midscene_run/* entries
  docs/developer-guide.md                    Rewrite for agent-loop architecture
  docs/security-policy.md                    Update for toolPolicy (replace actionPolicy references)
  docs/runtime-setup.md                      Remove Midscene, add browser-use Python setup
  docs/USER_MANUAL.md                        Remove Midscene references, add browser-use + desktop tools
  docs/release-checklist.md                  Add Phase D + E items, mark completed
  docs/test-report.md                        Append Phase E smoke results
```

---

## Task 1: Remove stale midscene/legacy references from source (~30 min)

Clean up the last remaining midscene references in active source code and build configuration.

- [ ] **Step 1: Remove MIDSCENE from actionTypes.js**

File: `electron/security/actionTypes.js`

Remove `MIDSCENE: 'midscene'` from the `RUNTIME_NAMES` object (line ~6). The constant is unused — no code references `RUNTIME_NAMES.MIDSCENE`.

- [ ] **Step 2: Remove midscene URL from openExternal.js**

File: `electron/ipc/openExternal.js`

Remove `https://midscenejs.com` from the URL allowlist (line ~7).

- [ ] **Step 3: Remove midscene from package.json**

File: `package.json`

- Remove `"server/midscene-bridge"` from the `workspaces` array (line ~8).
- Remove the `dist-bridges/midscene-bridge` entries from `extraResources` (lines ~61-62 in the `build` config).

- [ ] **Step 4: Remove midscene from prepare-bridges.js**

File: `scripts/prepare-bridges.js`

Remove `'midscene-bridge'` from the `BRIDGES` array (line ~6).

- [ ] **Step 5: Remove midscene_run from .gitignore**

File: `.gitignore`

Remove lines 17-20 that ignore `midscene_run/dump`, `midscene_run/report`, `midscene_run/tmp`, `midscene_run/log`.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: 37 test files, all pass. No `midscene` module resolution errors.

- [ ] **Step 7: Run client build**

```bash
cd client && npm run build
```

Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: remove stale midscene references from source, build scripts, and gitignore"
```

---

## Task 2: Refresh documentation (~1 hour)

Rewrite stale documentation to reflect the current agent-loop + tool-policy architecture. Remove all Midscene, actionPlanner, actionPolicy, actionBroker, taskOrchestrator references.

- [ ] **Step 1: Rewrite developer-guide.md**

File: `docs/developer-guide.md`

Replace entirely. Document:

```markdown
# AionUi Developer Guide

## Architecture

AionUi uses an agent-loop architecture:

1. **Agent Loop** (`electron/services/agentLoop.js`) — Drives the conversation: sends messages to the model, receives tool calls, evaluates policy, requests user approval, executes tools, returns results.
2. **Tool Registry** (`electron/tools/index.js`) — All available tools register here via `register(schema, handler)`. Tools are auto-discovered by the agent loop.
3. **Tool Policy** (`electron/security/toolPolicy.js`) — Classifies every tool call by risk level (low/medium/high/blocked). Low-risk auto-executes; medium/high require user approval; blocked tools never execute.
4. **Bridges** — External runtimes managed by `bridgeSupervisor.js`:
   - `oi-bridge` (port 8756) — Open Interpreter for shell/code execution
   - `uitars-bridge` (port 8765) — UI-TARS for desktop screen/mouse/keyboard
   - `browser-use-bridge` (port 8780) — Python browser-use for web automation
5. **IPC** (`electron/ipc/`) — Each IPC module registers handlers on `ipcMain`. Modules: agent, chat, config, conversations, artifacts, files, dialog, skills, rules, runtime, audit, outputs, openExternal, setupStatus.

## Key Files

| File | Purpose |
|------|---------|
| `electron/services/agentLoop.js` | Core agent loop: model call → tool calls → policy → execute → repeat |
| `electron/tools/index.js` | Tool registry: register(), execute(), getAgentLoopToolSchemas() |
| `electron/security/toolPolicy.js` | Risk classification for all tools |
| `electron/services/bridgeSupervisor.js` | Start/stop/health-check all bridge sidecars |
| `electron/main.js` | Electron main entry, window creation, bridge lifecycle |
| `electron/preload.js` | Context bridge exposing IPC to renderer |
| `electron/store.js` | Config and data persistence (JSON + SQLite) |

## Adding a New Tool

1. Create `electron/tools/yourTool.js` with a handler function and `register()` call.
2. Add `require('./yourTool')` in `electron/tools/index.js` `loadBuiltins()`.
3. Add a case in `electron/security/toolPolicy.js` `evaluateToolCall()`.
4. Write tests in `electron/__tests__/your-tool.test.js`.

## Running Tests

```bash
npm test                 # All unit tests
node scripts/smoke-*.js  # Integration smoke tests
npm run build:client     # Frontend build
```
```

- [ ] **Step 2: Update security-policy.md**

File: `docs/security-policy.md`

Replace references to `actionPolicy.js` with `toolPolicy.js`. Replace `actionBroker` with `agentLoop.js`. Remove Midscene from runtime list. Update the invariant:

```
模型提议 → agentLoop 接收工具调用 → toolPolicy 评估风险 → 用户确认(中/高风险) → 工具执行 → 审计日志记录
```

- [ ] **Step 3: Update runtime-setup.md**

File: `docs/runtime-setup.md`

- Remove the Midscene section entirely.
- Add a "Browser Automation (browser-use)" section documenting Python 3.11+, `pip install browser-use`, and `playwright install chromium`.
- Update the UI-TARS section — it's already accurate (Doubao vision key).

- [ ] **Step 4: Update USER_MANUAL.md**

File: `docs/USER_MANUAL.md`

- Remove all Midscene references (Chrome extension, bridge mode instructions).
- Add browser-use documentation: what it does, how to set up Python, how to use `browser_task`.
- Add desktop tools documentation: `desktop_observe`, `desktop_click`, `desktop_type`.

- [ ] **Step 5: Update release-checklist.md**

File: `docs/release-checklist.md`

Add completed items for Phases C, D, and E tasks. Mark overall status.

- [ ] **Step 6: Run client build**

```bash
cd client && npm run build
```

Expected: build succeeds (docs don't affect build, but verify nothing broke).

- [ ] **Step 7: Commit**

```bash
git add docs/
git commit -m "docs: refresh documentation for agent-loop architecture, remove midscene references"
```

---

## Task 3: SQLite conversation persistence (~1.5 hours)

Replace JSON file-based conversation storage with SQLite via `better-sqlite3`. Keep the existing `store.js` API compatible.

- [ ] **Step 1: Create conversationStore.js**

File: `electron/services/conversationStore.js`

```js
const path = require('path')
const { app } = require('electron')

let db = null
let __testDbPath = null  // injection point for unit tests

function getDbPath() {
  if (__testDbPath) return __testDbPath
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'conversations.db')
}

function open() {
  if (db) return db
  const Database = require('better-sqlite3')
  db = new Database(getDbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      messages TEXT NOT NULL DEFAULT '[]',
      assistant TEXT NOT NULL DEFAULT 'qwen',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  return db
}

function close() {
  if (db) { db.close(); db = null }
}

function listConversations() {
  const d = open()
  const rows = d.prepare('SELECT id, title, assistant, created_at, updated_at FROM conversations ORDER BY updated_at DESC').all()
  return rows.map(r => ({ id: r.id, title: r.title, assistant: r.assistant, createdAt: r.created_at, updatedAt: r.updated_at }))
}

function getConversation(id) {
  const d = open()
  const row = d.prepare('SELECT * FROM conversations WHERE id = ?').get(id)
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    messages: JSON.parse(row.messages),
    assistant: row.assistant,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function upsertConversation(id, data) {
  const d = open()
  const existing = d.prepare('SELECT id FROM conversations WHERE id = ?').get(id)
  if (existing) {
    const updates = []
    const params = {}
    if (data.title !== undefined) { updates.push('title = @title'); params.title = data.title }
    if (data.messages !== undefined) { updates.push('messages = @messages'); params.messages = JSON.stringify(data.messages) }
    if (data.assistant !== undefined) { updates.push('assistant = @assistant'); params.assistant = data.assistant }
    updates.push("updated_at = datetime('now')")
    params.id = id
    d.prepare(`UPDATE conversations SET ${updates.join(', ')} WHERE id = @id`).run(params)
  } else {
    d.prepare(`
      INSERT INTO conversations (id, title, messages, assistant, created_at, updated_at)
      VALUES (@id, @title, @messages, @assistant, datetime('now'), datetime('now'))
    `).run({
      id,
      title: data.title || '',
      messages: JSON.stringify(data.messages || []),
      assistant: data.assistant || 'qwen'
    })
  }
  return getConversation(id)
}

function deleteConversation(id) {
  const d = open()
  d.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

module.exports = { open, close, listConversations, getConversation, upsertConversation, deleteConversation, __testDbPath: null }

// The test file sets conversationStore.__testDbPath before calling open().
// In production, __testDbPath stays null and getDbPath() uses electron.app.getPath().
```

The `__testDbPath` property is set directly on the exports object by tests before any CRUD calls — no special mock needed beyond the electron mock.

- [ ] **Step 2: Write the unit test**

File: `electron/__tests__/conversation-store.test.js`

```js
import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'
import path from 'path'
import os from 'os'
import fs from 'fs'

const require = createRequire(import.meta.url)

const testDir = path.join(os.tmpdir(), 'aionui-conv-test-' + Date.now())

const mockApp = {
  getPath: vi.fn(() => testDir)
}

vi.mock('electron', () => ({ app: mockApp }))

const conversationStore = require('../services/conversationStore')

beforeEach(() => {
  fs.mkdirSync(testDir, { recursive: true })
  conversationStore.__testDbPath = path.join(testDir, 'conversations.db')
  conversationStore.close()
})

afterEach(() => {
  conversationStore.close()
  try { fs.rmSync(testDir, { recursive: true, force: true }) } catch {}
  conversationStore.__testDbPath = null
})

const { listConversations, upsertConversation, getConversation, deleteConversation, close } = conversationStore

test('listConversations returns empty array when no conversations', () => {
  const list = listConversations()
  expect(list).toEqual([])
})

test('upsertConversation creates a new conversation', () => {
  close()
  const conv = upsertConversation('conv-1', { title: 'Test', messages: [{ role: 'user', content: 'hello' }] })
  expect(conv.id).toBe('conv-1')
  expect(conv.title).toBe('Test')
  expect(conv.messages).toHaveLength(1)
})

test('getConversation returns the created conversation', () => {
  const conv = getConversation('conv-1')
  expect(conv).not.toBeNull()
  expect(conv.title).toBe('Test')
})

test('upsertConversation updates an existing conversation', () => {
  upsertConversation('conv-1', { title: 'Updated Title' })
  const conv = getConversation('conv-1')
  expect(conv.title).toBe('Updated Title')
  expect(conv.messages).toHaveLength(1) // messages preserved
})

test('listConversations returns conversations ordered by updated_at DESC', () => {
  upsertConversation('conv-2', { title: 'Second' })
  upsertConversation('conv-3', { title: 'Third' })
  const list = listConversations()
  expect(list.length).toBe(3)
  expect(list[0].id).toBe('conv-3')
})

test('deleteConversation removes the conversation', () => {
  deleteConversation('conv-1')
  const conv = getConversation('conv-1')
  expect(conv).toBeNull()
  const list = listConversations()
  expect(list.length).toBe(2)
})
```

- [ ] **Step 3: Wire into store.js**

File: `electron/store.js`

Add at the top:
```js
const conversationStore = require('./services/conversationStore')
```

Modify the existing `listConversations`, `getConversation`, `upsertConversation`, `deleteConversation` methods to delegate to `conversationStore` instead of reading/writing `data.json`. For backward compatibility, the store methods should call the SQLite-backed conversationStore.

Replace the existing `data.json`-based conversation methods:

```js
// OLD (delete these):
// listConversations() — reads data.json
// getConversation(id) — reads data.json
// upsertConversation(id, data) — writes data.json
// deleteConversation(id) — writes data.json

// NEW:
listConversations() {
  return conversationStore.listConversations()
}
getConversation(id) {
  return conversationStore.getConversation(id)
}
upsertConversation(id, data) {
  return conversationStore.upsertConversation(id, data)
}
deleteConversation(id) {
  return conversationStore.deleteConversation(id)
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/__tests__/conversation-store.test.js
```

Expected: 6 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: 37+ test files, all pass.

- [ ] **Step 6: Commit**

```bash
git add electron/services/conversationStore.js electron/__tests__/conversation-store.test.js electron/store.js
git commit -m "feat: add SQLite-backed conversation persistence"
```

---

## Task 4: Python/uv detection for browser-use (~45 min)

Add a `pythonBootstrap.js` service that detects Python 3.11+ availability and provides setup guidance. Wire it into the browser-use service.

- [ ] **Step 1: Create pythonBootstrap.js**

File: `electron/services/pythonBootstrap.js`

```js
const { execSync } = require('child_process')

function findCommand(cmd) {
  try {
    const whereCmd = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`
    const output = execSync(whereCmd, { encoding: 'utf8', timeout: 5000 }).trim()
    return output.split('\n')[0].trim() || null
  } catch {
    return null
  }
}

async function detect() {
  const result = {
    python: null,
    pythonVersion: null,
    uv: null,
    browserUse: null,
    playwright: null,
    ready: false,
    issues: []
  }

  try {
    const pythonPath = findCommand('python')
    if (!pythonPath) {
      result.issues.push('Python 未安装。请安装 Python 3.11+ (https://python.org)')
      return result
    }
    result.python = pythonPath

    const versionOutput = execSync('python --version 2>&1', { encoding: 'utf8', timeout: 5000 }).trim()
    result.pythonVersion = versionOutput
    const match = versionOutput.match(/Python (\d+)\.(\d+)/)
    if (!match || parseInt(match[1]) < 3 || (parseInt(match[1]) === 3 && parseInt(match[2]) < 11)) {
      result.issues.push(`Python 3.11+ 需要，当前为 ${versionOutput}`)
      return result
    }
  } catch {
    result.issues.push('无法检测 Python 版本。')
    return result
  }

  try {
    result.uv = findCommand('uv')
  } catch {}

  try {
    execSync('python -c "import browser_use"', { encoding: 'utf8', timeout: 10000 })
    result.browserUse = true
  } catch {
    result.issues.push('browser-use 未安装。运行: pip install browser-use')
  }

  try {
    execSync('python -c "from playwright.sync_api import sync_playwright"', { encoding: 'utf8', timeout: 10000 })
    result.playwright = true
  } catch {
    result.issues.push('playwright 未安装。运行: playwright install chromium')
  }

  result.ready = result.issues.length === 0
  return result
}

function getSetupGuide(detection) {
  const steps = []
  if (!detection.python) {
    steps.push('1. 安装 Python 3.11+: https://python.org/downloads/')
    steps.push('2. 确保 Python 已添加到 PATH')
  }
  if (!detection.browserUse) {
    steps.push('3. 运行: pip install browser-use')
  }
  if (!detection.playwright) {
    steps.push('4. 运行: playwright install chromium')
  }
  if (detection.uv) {
    steps.push('提示: 检测到 uv，可用 `uv pip install browser-use` 加速安装')
  }
  return steps.length ? steps : ['Python 环境已就绪。']
}

module.exports = { detect, getSetupGuide }
```

- [ ] **Step 2: Write unit test**

File: `electron/__tests__/python-bootstrap.test.js`

```js
import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const { detect, getSetupGuide } = require('../services/pythonBootstrap')

test('getSetupGuide returns instructions when python is missing', () => {
  const steps = getSetupGuide({ python: null, uv: null, browserUse: false, playwright: false })
  expect(steps.length).toBeGreaterThan(0)
  expect(steps.some(s => s.includes('Python 3.11'))).toBe(true)
})

test('getSetupGuide returns ready message when all deps present', () => {
  const steps = getSetupGuide({ python: '/usr/bin/python', uv: null, browserUse: true, playwright: true })
  expect(steps).toEqual(['Python 环境已就绪。'])
})

test('getSetupGuide mentions uv when available', () => {
  const steps = getSetupGuide({ python: '/usr/bin/python', uv: '/usr/bin/uv', browserUse: false, playwright: false })
  expect(steps.some(s => s.includes('uv pip install'))).toBe(true)
})
```

- [ ] **Step 3: Wire into browserUse/index.js**

File: `electron/services/browserUse/index.js`

Add at the top:
```js
const { detect: detectPython, getSetupGuide: getPythonGuide } = require('../pythonBootstrap')
```

Modify the existing `detect()` function to merge Python detection with bridge health:

```js
async function detect() {
  const [health, python] = await Promise.all([
    adapter.healthCheck(),
    detectPython()
  ])
  return {
    available: health.available,
    bridge: health.detail,
    python: {
      path: python.python,
      version: python.pythonVersion,
      ready: python.ready,
      issues: python.issues
    },
    setupGuide: python.ready ? null : getPythonGuide(python)
  }
}
```

The merged return shape: `{ available, bridge, python: { path, version, ready, issues }, setupGuide }`.

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/__tests__/python-bootstrap.test.js
```

Expected: 3 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add electron/services/pythonBootstrap.js electron/__tests__/python-bootstrap.test.js electron/services/browserUse/index.js
git commit -m "feat: add Python/uv detection and guided setup for browser-use"
```

---

## Task 5: End-to-end acceptance smoke test (~30 min)

Write and run a comprehensive Phase E smoke test covering all 4 phases of work.

- [ ] **Step 1: Write the smoke test**

File: `scripts/smoke-phase-e.js`

```js
// Phase E acceptance smoke test
// Tests the full AionUi stack: agent loop, tools, bridges, persistence
// Usage: node scripts/smoke-phase-e.js

const path = require('path')
const fs = require('fs')
const os = require('os')

// Mock Electron before any project module touches it
const mockElectron = {
  app: {
    getPath: (key) => {
      if (key === 'userData') return path.join(os.tmpdir(), 'aionui-smoke-e')
      return path.join(os.tmpdir(), 'aionui-smoke-e')
    },
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
  const { healthCheck: bHealth } = require('../electron/services/browserUse/adapter')
  results.push({ test: 'browser adapter loads', passed: typeof bHealth === 'function' })
  console.log(`[smoke:e]   browser adapter: ${typeof bHealth === 'function' ? 'PASS' : 'FAIL'}`)

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
  console.log(`[smoke:e]   conversation store: ${conv.id === 'smoke-test' ? 'PASS' : 'FAIL'}`)

  const retrieved = getConversation('smoke-test')
  results.push({ test: 'conversation store read', passed: retrieved !== null && retrieved.messages.length === 1 })
  console.log(`[smoke:e]   conversation read: ${retrieved !== null ? 'PASS' : 'FAIL'}`)

  deleteConversation('smoke-test')
  results.push({ test: 'conversation store delete', passed: getConversation('smoke-test') === null })
  console.log(`[smoke:e]   conversation delete: ${getConversation('smoke-test') === null ? 'PASS' : 'FAIL'}`)
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
```

- [ ] **Step 2: Run the smoke test**

```bash
node scripts/smoke-phase-e.js
```

Expected: 11 tests PASS.

- [ ] **Step 3: Run full test suite + client build**

```bash
npm test && cd client && npm run build
```

Expected: all tests pass, client build succeeds.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-phase-e.js docs/test-report.md
git commit -m "feat(smoke): add Phase E full-stack acceptance smoke test"
```

---

## Phase E Definition of Done

- [ ] No `midscene` references remain in any source file (`electron/`, `client/src/`, `scripts/`, `package.json`, `.gitignore`)
- [ ] No `MIDSCENE` constant in `actionTypes.js`
- [ ] No `midscene-bridge` in `package.json` workspaces or extraResources
- [ ] No `midscene-bridge` in `prepare-bridges.js`
- [ ] No `midscene_run/*` in `.gitignore`
- [ ] `docs/developer-guide.md` reflects agent-loop architecture
- [ ] `docs/security-policy.md` references `toolPolicy.js`, not `actionPolicy.js`
- [ ] `docs/runtime-setup.md` has no Midscene section, has browser-use guide
- [ ] `docs/USER_MANUAL.md` covers browser-use + desktop tools
- [ ] `docs/release-checklist.md` updated through Phase E
- [ ] `electron/services/conversationStore.js` provides SQLite-backed CRUD
- [ ] `electron/store.js` delegates conversation methods to conversationStore
- [ ] `electron/services/pythonBootstrap.js` detects Python 3.11+, uv, browser-use, playwright
- [ ] `electron/services/browserUse/index.js` integrates Python detection
- [ ] `scripts/smoke-phase-e.js` runs 11/11 tests
- [ ] All existing tests pass (37+ test files)
- [ ] `npm run build:client` passes
- [ ] Branch ready for merge

---

## Out of scope (post-V2)

- User login/authentication system
- Mac/Linux installer packaging
- Bundling Python into the Electron installer
- open-interpreter bridge retirement (still useful for shell/code execution)
- Skill file authoring (infrastructure exists, content not yet created)
- Real end-to-end browser-use test with Doubao vision key
- Real UI-TARS test with actual desktop
- Performance profiling and optimization
- Auto-update mechanism
