# Phase D: UI-TARS Desktop Tools + Old Code Retirement (2-3 days)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `desktop_observe`, `desktop_click`, `desktop_type` tools wrapping the existing UI-TARS bridge, then retire the legacy execute-mode pipeline (actionPlanner, visionPlanner, taskOrchestrator, actionBroker, actionPolicy, actions IPC, midscene service/bridge, old uiTars adapter).

**Architecture:** Three new tool handlers call a thin HTTP adapter (`electron/services/desktop/adapter.js`) that POSTs to uitars-bridge (127.0.0.1:8765) — same pattern as browserUse adapter in Phase C. Tool handlers are registered in the existing `tools/index.js` registry and picked up automatically by the agent loop. After the new tools work, all legacy execute-mode code is deleted: `actionPlanner.js`, `visionPlanner.js`, `taskOrchestrator.js`, `dryRunRuntime.js`, `actionBroker.js`, `actionPolicy.js`, `ipc/actions.js`, `services/midscene/`, `services/uiTars/`, `server/midscene-bridge/`, and their tests. References in `bridgeSupervisor.js`, `ipc/runtime.js`, `ipc/setupStatus.js`, `ipc/index.js`, and frontend components are cleaned up.

**Tech Stack:** Node.js (Electron main process), vitest, existing uitars-bridge Express server (port 8765), @ui-tars/sdk (already installed in server/uitars-bridge).

**Prerequisite:** Phase A (agent loop), Phase B (frontend wiring), Phase C (browser-use sidecar) complete.

---

## Reuse pact (MUST honor)

| | What |
|---|---|
| 1 | **Do NOT rewrite uitars-bridge.** The Express server at `server/uitars-bridge/` stays as-is. New tools call it over HTTP. |
| 2 | Use existing `tools/index.js#register()` — same pattern as `browserTask.js` in Phase C. |
| 3 | Use existing `electron/services/agentLoop.js` — no modifications. |
| 4 | Follow the existing bridge HTTP pattern: `GET /health`, `POST /execute`. |
| 5 | The new desktop adapter lives at `electron/services/desktop/adapter.js` — separate from the old `electron/services/uiTars/` which will be deleted. |
| 6 | Delete old code completely — no `// DEPRECATED` comments, no backwards-compat shims, no re-exports. |
| 7 | Do NOT touch SQLite, conversation persistence, or the chat frontend components. |
| 8 | uitars-bridge binds 127.0.0.1 only. |

---

## File plan

```
NEW
  electron/services/desktop/adapter.js        HTTP client for uitars-bridge (port 8765)
  electron/tools/desktopObserve.js            Tool handler: desktop_observe
  electron/tools/desktopClick.js              Tool handler: desktop_click
  electron/tools/desktopType.js               Tool handler: desktop_type
  electron/__tests__/desktop-adapter.test.js  Unit test: adapter HTTP + response parsing
  electron/__tests__/desktop-tools.test.js    Unit test: tool registration + validation
  scripts/smoke-desktop-tools.js              End-to-end smoke test

MODIFY
  electron/tools/index.js                     Register 3 desktop tools in loadBuiltins()
  electron/security/toolPolicy.js             Add desktop_observe/click/type risk entries

DELETE
  electron/services/actionPlanner.js          Legacy text planner
  electron/services/visionPlanner.js          Legacy vision planner
  electron/services/taskOrchestrator.js       Legacy orchestration hub
  electron/services/dryRunRuntime.js          Legacy dry-run mock
  electron/security/actionBroker.js           Legacy action broker
  electron/security/actionPolicy.js           Legacy action policy
  electron/ipc/actions.js                     Legacy actions IPC
  electron/services/midscene/                 Legacy midscene adapter (3 files)
  electron/services/uiTars/                   Legacy uiTars adapter (5 files)
  server/midscene-bridge/                     Legacy midscene bridge
  electron/__tests__/action-planner.test.js
  electron/__tests__/vision-planner.test.js
  electron/__tests__/task-orchestrator.test.js
  electron/__tests__/dry-run-runtime.test.js
  electron/__tests__/action-broker.test.js
  electron/__tests__/action-policy.test.js
  electron/__tests__/actions-ipc.test.js
  electron/__tests__/midscene-adapter.test.js
  electron/__tests__/midscene-bootstrap.test.js

MODIFY (cleanup references)
  electron/services/bridgeSupervisor.js        Remove midscene from DEFAULTS + buildEnv
  electron/ipc/index.js                        Remove actions module from MODULES array
  electron/ipc/runtime.js                      Remove midscene from runtimeStatus/bootstratpRuntime
  electron/ipc/setupStatus.js                  Remove midscene from computeSetupStatus + tiers
  client/src/components/WelcomeSetupDialog.jsx Remove midsceneExtension dependency
```

---

## Task 1: Create desktop adapter (~45 min)

A thin HTTP client for uitars-bridge, following the same pattern as `electron/services/browserUse/adapter.js`.

- [ ] **Step 1: Write the adapter**

File: `electron/services/desktop/adapter.js`

```js
const PORT = 8765

function endpoint() {
  return `http://127.0.0.1:${PORT}`
}

async function healthCheck() {
  try {
    const resp = await fetch(`${endpoint()}/health`, { signal: AbortSignal.timeout(3000) })
    const data = await resp.json()
    return { available: data.ok === true, detail: data }
  } catch {
    return { available: false, detail: { ok: false } }
  }
}

async function execute(action, context = {}) {
  const { type, payload = {} } = action

  try {
    const resp = await fetch(`${endpoint()}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        payload,
        approved: true,
        actionId: `desktop-${Date.now()}`,
        sessionId: context.sessionId || 'default',
      }),
      signal: context.signal,
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return { ok: false, error: { code: 'BRIDGE_ERROR', message: `UI-TARS bridge ${resp.status}: ${text.slice(0, 200)}` } }
    }

    const data = await resp.json()
    return {
      ok: data.ok !== false,
      exitCode: data.exitCode,
      stdout: data.stdout,
      stderr: data.stderr,
      metadata: data.metadata || {},
      durationMs: data.durationMs,
    }
  } catch (err) {
    if (context.signal?.aborted) {
      return { ok: false, error: { code: 'ABORTED', message: '桌面操作已取消。' } }
    }
    return { ok: false, error: { code: 'BRIDGE_UNREACHABLE', message: `UI-TARS bridge 不可达: ${err.message}` } }
  }
}

module.exports = { healthCheck, execute, endpoint, PORT }
```

- [ ] **Step 2: Write the unit test**

File: `electron/__tests__/desktop-adapter.test.js`

```js
import { test, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  vi.clearAllMocks()
})

const { healthCheck, execute } = require('../services/desktop/adapter')

test('healthCheck returns available when bridge responds ok', async () => {
  fetchMock.mockResolvedValueOnce({
    json: async () => ({ ok: true, runtime: 'ui-tars', agentReady: true }),
  })

  const result = await healthCheck()
  expect(result.available).toBe(true)
})

test('healthCheck returns unavailable on fetch error', async () => {
  fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))

  const result = await healthCheck()
  expect(result.available).toBe(false)
})

test('execute returns ok on successful bridge response', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      ok: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
      metadata: { screenshotBase64: 'abc123', mime: 'image/png' },
      durationMs: 500,
    }),
  })

  const result = await execute({ type: 'screen.observe', payload: {} })
  expect(result.ok).toBe(true)
  expect(result.metadata.screenshotBase64).toBe('abc123')
})

test('execute returns BRIDGE_UNREACHABLE on fetch error', async () => {
  fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))

  const result = await execute({ type: 'mouse.click', payload: { target: 'button' } })
  expect(result.ok).toBe(false)
  expect(result.error.code).toBe('BRIDGE_UNREACHABLE')
})
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run electron/__tests__/desktop-adapter.test.js
```
Expected: 4 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/services/desktop/adapter.js electron/__tests__/desktop-adapter.test.js
git commit -m "feat(desktop): create UI-TARS bridge HTTP adapter"
```

---

## Task 2: Create desktop_observe tool (~30 min)

Captures a screenshot via uitars-bridge.

- [ ] **Step 1: Write the tool handler**

File: `electron/tools/desktopObserve.js`

```js
const { register } = require('./index')
const { healthCheck, execute } = require('../services/desktop/adapter')

async function desktopObserve(args, context = {}) {
  const health = await healthCheck()
  if (!health.available) {
    return {
      error: {
        code: 'RUNTIME_UNAVAILABLE',
        message: 'UI-TARS 桌面运行时不可用。请确认 uitars-bridge (port 8765) 已启动并且 Doubao vision 模型已配置。',
        detail: health.detail,
      },
    }
  }

  const result = await execute(
    { type: 'screen.observe', payload: {} },
    { signal: context.signal, sessionId: context.sessionId }
  )

  if (!result.ok) {
    return { error: result.error || { code: 'OBSERVE_FAILED', message: '屏幕截图失败。' } }
  }

  return {
    screenshot_base64: result.metadata?.screenshotBase64 || '',
    mime: result.metadata?.mime || 'image/png',
    duration_ms: result.durationMs,
  }
}

register({
  name: 'desktop_observe',
  description: 'Capture a screenshot of the current desktop screen. Returns a base64-encoded PNG image. Use this to see what is currently on screen before clicking or typing.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
}, desktopObserve)

module.exports = { desktopObserve }
```

- [ ] **Step 2: Run the test file to confirm it loads**

```bash
node -e "require('./electron/tools/desktopObserve')" && echo "Module loads OK"
```
Expected: Module loads without error.

- [ ] **Step 3: Commit**

```bash
git add electron/tools/desktopObserve.js
git commit -m "feat(tool): add desktop_observe tool — screenshot capture via UI-TARS"
```

---

## Task 3: Create desktop_click tool (~30 min)

Performs a semantic click (natural-language target description) via uitars-bridge.

- [ ] **Step 1: Write the tool handler**

File: `electron/tools/desktopClick.js`

```js
const { register } = require('./index')
const { healthCheck, execute } = require('../services/desktop/adapter')
const { requestConfirm } = require('../confirm')

async function desktopClick(args, context = {}) {
  const { target } = args

  if (!target || typeof target !== 'string') {
    return { error: { code: 'INVALID_ARGS', message: '需要提供 target 参数（点击目标的自然语言描述）。' } }
  }

  // High-risk operation — confirm with user
  if (!context.skipInternalConfirm) {
    const allowed = await requestConfirm({
      kind: 'desktop-click',
      payload: { target },
    })
    if (!allowed) {
      return { error: { code: 'USER_CANCELLED', message: '用户已取消桌面点击操作。' } }
    }
  }

  const health = await healthCheck()
  if (!health.available) {
    return {
      error: {
        code: 'RUNTIME_UNAVAILABLE',
        message: 'UI-TARS 桌面运行时不可用。请确认 uitars-bridge (port 8765) 已启动。',
        detail: health.detail,
      },
    }
  }

  const result = await execute(
    { type: 'mouse.click', payload: { target } },
    { signal: context.signal, sessionId: context.sessionId }
  )

  if (!result.ok) {
    return { error: result.error || { code: 'CLICK_FAILED', message: '桌面点击失败。' } }
  }

  return {
    target,
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
    metadata: result.metadata,
  }
}

register({
  name: 'desktop_click',
  description: 'Click on a UI element on the desktop screen identified by a natural-language description. The AI vision model will locate the element and click it. Args: target (required) — natural-language description of what to click (e.g., "the blue Submit button in the bottom right", "the Chrome icon on the taskbar").',
  parameters: {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'Natural-language description of the element to click.' },
    },
    required: ['target'],
  },
}, desktopClick)

module.exports = { desktopClick }
```

- [ ] **Step 2: Verify module loads**

```bash
node -e "require('./electron/tools/desktopClick')" && echo "Module loads OK"
```

- [ ] **Step 3: Commit**

```bash
git add electron/tools/desktopClick.js
git commit -m "feat(tool): add desktop_click tool — semantic click via UI-TARS"
```

---

## Task 4: Create desktop_type tool (~30 min)

Types text at the current focus via uitars-bridge.

- [ ] **Step 1: Write the tool handler**

File: `electron/tools/desktopType.js`

```js
const { register } = require('./index')
const { healthCheck, execute } = require('../services/desktop/adapter')
const { requestConfirm } = require('../confirm')

async function desktopType(args, context = {}) {
  const { text } = args

  if (!text || typeof text !== 'string') {
    return { error: { code: 'INVALID_ARGS', message: '需要提供 text 参数（要输入的文本）。' } }
  }

  // Medium-risk operation — confirm with user
  if (!context.skipInternalConfirm) {
    const allowed = await requestConfirm({
      kind: 'desktop-type',
      payload: { text },
    })
    if (!allowed) {
      return { error: { code: 'USER_CANCELLED', message: '用户已取消桌面输入操作。' } }
    }
  }

  const health = await healthCheck()
  if (!health.available) {
    return {
      error: {
        code: 'RUNTIME_UNAVAILABLE',
        message: 'UI-TARS 桌面运行时不可用。请确认 uitars-bridge (port 8765) 已启动。',
        detail: health.detail,
      },
    }
  }

  const result = await execute(
    { type: 'keyboard.type', payload: { text } },
    { signal: context.signal, sessionId: context.sessionId }
  )

  if (!result.ok) {
    return { error: result.error || { code: 'TYPE_FAILED', message: '桌面输入失败。' } }
  }

  return {
    text,
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
    metadata: result.metadata,
  }
}

register({
  name: 'desktop_type',
  description: 'Type text at the current keyboard focus on the desktop. Use this after clicking into a text field to input content. Args: text (required) — the exact text to type.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The exact text to type at the current focus.' },
    },
    required: ['text'],
  },
}, desktopType)

module.exports = { desktopType }
```

- [ ] **Step 2: Verify module loads**

```bash
node -e "require('./electron/tools/desktopType')" && echo "Module loads OK"
```

- [ ] **Step 3: Commit**

```bash
git add electron/tools/desktopType.js
git commit -m "feat(tool): add desktop_type tool — keyboard input via UI-TARS"
```

---

## Task 5: Register desktop tools + update policy (~45 min)

- [ ] **Step 1: Register in tools/index.js**

In `electron/tools/index.js`, add to `loadBuiltins()` after `require('./browserTask')`:

```js
require('./desktopObserve')
require('./desktopClick')
require('./desktopType')
```

- [ ] **Step 2: Add policy entries**

In `electron/security/toolPolicy.js`, add in the `evaluateToolCall()` switch (after `browser_task`):

```js
case 'desktop_observe':
  return { risk: RISK_LEVELS.LOW, reason: '桌面截图（只读）。' }

case 'desktop_click':
  return { risk: RISK_LEVELS.HIGH, reason: '桌面点击会操作真实应用程序。' }

case 'desktop_type':
  return { risk: RISK_LEVELS.MEDIUM, reason: '桌面输入会在当前焦点处输入文本。' }
```

Note: `evaluateToolCallWithMeta` wrapper auto-derives `allowed` and `requiresApproval` from risk level. LOW → no approval. MEDIUM → approval. HIGH → approval.

- [ ] **Step 3: Write combined unit test**

File: `electron/__tests__/desktop-tools.test.js`

```js
import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const { healthCheckMock, executeMock } = vi.hoisted(() => ({
  healthCheckMock: vi.fn(async () => ({ available: true, detail: { ok: true } })),
  executeMock: vi.fn(async () => ({ ok: true, exitCode: 0, metadata: {}, durationMs: 100 })),
}))

vi.mock('../services/desktop/adapter', () => ({
  healthCheck: healthCheckMock,
  execute: executeMock,
}))

const { TOOL_SCHEMAS } = require('../tools')
const toolPolicy = require('../security/toolPolicy')

test('desktop_observe is registered', () => {
  const schema = TOOL_SCHEMAS.find(s => s.name === 'desktop_observe')
  expect(schema).toBeDefined()
})

test('desktop_click is registered', () => {
  const schema = TOOL_SCHEMAS.find(s => s.name === 'desktop_click')
  expect(schema).toBeDefined()
  expect(schema.parameters.required).toContain('target')
})

test('desktop_type is registered', () => {
  const schema = TOOL_SCHEMAS.find(s => s.name === 'desktop_type')
  expect(schema).toBeDefined()
  expect(schema.parameters.required).toContain('text')
})

test('desktop_observe policy is LOW risk (no approval)', () => {
  const d = toolPolicy.evaluateToolCall('desktop_observe', {})
  expect(d.risk).toBe('low')
  expect(d.requiresApproval).toBe(false)
})

test('desktop_click policy is HIGH risk (requires approval)', () => {
  const d = toolPolicy.evaluateToolCall('desktop_click', { target: 'test' })
  expect(d.risk).toBe('high')
  expect(d.requiresApproval).toBe(true)
})

test('desktop_type policy is MEDIUM risk (requires approval)', () => {
  const d = toolPolicy.evaluateToolCall('desktop_type', { text: 'hello' })
  expect(d.risk).toBe('medium')
  expect(d.requiresApproval).toBe(true)
})

test('desktop_click rejects empty target', async () => {
  const { desktopClick } = require('../tools/desktopClick')
  const result = await desktopClick({}, { skipInternalConfirm: true })
  expect(result.error).toBeDefined()
  expect(result.error.code).toBe('INVALID_ARGS')
})

test('desktop_observe returns screenshot on success', async () => {
  const { desktopObserve } = require('../tools/desktopObserve')
  const result = await desktopObserve({}, { skipInternalConfirm: true })
  expect(result.screenshot_base64).toBe('')
  expect(result.mime).toBe('image/png')
  expect(result.duration_ms).toBe(100)
})

test('desktop_type rejects empty text', async () => {
  const { desktopType } = require('../tools/desktopType')
  const result = await desktopType({}, { skipInternalConfirm: true })
  expect(result.error).toBeDefined()
  expect(result.error.code).toBe('INVALID_ARGS')
})
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/__tests__/desktop-tools.test.js
```
Expected: 9 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```
Expected: all existing tests + new desktop tests pass.

- [ ] **Step 6: Commit**

```bash
git add electron/tools/index.js electron/security/toolPolicy.js electron/__tests__/desktop-tools.test.js
git commit -m "feat(tool): register desktop_observe/click/type tools with risk policy"
```

---

## Task 6: Retire midscene (~1 hour)

Remove midscene service, bridge, and all references.

- [ ] **Step 1: Delete midscene files**

```bash
rm -rf electron/services/midscene
rm -rf server/midscene-bridge
rm -f electron/__tests__/midscene-adapter.test.js
rm -f electron/__tests__/midscene-bootstrap.test.js
```

- [ ] **Step 2: Remove midscene from bridgeSupervisor.js**

In `electron/services/bridgeSupervisor.js`:
- Remove `midscene: { name: 'midscene-bridge', port: 8770, dir: 'server/midscene-bridge' }` from DEFAULTS
- Remove the `if (key === 'midscene')` block (lines 52-64) from `buildEnv()`

- [ ] **Step 3: Remove midscene from ipc/index.js**

In `electron/ipc/index.js`:
- Remove `'actions'` from the MODULES array (line — the entire actions IPC module will be deleted in Task 7)

- [ ] **Step 4: Remove midscene from ipc/runtime.js**

In `electron/ipc/runtime.js`:
- Delete line 9: `const midsceneBootstrap = require('../services/midscene/bootstrap')`
- In `runtimeStatus()` (line 20): remove the midscene detect call and its result entry
- In `bootstrapRuntime()` (line 28): remove the midscene branch

- [ ] **Step 5: Remove midscene from ipc/setupStatus.js**

In `electron/ipc/setupStatus.js`:
- Delete line 2: `const midsceneBootstrap = require('../services/midscene/bootstrap')`
- In `computeSetupStatus()` (line 14-18): remove `ms` alias and its detect call
- Remove `midsceneExtension` from tier requirements (lines 42, 47) and `helpLinks` (line 59)
- Restructure tiers: the "Browser automation" tier no longer needs `midsceneExtension` (browser-use replaced it)

- [ ] **Step 6: Remove midscene from frontend**

In `client/src/components/WelcomeSetupDialog.jsx`:
- Remove `midsceneExtension` from the setup dependencies list

- [ ] **Step 7: Run full test suite**

```bash
npm test
```
Expected: remaining tests pass. Deleted tests are gone.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore(retire): remove midscene service, bridge, and all references"
```

---

## Task 7: Retire legacy execution pipeline (~1 hour)

Remove actionPlanner, visionPlanner, taskOrchestrator, dryRunRuntime, actionBroker, actionPolicy, and actions IPC.

- [ ] **Step 1: Delete legacy service files**

```bash
rm -f electron/services/actionPlanner.js
rm -f electron/services/visionPlanner.js
rm -f electron/services/taskOrchestrator.js
rm -f electron/services/dryRunRuntime.js
```

- [ ] **Step 2: Delete legacy security files**

```bash
rm -f electron/security/actionBroker.js
rm -f electron/security/actionPolicy.js
```

- [ ] **Step 3: Delete legacy IPC**

```bash
rm -f electron/ipc/actions.js
```

- [ ] **Step 4: Delete legacy tests**

```bash
rm -f electron/__tests__/action-planner.test.js
rm -f electron/__tests__/vision-planner.test.js
rm -f electron/__tests__/task-orchestrator.test.js
rm -f electron/__tests__/dry-run-runtime.test.js
rm -f electron/__tests__/action-broker.test.js
rm -f electron/__tests__/action-policy.test.js
rm -f electron/__tests__/actions-ipc.test.js
```

- [ ] **Step 5: Clean ipc/index.js**

In `electron/ipc/index.js`:
- Remove `'actions'` from the MODULES array (if not already done in Task 6)

- [ ] **Step 6: Run full test suite**

```bash
npm test
```
Expected: all remaining tests pass. No references to deleted modules remain in any test.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(retire): remove legacy execution pipeline (planner, orchestrator, broker, actions IPC)"
```

---

## Task 8: Retire old uiTars adapter (~30 min)

The old `electron/services/uiTars/` adapter (used by actionBroker) is replaced by the new `electron/services/desktop/adapter.js`. Delete it.

- [ ] **Step 1: Delete old uiTars service**

```bash
rm -rf electron/services/uiTars
```

Check what references remain after Task 7 deletions. The old adapter was imported by:
- `electron/ipc/actions.js` — already deleted
- `electron/ipc/runtime.js` — check if uiTars references still exist

- [ ] **Step 2: Verify no broken references**

```bash
grep -r "services/uiTars" electron/ --include="*.js" || echo "No references remain"
grep -r "services/midscene" electron/ --include="*.js" || echo "No references remain"
```

Expected: No references found to either old adapter directory.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(retire): remove old uiTars adapter (replaced by services/desktop)"
```

---

## Task 9: Clean up frontend references (~30 min)

Remove remaining frontend references to deleted runtimes.

- [ ] **Step 1: Remove midsceneExtension from WelcomeSetupDialog**

In `client/src/components/WelcomeSetupDialog.jsx`:
- Remove `midsceneExtension` from setup requirement checks (if not already done in Task 6)

- [ ] **Step 2: Verify RuntimeCard doesn't reference midscene**

Check `client/src/components/runtime/RuntimeCard.jsx` — the `RUNTIME_LABELS` map already has no `midscene` entry (only qwen, deepseek, open-interpreter, ui-tars, aionui-dry-run). No change needed unless `midscene` is referenced elsewhere in the component.

- [ ] **Step 3: Verify no remaining frontend references**

```bash
grep -ri "midscene" client/src/ --include="*.jsx" --include="*.js" || echo "No midscene references remain"
```

- [ ] **Step 4: Run client build**

```bash
cd client && npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(frontend): remove midscene references from setup wizard"
```

---

## Task 10: End-to-end smoke test (~30 min)

- [ ] **Step 1: Write the smoke test**

File: `scripts/smoke-desktop-tools.js`

```js
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
```

- [ ] **Step 2: Run the smoke test**

```bash
node scripts/smoke-desktop-tools.js
```
Expected: all 8 tests PASS.

- [ ] **Step 3: Run full test suite + client build**

```bash
npm test && cd client && npm run build
```
Expected: all tests pass, client build succeeds, no warnings about deleted modules.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-desktop-tools.js docs/test-report.md
git commit -m "feat(smoke): add Phase D desktop tools integration smoke test"
```

---

## Phase D Definition of Done

- [ ] `electron/services/desktop/adapter.js` calls uitars-bridge over HTTP (port 8765)
- [ ] `desktop_observe` tool registered — captures screenshots (LOW risk, no approval)
- [ ] `desktop_click` tool registered — semantic click with user confirmation (HIGH risk)
- [ ] `desktop_type` tool registered — keyboard input (MEDIUM risk)
- [ ] All 3 desktop tools visible in `getAgentLoopToolSchemas()` output
- [ ] `toolPolicy` entries for all 3 tools with correct risk levels
- [ ] `electron/services/midscene/` deleted
- [ ] `server/midscene-bridge/` deleted
- [ ] `electron/services/actionPlanner.js` deleted
- [ ] `electron/services/visionPlanner.js` deleted
- [ ] `electron/services/taskOrchestrator.js` deleted
- [ ] `electron/services/dryRunRuntime.js` deleted
- [ ] `electron/security/actionBroker.js` deleted
- [ ] `electron/security/actionPolicy.js` deleted
- [ ] `electron/ipc/actions.js` deleted
- [ ] `electron/services/uiTars/` deleted (replaced by `services/desktop/`)
- [ ] All 9 legacy test files deleted
- [ ] No references to `midscene`, `actionPlanner`, `visionPlanner`, `taskOrchestrator`, `actionBroker` remain in `electron/`
- [ ] `bridgeSupervisor.js` has no midscene entry
- [ ] `ipc/index.js` MODULES has no `'actions'` entry
- [ ] `ipc/runtime.js` has no midscene references
- [ ] `ipc/setupStatus.js` has no midscene references
- [ ] Frontend has no midscene references
- [ ] All remaining tests pass
- [ ] `npm run build:client` passes
- [ ] Smoke test: 8/8 pass
- [ ] Branch ready for Phase E (acceptance testing)

---

## Out of scope (Phase E)

- Acceptance testing with real UI-TARS bridge + Doubao vision key
- open-interpreter retirement (oi-bridge may still be useful for code execution)
- SQLite conversation persistence
- Skill registry improvements
- Login-state preservation
- uv-based Python bootstrap
- Shipping Python in Electron installer
