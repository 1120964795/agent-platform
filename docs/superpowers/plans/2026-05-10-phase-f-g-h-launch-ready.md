# Phase F/G/H — AionUi Launch-Ready Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AionUi runnable end-to-end: cleanup legacy code, add settings UI for API keys, validate packaging, polish UX.

**Architecture:** Three sequential phases. Phase F removes Open Interpreter legacy and updates settings. Phase G validates packaging and rewrites the welcome wizard. Phase H adds bridge status indicators, restart backoff, and first-run flow.

**Tech Stack:** Electron + React/Vite/Tailwind (client/), Node.js + Python bridges, SQLite, shell scripting.

---

## Phase F: Cleanup + Settings Page

### Task F1: Remove Open Interpreter directories and files

**Files:**
- Remove: `electron/services/openInterpreter/` (5 files: adapter.js, bootstrap.js, patchManifest.js, processManager.js, protocol.js)
- Remove: `server/oi-bridge/` (entire directory)
- Remove: `electron/services/models/deepseekProvider.js`
- Remove tests: `electron/__tests__/open-interpreter-adapter.test.js`, `electron/__tests__/open-interpreter-bootstrap.test.js`

- [ ] **Step 1: Remove the directories and files**

```bash
rm -rf electron/services/openInterpreter server/oi-bridge electron/services/models/deepseekProvider.js
rm -f electron/__tests__/open-interpreter-adapter.test.js electron/__tests__/open-interpreter-bootstrap.test.js
```

- [ ] **Step 2: Update package.json — remove oi-bridge from workspaces and extraResources**

In `package.json`:
- Line 7 workspaces array: remove `"server/oi-bridge"`
- Lines 53-58 extraResources: replace `"dist-bridges/oi-bridge"` with `"dist-bridges/browser-use-bridge"`
- After these changes, regenerate package-lock.json: `npm install --package-lock-only`

- [ ] **Step 3: Update scripts/prepare-bridges.js**

Change line 6: `const BRIDGES = ['oi-bridge', 'uitars-bridge']` → `const BRIDGES = ['uitars-bridge']`

- [ ] **Step 4: Run full test suite to measure baseline breakage**

Run: `npx vitest run 2>&1 | tail -15`
Expected: Many failures from files that still require the removed modules. This is expected — remaining tasks will fix them.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove Open Interpreter and oi-bridge legacy code"
```

---

### Task F2: Update modelRouter.js — use deepseek.js directly

**Files:**
- Modify: `electron/services/modelRouter.js:1-76`

- [ ] **Step 1: Replace deepseekProvider require with deepseek.js**

Change line 1: `const deepseekProvider = require('./models/deepseekProvider')` → `const deepseek = require('./deepseek')`

- [ ] **Step 2: Fix getProviderForRole to return deepseek directly**

Change line 50:
```js
if (selected.provider === MODEL_PROVIDERS.DEEPSEEK) return { selected, provider: deepseekProvider }
```
→
```js
if (selected.provider === MODEL_PROVIDERS.DEEPSEEK) return { selected, provider: deepseek }
```

- [ ] **Step 3: Run model-router tests**

Run: `npx vitest run electron/__tests__/model-router.test.js`
Expected: PASS (or fix assertions if they reference deepseekProvider)

- [ ] **Step 4: Commit**

```bash
git add electron/services/modelRouter.js
git commit -m "fix: wire modelRouter directly to deepseek.js, remove deepseekProvider wrapper"
```

---

### Task F3: Update bridgeSupervisor.js — remove oi from DEFAULTS

**Files:**
- Modify: `electron/services/bridgeSupervisor.js:7-11`

- [ ] **Step 1: Remove oi entry from DEFAULTS**

Change lines 7-11:
```js
const DEFAULTS = {
  oi: { name: 'oi-bridge', port: 8756, dir: 'server/oi-bridge' },
  uitars: { name: 'uitars-bridge', port: 8765, dir: 'server/uitars-bridge' },
  browserUse: { name: 'browser-use-bridge', port: 8780, dir: 'server/browser-use-bridge', runtime: 'python' }
}
```
→
```js
const DEFAULTS = {
  uitars: { name: 'uitars-bridge', port: 8765, dir: 'server/uitars-bridge' },
  browserUse: { name: 'browser-use-bridge', port: 8780, dir: 'server/browser-use-bridge', runtime: 'python' }
}
```

- [ ] **Step 2: Run bridge supervisor tests**

Run: `npx vitest run electron/__tests__/ --grep -i "bridge" 2>&1`
Expected: Any existing bridge supervisor tests pass.

- [ ] **Step 3: Commit**

```bash
git add electron/services/bridgeSupervisor.js
git commit -m "fix: remove oi-bridge from bridge supervisor DEFAULTS"
```

---

### Task F4: Update store.js — remove OI fields, fix doubao defaults, fix getMaskedConfig

**Files:**
- Modify: `electron/store.js:41-43,44-48,122-131`

- [ ] **Step 1: Remove OI config fields from DEFAULT_CONFIG**

Remove lines 44-49 (6 fields total):
```js
  openInterpreterCommand: '',
  openInterpreterEndpoint: '',
  uiTarsEndpoint: '',
  uiTarsModelEndpoint: '',
  uiTarsCommand: '',
  uiTarsScreenAuthorized: false,
```
Note: `uiTarsModelEndpoint` is included — it is an orphaned field managed by bridgeSupervisor now and must be removed to prevent stale config values.

- [ ] **Step 2: Fix doubaoVisionModel default**

Change line 43: `doubaoVisionModel: 'doubao-1-5-thinking-vision-pro-250428'` → `doubaoVisionModel: 'doubao-seed-1-6-vision-250815'`

- [ ] **Step 3: Fix getMaskedConfig — mask doubaoVisionApiKey**

In lines 122-131, add to the returned object:
```js
doubaoVisionApiKey: mask(config.doubaoVisionApiKey || ''),
```

- [ ] **Step 4: Fix sanitizeConfigPatch in electron/ipc/config.js**

In `electron/ipc/config.js`, remove lines 16-20 (openInterpreter and uiTars fields):
```js
// Remove these lines:
if (typeof input.openInterpreterCommand === 'string') patch.openInterpreterCommand = input.openInterpreterCommand.trim()
if (typeof input.openInterpreterEndpoint === 'string') patch.openInterpreterEndpoint = input.openInterpreterEndpoint.trim()
if (typeof input.uiTarsEndpoint === 'string') patch.uiTarsEndpoint = input.uiTarsEndpoint.trim()
if (typeof input.uiTarsCommand === 'string') patch.uiTarsCommand = input.uiTarsCommand.trim()
if (typeof input.uiTarsScreenAuthorized === 'boolean') patch.uiTarsScreenAuthorized = input.uiTarsScreenAuthorized
```

Add after line 15 (after deepseekBaseUrl):
```js
if (typeof input.doubaoVisionApiKey === 'string' && input.doubaoVisionApiKey && !input.doubaoVisionApiKey.includes('***')) patch.doubaoVisionApiKey = input.doubaoVisionApiKey.trim()
if (typeof input.doubaoVisionEndpoint === 'string' && input.doubaoVisionEndpoint) patch.doubaoVisionEndpoint = input.doubaoVisionEndpoint.trim()
if (typeof input.doubaoVisionModel === 'string' && input.doubaoVisionModel) patch.doubaoVisionModel = input.doubaoVisionModel.trim()
```

- [ ] **Step 5: Run store and config tests**

Run: `npx vitest run electron/__tests__/store.test.js electron/__tests__/ --grep -i "config" 2>&1 | tail -15`
Expected: Tests pass or update assertions that reference removed fields.

- [ ] **Step 6: Commit**

```bash
git add electron/store.js electron/ipc/config.js
git commit -m "fix: remove OI config fields, fix doubao defaults, mask doubaoVisionApiKey, add doubao to sanitizer"
```

---

### Task F5: Update runtime.js, setupStatus.js, actionTypes.js

**Files:**
- Modify: `electron/ipc/runtime.js:1-62`
- Modify: `electron/ipc/setupStatus.js:1-81`
- Modify: `electron/security/actionTypes.js:1-75`

- [ ] **Step 1: Update runtime.js — remove openInterpreter + deepseekProvider references**

In `electron/ipc/runtime.js`:
- Change line 4: `const deepseekProvider = require('../services/models/deepseekProvider')` → `const deepseek = require('../services/deepseek')`
- Remove lines 5-6 (oiBootstrap, oiProcess requires)
- Remove lines 7-8 (tarsBootstrap, tarsProcess requires): also remove — UI-TARS is now managed by bridgeSupervisor
- Change line 16 (deepseekProvider.getStatus → deepseek): replace the `{ runtime: 'deepseek', ... }` entry with:
```js
{ runtime: 'deepseek', state: deepseek.ready() ? 'ready' : 'not-configured', configured: deepseek.ready() },
```
- Remove line 17 (`await oiProcess.status(config)`)
- Remove line 18 (`await tarsProcess.status(config)`)
- Remove line 24 (open-interpreter bootstrap case)
- Remove line 25 (ui-tars bootstrap case)
- Remove lines 47-48 (open-interpreter start/stop cases)
- Remove lines 54-55 (ui-tars start/stop cases)
- Add bridge status entries to `runtimeStatus()`:
```js
{ runtime: 'browser-use', state: 'managed-by-supervisor', configured: Boolean(config.doubaoVisionApiKey) },
{ runtime: 'ui-tars', state: 'managed-by-supervisor', configured: Boolean(config.doubaoVisionApiKey) },
```
Note: Verify that `deepseek.js` exports a `ready()` function. If it doesn't, check `deepseek.js` line 82 (which returns `'尚未配置 API Key。'`) and add a simple `ready()` check based on config.

- [ ] **Step 2: Update setupStatus.js — remove OI bootstrap, restructure**

In `electron/ipc/setupStatus.js`:
- Remove line 2 (`const oiBootstrap = require(...)`)
- Remove line 3 (`const uiTarsBootstrap = require(...)`)
- Remove KEY_FIELD_MAP entries referencing removed fields
- Restructure `computeSetupStatus()`:
  - Remove `oi.detect(cfg)` and `ut.detect(cfg)` calls
  - Remove `pythonOpenInterpreter` from deps
  - Remove `screenAuthorized` from deps
  - Update tiers: `browser` requires `doubaoKey` (not qwenKey); `full` requires `doubaoKey`
  - Remove `setup:set-screen-authorized` handler

New `computeSetupStatus()`:
```js
let pythonBootstrap, supervisor; // injected via setter (setBridgeSupervisor)

async function computeSetupStatus({ storeRef = store } = {}) {
  const cfg = storeRef.getConfig()
  const deps = {
    deepseekKey: Boolean(cfg.deepseekApiKey),
    doubaoKey: Boolean(cfg.doubaoVisionApiKey),
  }

  // Check Python/bridge health (non-blocking — errors degrade to "not-detected")
  try {
    if (pythonBootstrap) {
      const pyResult = await pythonBootstrap.detect()
      deps.python = pyResult.available
      deps.browserUse = pyResult.browserUseInstalled
      deps.playwright = pyResult.playwrightInstalled
    }
  } catch { deps.python = false }

  try {
    if (supervisor) {
      const bridgeState = supervisor.getState()
      deps.bridgesRunning = Object.values(bridgeState).every(b => b.state === 'running')
    }
  } catch { deps.bridgesRunning = false }

  const tiers = {
    lite: {
      label: 'Lite: chat only',
      requires: ['deepseekKey'],
      ready: deps.deepseekKey
    },
    browser: {
      label: 'Browser + Desktop automation',
      requires: ['deepseekKey', 'doubaoKey'],
      ready: deps.deepseekKey && deps.doubaoKey && deps.python !== false,
      recommended: true
    },
  }
  return { deps, tiers, helpLinks: { /* ... same as before */ } }
}
```
Note: `pythonBootstrap` and `supervisor` are injected via a new `setBridgeContext({ pythonBootstrap, supervisor })` function exported from this module and called from `main.js` after bridge supervisor creation. This avoids circular dependency issues.

Update `register()`: remove `setup:set-screen-authorized` handler.

- [ ] **Step 3: Update actionTypes.js — remove OPEN_INTERPRETER**

In `electron/security/actionTypes.js` line 4: Remove `OPEN_INTERPRETER: 'open-interpreter'` from RUNTIME_NAMES.

- [ ] **Step 4: Run affected tests**

Run: `npx vitest run electron/__tests__/setup-status-ipc.test.js electron/__tests__/ --grep -i "runtime" 2>&1 | tail -15`
Expected: Tests may fail due to removed fields. Update test assertions to match new structure.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/runtime.js electron/ipc/setupStatus.js electron/security/actionTypes.js
git commit -m "fix: remove OI/UI-TARS refs from runtime, setupStatus, actionTypes; add bridge supervisor managed entries"
```

---

### Task F6: Update remaining test files

**Files:**
- Modify: `electron/__tests__/store.test.js`, `electron/__tests__/chat.test.js`, `electron/__tests__/agent-loop.test.js`, `electron/__tests__/model-router.test.js`, `electron/__tests__/openExternal-ipc.test.js`, `electron/__tests__/setup-status-ipc.test.js`, `electron/__tests__/packaging.test.js`, `electron/__tests__/preload.test.js`

- [ ] **Step 1: Fix all test imports and assertions that reference removed modules**

For each test file:
- `store.test.js` — remove assertions about openInterpreterCommand, openInterpreterEndpoint, etc.
- `chat.test.js` — remove OI agent path tests (keep deepseek path tests)
- `agent-loop.test.js` — remove OI tool assertions
- Verify `electron/services/agentLoop.js` — check for and remove any openInterpreter tool mapping if present
- `model-router.test.js` — update to reference deepseek directly (not deepseekProvider)
- `openExternal-ipc.test.js` — remove openInterpreter URL entries
- `setup-status-ipc.test.js` — update to new 2-tier structure (lite + browser)
- `packaging.test.js` — update README assertions to not reference DeepSeek ownership
- `preload.test.js` — remove OI channel entries

- [ ] **Step 2: Run full test suite to verify all pass**

Run: `npm test`
Expected: All 230+ tests pass (slight decrease from 235 due to removed OI test files, offset by new tests added later).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: update tests for OI removal, fix assertions for new config structure"
```

---

### Task F7: Settings panel — add Doubao vision fields

**Files:**
- Modify: `client/src/panels/SettingsPanel.jsx:7-25,42-65,75-77,115-131`

- [ ] **Step 1: Remove OI/uiTars fields from DEFAULT_FORM and add doubao fields**

In `SettingsPanel.jsx` DEFAULT_FORM, remove these 6 fields:
```js
openInterpreterEndpoint: '',
openInterpreterCommand: '',
uiTarsEndpoint: '',
uiTarsModelEndpoint: '',
uiTarsCommand: '',
uiTarsScreenAuthorized: false,
```

Then add doubao fields to DEFAULT_FORM:
```js
doubaoVisionApiKey: '',
doubaoVisionEndpoint: 'https://ark.cn-beijing.volces.com/api/v3',
doubaoVisionModel: 'doubao-seed-1-6-vision-250815',
```

- [ ] **Step 2: Apply key-masking pattern for doubao fields**

In `loadConfig()` (lines 42-65):
- Line 50: Add `doubaoVisionApiKey: config.doubaoVisionApiKey` to setMasked
- Lines 53-55: Add `doubaoVisionApiKey: ''` to form reset (clear from form, show masked)
- In `handleSave()` (lines 71-91):
  - Line 76: Add `if (!next.doubaoVisionApiKey) delete next.doubaoVisionApiKey`
  - Line 80: Add `doubaoVisionApiKey: result.config?.doubaoVisionApiKey` to setMasked
  - Line 81: Add `doubaoVisionApiKey: ''` to patch (clear after save)

- [ ] **Step 3: Add Doubao UI section to models tab**

In the models tab (lines 115-131), add BEFORE the Qwen section:
```jsx
<div className="space-y-3">
  <h2 className="text-lg font-semibold">Doubao Vision (browser + desktop automation)</h2>
  <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">API Key
    <input type="password" value={form.doubaoVisionApiKey}
      onChange={(event) => patch({ doubaoVisionApiKey: event.target.value })}
      placeholder={masked.doubaoVisionApiKey || 'Volcengine Ark API Key'}
      className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" />
  </label>
  <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">Endpoint
    <input value={form.doubaoVisionEndpoint}
      onChange={(event) => patch({ doubaoVisionEndpoint: event.target.value })}
      className="w-full rounded-md border ..." />
  </label>
  <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">Model Name
    <input value={form.doubaoVisionModel}
      onChange={(event) => patch({ doubaoVisionModel: event.target.value })}
      className="w-full rounded-md border ..." />
  </label>
</div>
<div className="border-t border-[color:var(--border)] pt-4 space-y-3">
  <h2 className="text-lg font-semibold">Qwen 配置</h2>
  {/* existing Qwen fields */}
</div>
```

- [ ] **Step 4: Run client build to verify JSX compiles**

Run: `cd client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds without JSX errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/panels/SettingsPanel.jsx
git commit -m "feat: add Doubao vision configuration to SettingsPanel models tab"
```

---

### Task F8: Settings panel — rewrite runtimes tab with bridge status

**Files:**
- Modify: `client/src/panels/SettingsPanel.jsx:134-143`
- Create: `client/src/lib/api.js` (add `getBridgeStatus`, `restartBridge` if not present)

- [ ] **Step 1: Replace runtimes tab content**

Replace lines 134-143 (the entire "运行时" section) with bridge status display:
```jsx
{tab === 'runtimes' && (
  <BridgeStatusPanel />
)}
```

- [ ] **Step 2: Create BridgeStatusPanel component inline or as separate component**

```jsx
function BridgeStatusPanel() {
  const [bridges, setBridges] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    async function poll() {
      try {
        const result = await window.electronAPI?.invoke('bridge:status')
        if (active && result?.bridges) setBridges(result.bridges)
      } catch {}
    }
    poll()
    const timer = setInterval(poll, 5000)
    return () => { active = false; clearInterval(timer) }
  }, [])

  async function restart(key) {
    setLoading(true)
    try {
      await window.electronAPI?.invoke('bridge:restart', { key })
    } finally { setLoading(false) }
  }

  const entries = [
    { key: 'browserUse', label: 'Browser-Use (浏览器自动化)', port: 8780, runtime: 'Python' },
    { key: 'uitars', label: 'UI-TARS (桌面控制)', port: 8765, runtime: 'Node.js' },
  ]

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Bridge 状态</h2>
      {entries.map(({ key, label, port, runtime }) => {
        const b = bridges[key] || {}
        const running = b.state === 'running'
        const failed = b.state === 'failed'
        const color = running ? 'text-[color:var(--success)]' : failed ? 'text-red-500' : 'text-amber-500'
        const stateText = running ? 'Running' : failed ? 'Failed' : b.state || 'Unknown'
        return (
          <div key={key} className="rounded-md border border-[color:var(--border)] p-3">
            <div className="flex items-center justify-between">
              <div>
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${running ? 'bg-[color:var(--success)]' : failed ? 'bg-red-500' : 'bg-amber-500'}`} />
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-[color:var(--text-muted)] ml-2">{runtime} | port {port}</span>
              </div>
              <span className={`text-xs ${color}`}>{stateText}</span>
            </div>
            {failed && b.lastError && (
              <div className="mt-2 text-xs text-red-500">{b.lastError}</div>
            )}
            {failed && (
              <button type="button" onClick={() => restart(key)} disabled={loading}
                className="mt-2 h-7 rounded-md border border-[color:var(--border)] px-3 text-xs hover:bg-[color:var(--bg-tertiary)]">
                重新启动
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Run client build to verify**

Run: `cd client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/src/panels/SettingsPanel.jsx
git commit -m "feat: replace runtimes tab with bridge status display + restart"
```

---

### Task F9: Create bridgeStatus IPC handler + wire in main.js

**Files:**
- Create: `electron/ipc/bridgeStatus.js`
- Modify: `electron/main.js:4-5,79-83`

- [ ] **Step 1: Create bridgeStatus.js**

```js
let supervisor = null

function setSupervisor(sup) { supervisor = sup }

function register(ipcMain) {
  ipcMain.handle('bridge:status', async () => {
    if (!supervisor) return { bridges: {} }
    const state = supervisor.getState()
    const bridges = {}
    for (const [key, s] of Object.entries(state)) {
      bridges[key] = {
        state: s.state,
        ready: s.ready,
        lastError: s.lastError || null,
        restarts: s.restarts || 0,
      }
    }
    return { bridges }
  })

  ipcMain.handle('bridge:restart', async (_event, { key } = {}) => {
    if (!supervisor) return { ok: false }
    try {
      const result = await supervisor.startOne(key)
      return { ok: true, state: result.state }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })
}

module.exports = { register, setSupervisor }
```

- [ ] **Step 2: Add lastError tracking, EventEmitter, and startOne export to bridgeSupervisor.js**

In `bridgeSupervisor.js`:
- Add `const EventEmitter = require('events')` at top
- Create `const emitter = new EventEmitter()` and export it
- Add `state[key].lastError = null` to each bridge's initial state
- In `startOne()`, on failure: set `state[key].lastError = error.message`, call `emitter.emit('change', { key, state: state[key] })`
- In `startOne()`, on success: set `state[key].lastError = null`, call `emitter.emit('change', { key, state: state[key] })`
- Export `startOne` directly in returned object:
```js
return { start, stop, startOne, getState: snapshot, events: emitter }
```

- [ ] **Step 3: Register bridgeStatus in ipc/index.js and wire in main.js**

In `electron/ipc/index.js`:
- Add `const bridgeStatus = require('./bridgeStatus')` to the top
- Add `bridgeStatus` to the `MODULES` array (this is what `registerAll(ipcMain)` iterates over)

In `electron/main.js`:
- Line 5: Add `const { setSupervisor } = require('./ipc/bridgeStatus')`
- After line 81 (`supervisor = createSupervisor()`): Add `setSupervisor(supervisor)`

- [ ] **Step 4: Run bridge supervisor tests + full test suite**

Run: `npx vitest run electron/__tests__/ --grep -i "bridge" 2>&1`
Run: `npm test 2>&1 | tail -10`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/bridgeStatus.js electron/services/bridgeSupervisor.js electron/main.js
git commit -m "feat: add bridgeStatus IPC handler with status polling and restart"
```

---

## Phase G: Packaging + Startup Flow

### Task G1: Update prepare-bridges.js for browser-use Python bridge

**Files:**
- Modify: `scripts/prepare-bridges.js:1-58`
- Modify: `package.json:53-58` (extraResources)

- [ ] **Step 1: Add Python bridge preparation to prepare-bridges.js**

After the existing Node.js bridge loop (after line 55), add:
```js
// Python bridge: copy source + install Python deps
const pySrc = path.join(SRC_ROOT, 'browser-use-bridge')
const pyFinal = path.join(STAGING_ROOT, 'browser-use-bridge')
if (fs.existsSync(pySrc)) {
  copyDir(pySrc, pyFinal, ['__tests__', '__pycache__', '.venv', 'venv'])
  // Install Python dependencies if pip is available
  const reqPath = path.join(pyFinal, 'requirements.txt')
  if (fs.existsSync(reqPath)) {
    try {
      run('pip', ['install', '-r', reqPath, '--target', path.join(pyFinal, '.deps')], pyFinal)
    } catch {
      process.stderr.write('[prepare-bridges] pip install failed — bridge may need manual dep setup\n')
    }
  }
} else {
  process.stderr.write(`[prepare-bridges] missing Python bridge source ${pySrc}\n`)
}
```

- [ ] **Step 2: Verify package.json extraResources**

In `package.json` `build.extraResources` array, ensure these entries exist alongside the existing `resources/skills` and `client/dist` entries:
```json
{ "from": "dist-bridges/uitars-bridge", "to": "server/uitars-bridge" },
{ "from": "dist-bridges/browser-use-bridge", "to": "server/browser-use-bridge" }
```
Note: The existing `dist-bridges/oi-bridge` entry (if present) was removed in Task F1 Step 2. Do NOT replace the entire extraResources array — only modify the bridge-specific entries.

- [ ] **Step 3: Test prepare-bridges script**

Run: `node scripts/prepare-bridges.js`
Expected: Both bridges copied to `dist-bridges/`.

- [ ] **Step 4: Commit**

```bash
git add scripts/prepare-bridges.js package.json
git commit -m "feat: add browser-use Python bridge to prepare-bridges and packaging"
```

---

### Task G2: Rewrite WelcomeSetupDialog to step-based flow

**Files:**
- Modify: `client/src/components/WelcomeSetupDialog.jsx` (full rewrite, ~279 lines)

- [ ] **Step 1: Write the new WelcomeSetupDialog**

Replace the entire file content with a 4-step wizard:

```jsx
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, X, Copy, ExternalLink } from 'lucide-react'

const STEPS = [
  { id: 'api-key', label: '配置 API Key' },
  { id: 'python', label: '检测运行环境' },
  { id: 'bridges', label: '启动 Bridge' },
  { id: 'ready', label: '一切就绪' },
]

export default function WelcomeSetupDialog({ onClose }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    doubaoVisionApiKey: '',
    doubaoVisionEndpoint: 'https://ark.cn-beijing.volces.com/api/v3',
    doubaoVisionModel: 'doubao-seed-1-6-vision-250815',
  })
  const [pythonStatus, setPythonStatus] = useState(null)
  const [bridgeStatus, setBridgeStatus] = useState(null)
  const [saving, setSaving] = useState(false)

  const invoke = useCallback((channel, payload) => {
    return window.electronAPI?.invoke(channel, payload)
  }, [])

  // Step 1: Save API key
  async function saveApiKey() {
    setSaving(true)
    try {
      await invoke('config:set', form)
      await invoke('setup:mark-welcome-shown')
      setStep(1)
    } catch (e) { /* show error */ }
    finally { setSaving(false) }
  }

  // Step 2: Detect Python
  async function detectPython() {
    try {
      const result = await invoke('setup:python-detect') // new IPC or use existing
      setPythonStatus(result)
    } catch { setPythonStatus({ error: 'Detection failed' }) }
    setStep(2)
  }

  // Step 3: Check bridges
  async function checkBridges() {
    try {
      const result = await invoke('bridge:status')
      setBridgeStatus(result?.bridges || {})
    } catch { setBridgeStatus({}) }
    setStep(3)
  }

  useEffect(() => {
    // Poll bridge status every 5s when on bridge step
    if (step === 2) {
      checkBridges()
      const timer = setInterval(checkBridges, 5000)
      return () => clearInterval(timer)
    }
  }, [step])

  const allBridgesRunning = bridgeStatus && Object.values(bridgeStatus).every(b => b.state === 'running')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-[color:var(--bg-primary)] p-6 shadow-2xl">
        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${i <= step ? 'bg-[color:var(--accent)] text-white' : 'bg-[color:var(--bg-tertiary)] text-[color:var(--text-muted)]'}`}>
                {i < step ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              <span className="text-xs text-[color:var(--text-muted)]">{s.label}</span>
              {i < STEPS.length - 1 && <div className="w-4 h-px bg-[color:var(--border)]" />}
            </div>
          ))}
        </div>

        {/* Step 0: API Key */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">配置 Doubao Vision API Key</h2>
            <p className="text-xs text-[color:var(--text-muted)]">用于浏览器自动化和桌面控制。在火山引擎控制台获取。</p>
            <input type="password" value={form.doubaoVisionApiKey}
              onChange={e => setForm(f => ({ ...f, doubaoVisionApiKey: e.target.value }))}
              placeholder="ark-..." className="w-full rounded-md border ..." />
            <div className="flex gap-2">
              <button onClick={() => { onClose?.() }} className="...">跳过</button>
              <button onClick={saveApiKey} disabled={saving || !form.doubaoVisionApiKey} className="...">
                {saving ? '保存中...' : '下一步'}
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Python detection */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">检测运行环境</h2>
            {/* Show pythonStatus results: Python path, browser-use, playwright */}
            <button onClick={detectPython} className="...">下一步</button>
          </div>
        )}

        {/* Step 2: Bridge status */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Bridge 状态</h2>
            {/* Show bridgeStatus: each bridge with running/failed state */}
            <button onClick={() => setStep(3)} disabled={!allBridgesRunning} className="...">下一步</button>
          </div>
        )}

        {/* Step 3: Ready */}
        {step === 3 && (
          <div className="space-y-4 text-center">
            <CheckCircle2 size={48} className="text-[color:var(--success)] mx-auto" />
            <h2 className="text-lg font-semibold">一切就绪</h2>
            <p className="text-xs text-[color:var(--text-muted)]">API Key 已配置，Bridge 运行正常。</p>
            <button onClick={onClose} className="...">开始使用</button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run client build to verify JSX compiles**

Run: `cd client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/WelcomeSetupDialog.jsx
git commit -m "feat: rewrite WelcomeSetupDialog as 4-step sequential wizard"
```

---

### Task G3: Validate Electron packaging

**Files:**
- Verify: `package.json` build configuration
- Check: `client/vite.config.js`

- [ ] **Step 1: Build client frontend**

Run: `npm run build:client 2>&1 | tail -5`
Expected: `client/dist/` produced.

- [ ] **Step 2: Build bridges for packaging**

Run: `npm run build:bridges 2>&1`
Expected: `dist-bridges/uitars-bridge/` and `dist-bridges/browser-use-bridge/` created.

- [ ] **Step 3: Attempt Electron packaging (dry run)**

Run: `npx electron-builder --dir --win 2>&1 | tail -10`
Expected: Build completes or identifies remaining config issues. Note: full .exe packaging may require Windows signing certificates; `--dir` produces unpacked app.

- [ ] **Step 4: Commit any packaging fixes**

```bash
git add -A
git commit -m "fix: Electron packaging configuration for Phase G"
```

---

## Phase H: UX Polish

### Task H1: Add bridge status bar to main window

**Files:**
- Modify: `client/src/App.jsx` (or `client/src/components/layout/` — add status bar component)
- Modify: `electron/main.js` (if IPC changes needed for push-based bridge events)

- [ ] **Step 1: Create BridgeStatusBar component**

Create a thin bar at the bottom of the main window that polls `bridge:status` every 5s and shows colored dots per bridge:
- Green dot + "Running" for running bridges
- Red dot + "Failed — click for details" for failed bridges — clicking the failed indicator navigates to the Settings panel "运行时" tab. Navigation can be done via a callback prop (`onNavigateToSettings(runtimes)`) or by dispatching a custom event that the App shell listens for.

```jsx
function BridgeStatusBar({ onNavigateToSettings }) {
  // ... poll bridge:status every 5s
  // Red dot is clickable: onClick={() => onNavigateToSettings('runtimes')}
}
```

- [ ] **Step 2: Integrate into App layout**

Add `<BridgeStatusBar />` to the main App component.

- [ ] **Step 3: Commit**

```bash
git add client/src/
git commit -m "feat: add bridge status bar to main window"
```

---

### Task H2: Add bridge restart with exponential backoff

**Files:**
- Modify: `electron/services/bridgeSupervisor.js:63-89`

- [ ] **Step 1: Add backoff logic to startOne() retry attempts**

The existing code retries `startOne()` up to 3 times. Add delay between retry attempts:
```js
const RETRY_DELAYS = [1000, 2000, 4000]  // 1s, 2s, 4s between retries
// In startOne(), in the catch or failure path, before recursive retry:
const delay = RETRY_DELAYS[state[key].restarts] || 4000
// Emit toast event for UI: emitter.emit('toast', { message: 'Bridge 连接断开，正在重连...', bridge: key })
await new Promise(r => setTimeout(r, delay))
// Then proceed with retry
```
Note: This adds delay BETWEEN retry attempts. The internal health-check polling (250ms) within each `startOne()` attempt is unchanged — it only applies when the process has started and we're waiting for it to become healthy.

- [ ] **Step 2: Run supervisor tests**

Run: `npx vitest run --grep -i "bridge" 2>&1`
Expected: Tests pass.

- [ ] **Step 3: Commit**

```bash
git add electron/services/bridgeSupervisor.js
git commit -m "feat: add exponential backoff to bridge restart"
```

---

### Task H3: First-run detection and auto-open wizard

**Files:**
- Modify: `electron/main.js:79-85`
- Modify: `client/src/App.jsx`

- [ ] **Step 1: On app launch, check if welcome wizard should show**

In `main.js` after `createWindow()`, send IPC event if `!config.welcomeShown`.
In `App.jsx`, listen for the event and show `WelcomeSetupDialog`.

- [ ] **Step 2: Auto-open wizard on first launch, skip on subsequent**

Read `welcomeShown` config flag. If false, show wizard. Wizard sets `welcomeShown: true` on completion.

- [ ] **Step 3: Commit**

```bash
git add electron/main.js client/src/App.jsx
git commit -m "feat: auto-open welcome wizard on first launch"
```

---

### Task H4: Final full-stack verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Target: All tests pass.

- [ ] **Step 2: Run bridge E2E smoke test**

Run: `node scripts/smoke-bridges-e2e.js`
Expected: All 8 bridge integration tests pass.

- [ ] **Step 3: Manual E2E check**

Steps (manual):
1. Delete config file to simulate fresh install
2. Start app in dev mode
3. Verify welcome wizard appears
4. Enter API key → verify bridges start
5. Send a test message
6. Verify browser task works

- [ ] **Step 4: Final commit + push**

```bash
git push origin feat/phase-b-frontend-wiring:dev-new
```
