# Agent Loop v4 Implementation Plan (final)

> **For codex (executor):** Spec: `docs/superpowers/specs/2026-05-10-agent-loop-v4-design.md`. v4 absorbs all 4 reviewer rounds + lessons from the failed UI-TARS-desktop fork spike. **Reuse existing AionUi infrastructure — do NOT write parallel registries or providers.**

**Branch:** `feat/agent-loop-v4` from `main`.

**Critical reuse pact (red lines):**
1. **Tool registry**: existing `electron/tools/index.js` `register()` API
2. **Tool name convention**: existing verb_noun (`read_file`, `run_shell_command`, etc.)
3. **Model+tools**: existing `electron/services/deepseek.js` `chat({tools})`
4. **SKILL.md skills**: existing `electron/skills/loader.js` unchanged
5. **Phase 9 acceptance BEFORE Phase 8 deletion**

---

## Phase 0: Spike (1 day)

Same 3 throwaway scripts from v3, no migration commitment yet.

- [ ] 0.1: `scripts/spikes/spike-deepseek-tools.js` — proves the *existing* `electron/services/deepseek.js` `chat({messages, tools})` returns parseable `tool_calls`. (No new provider code; just exercise what's there.)
- [ ] 0.2: `scripts/spikes/spike-browser-use.py` — uv create venv, install browser-use, run a 1-task agent (`open example.com, return title`) using user's Doubao endpoint. Verify `Agent.run()` returns + cancellation actually closes browser.
- [ ] 0.3: `scripts/spikes/spike-sidecar-auth.js` — Express server with token + Origin middleware; verify reject paths.

Commit: `chore(spikes): validate v4 assumptions`

---

## Phase 1: Core (2 days)

### 1.1 policyPatterns extraction

- [ ] Create `electron/security/policyPatterns.js`. Move all const regexes from `actionPolicy.js` to here, exported. Add new v4 patterns: `URL_PROTOCOLS_BLOCKED`, `RFC1918_HOST`, `PAYMENT_INTENT`, `ACCOUNT_DESTRUCTION`, `PASSWORD_CHANGE`, `MONEY_TRANSFER`, `SENSITIVE_DOMAINS` (banks/gov/health hostname allowlist for screenshot-skip).
- [ ] Modify `electron/security/actionPolicy.js`: replace inline `const PATTERN = /.../` with `const { PATTERN } = require('./policyPatterns')`. Existing function bodies unchanged. Verify existing actionPolicy tests pass.
- [ ] Tests: `electron/__tests__/policy-patterns.test.js`.

### 1.2 pathSafety

- [ ] Create `electron/security/pathSafety.js` per spec §6. Key: `realpathParent(input)` for non-existent write targets.
- [ ] Tests: `electron/__tests__/path-safety.test.js`. Cover:
  - existing path with realpath
  - non-existent path with realpath of parent
  - junction at parent → blocked when target is system path
  - UNC path blocked
  - long-path `\\?\` prefix accepted, stripped for comparison
  - read mode: only system paths blocked (Desktop allowed)
  - write mode: only writable-roots allowed

### 1.3 toolPolicy

- [ ] Create `electron/security/toolPolicy.js`. `evaluateToolCall(name, args, ctx)` returns `{risk, reason, allowed, requiresApproval}`. Branches per spec §3 and v3 §1.3 reference code.
- [ ] **For browser_task**: risk=medium, requiresApproval=false (NOT low). Pre-flight uses URL_PROTOCOLS_BLOCKED, RFC1918_HOST, PAYMENT_INTENT, ACCOUNT_DESTRUCTION, PASSWORD_CHANGE, MONEY_TRANSFER. Match → blocked.
- [ ] **For shell_command** (use existing tool name `run_shell_command`): reuse policyPatterns regex set; UNBOUNDED_DELETE / FORMAT / SECURITY_DISABLE / HIDDEN → blocked; CREDENTIAL+EXFIL → blocked; PS_INVOKE_EXPRESSION → high; INSTALL/DELETE → high; otherwise medium.
- [ ] **For write_file**: `safePath(path, 'write', config)` throws → blocked. Otherwise medium.
- [ ] **For read_file**: `safePath(path, 'read', config)` throws → blocked. Otherwise low.
- [ ] Tests covering each branch.

### 1.4 agentLoop

- [ ] Create `electron/services/agentLoop.js` per spec §4. Critical:
  - Use existing `require('../tools')` for registry (no new dispatcher)
  - Use existing `require('./deepseek').chat({messages, tools, ...})`
  - `tools.getExecutionToolSchemas()` for the tools parameter
  - `tools.execute(name, args, opts)` for invocation
  - Track `inFlight: Set<AbortController>` so signal abort cancels all
  - On AbortError, return immediately — no further model call
  - Append events to audit via existing audit mechanism
- [ ] Tests: `electron/__tests__/agent-loop.test.js`:
  - mocked deepseek.chat returns no tool_calls → loop ends
  - one tool_call → result fed back → next iteration ends
  - blocked tool → POLICY_BLOCKED content, never invoked
  - approval denied → USER_DENIED content
  - signal abort during invoke → all in-flight signals abort, function returns "操作已取消" without next model call
  - MAX_STEPS exhausted → step-limit message

Commit: `feat(agent): policyPatterns + pathSafety + toolPolicy + agentLoop (reuses existing tools/deepseek)`

---

## Phase 2: uitars-bridge tools + sidecar tokens (1 day)

### 2.1 sidecarTokens (in-memory)

- [ ] Create `electron/services/sidecarTokens.js`:
  ```js
  const crypto = require('crypto')
  let tokens = null
  function generateAll(keys) { tokens = Object.fromEntries(keys.map(k => [k, crypto.randomBytes(32).toString('base64url')])); return tokens }
  function get(k) { return tokens?.[k] }
  function clear() { tokens = null }
  module.exports = { generateAll, get, clear }
  ```
- [ ] Modify `electron/services/bridgeSupervisor.js`:
  - On `start()`, call `sidecarTokens.generateAll(['oi', 'uitars', 'browser'])`
  - For each spawn, set env `SIDECAR_TOKEN: sidecarTokens.get(key)`
  - Health probe sends `X-AionUi-Token` header
  - On `stop()` and Electron `before-quit`, call `sidecarTokens.clear()`

### 2.2 sidecar middleware (oi + uitars)

- [ ] In `server/oi-bridge/index.js` and `server/uitars-bridge/index.js`:
  - Boot: fail with `process.exit(1)` if `process.env.SIDECAR_TOKEN` empty
  - Express middleware:
    ```js
    app.use((req, res, next) => {
      const origin = req.headers.origin
      if (origin && origin !== 'null') return res.status(403).end('forbidden origin')
      if (req.headers['x-aionui-token'] !== process.env.SIDECAR_TOKEN) return res.status(401).end('bad token')
      next()
    })
    ```
- [ ] Tests for middleware: 401, 403, 200 paths.

### 2.3 desktop tools wrappers

- [ ] Create `electron/tools/desktop.js` registering 3 tools using existing `register()` API:
  ```js
  const { register } = require('./index')
  register({
    name: 'observe_screen',
    description: 'Capture a full-screen screenshot.',
    parameters: { type: 'object', properties: {} }
  }, observeScreen)
  register({
    name: 'click_target',
    description: 'Click on a screen element described in natural language.',
    parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] }
  }, clickTarget)
  register({
    name: 'type_text',
    description: 'Type text into the focused field.',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }
  }, typeText)
  ```
  Each handler POSTs to `http://127.0.0.1:8765/execute` with `X-AionUi-Token`, `signal` propagated.
- [ ] Wire `require('./tools/desktop')` into `tools/index.js` `loadBuiltins()`.
- [ ] Smoke test in dev mode.

Commit: `feat(tools+security): in-memory sidecar tokens + desktop tools registered via existing registry`

---

## Phase 3: Browser sidecar (Python, 2 days, after Phase 0.2 spike PASSes)

### 3.1 Scaffold

- [ ] Create `server/browser-bridge/`:
  - `pyproject.toml` declaring deps: `browser-use`, `langchain-openai`, `fastapi`, `uvicorn[standard]`
  - Generate `requirements.lock` via `uv pip compile pyproject.toml --generate-hashes -o requirements.lock` (committed)
  - `main.py` — FastAPI on 127.0.0.1:8780 with token + Origin middleware
  - `browser_runner.py` — wraps `browser-use Agent` with cancellation + Playwright route() guards (per spec §5.3)
- [ ] Endpoints: `/health` (token-gated), `POST /run-task` (SSE), `POST /cancel/<taskId>`
- [ ] Per-step events emitted: thought, action, screenshot (saved to `<userData>/browser-screenshots/<convId>/step_N.png`), credential redaction
- [ ] Sensitive-domain check: if `request.url` hostname matches SENSITIVE_DOMAINS list (passed in env), do NOT save screenshot

### 3.2 Supervisor adoption

- [ ] Add `'browser'` entry to `bridgeSupervisor.DEFAULTS`:
  - command: `<userData>/python-runtime/.venv/Scripts/python.exe`
  - args: `[<sidecar>/main.py, --port, 8780]`
  - env: SIDECAR_TOKEN, BROWSER_USE_MODEL_ENDPOINT, BROWSER_USE_MODEL_API_KEY, BROWSER_USE_MODEL_NAME, **PLAYWRIGHT_BROWSERS_PATH=<userData>/python-runtime/chromium**
- [ ] If `<userData>/python-runtime/.bootstrap-complete` missing, sidecar entry marked `pending-bootstrap`, browser_task absent from catalog.

### 3.3 browser_task tool

- [ ] Create `electron/tools/browser.js`:
  ```js
  register({
    name: 'browser_task',
    description: 'Run an autonomous browser sub-task. Agent will navigate, click, type, etc. without per-step approval.',
    parameters: { type: 'object', properties: { goal: {type:'string'}, start_url: {type:'string'} }, required: ['goal'] }
  }, browserTask)
  ```
- [ ] Implementation: generate `taskId`, POST `/run-task` with token, consume SSE, persist each event to audit + emit to `onEvent`. On signal abort: POST `/cancel/<taskId>` + close fetch.
- [ ] Tests with mocked SSE.

Commit: `feat(browser): Python sidecar with Playwright route() guards + browser_task tool`

---

## Phase 4: uv-based bootstrap (1.5 days)

### 4.1 bootstrap.js

- [ ] Create `electron/services/bootstrap.js`:
  - `detectStatus()`: returns `'ready' | 'partial' | 'missing'` based on:
    - `<userData>/python-runtime/uv.exe` exists + runs
    - `<userData>/python-runtime/.venv/Scripts/python.exe` exists
    - `requirements.lock` present at `server/browser-bridge/requirements.lock`
    - `<userData>/python-runtime/.bootstrap-complete` flag
  - `installAll(onProgress)`: 5 stages (download uv → uv venv → uv pip install -r lockfile → playwright install with explicit PLAYWRIGHT_BROWSERS_PATH → mark complete). Each stage retry 3x with exponential backoff.
  - Hardcoded SHA256 for the pinned uv release zip
  - Pinned uv version in source

### 4.2 BootstrapDialog UI

- [ ] Create `client/src/components/BootstrapDialog.jsx`. Auto-shown when `detectStatus()` !== 'ready' AND user opens Welcome dialog OR triggers a browser task.
- [ ] Steps with progress + retry button on failure + skip button (browser_task remains absent if skipped).

### 4.3 IPC + tests

- [ ] `electron/ipc/bootstrap.js` with `bootstrap:status` and `bootstrap:install` handlers.
- [ ] Tests: `bootstrap.test.js` mocking each stage.

Commit: `feat(bootstrap): uv + Playwright with explicit PLAYWRIGHT_BROWSERS_PATH + lockfile install`

---

## Phase 5: SQLite conversations (0.5 day)

- [ ] `npm install better-sqlite3` (electron-rebuild postinstall handles native binary)
- [ ] Create `electron/services/conversations.js` per v3 spec §6.
- [ ] IPC handlers in `electron/ipc/conversations.js`.
- [ ] Tests against `:memory:`.

Commit: `feat(history): SQLite-backed conversations`

---

## Phase 6: Agent IPC (1 day)

- [ ] Create `electron/ipc/agent.js`:
  - `agent:run-turn` handler — calls `agentLoop.runTurn()`
  - Streams via `mainWindow.webContents.send('agent:event', payload)`
  - **Also** emit legacy `chat:delta` / `chat:tool-result` events for one-release backcompat (reviewer round 2 #8). Mark with `_deprecated: true` in payload.
  - `agent:approve` / `agent:deny` (for pending approvals)
  - `agent:abort` (for Stop button)
- [ ] Update `electron/preload.js` to expose `aionui.runAgentTurn`, `aionui.onAgentEvent`, `aionui.approveTool`, `aionui.denyTool`, `aionui.abortAgent`
- [ ] Tests for IPC handlers.

Commit: `feat(ipc): agent:event channel with chat:* legacy alias`

---

## Phase 7: Frontend single Chat (2 days)

### 7.1 Conversation sidebar + tool cards

- [ ] Modify `client/src/panels/ChatPanel.jsx`:
  - Sidebar: list of conversations from `conversations:list`. New/rename/delete.
  - Message thread renders user/assistant/tool messages
  - Tool calls under assistant messages: collapsible cards showing call args + result
  - Approval-pending: yellow card with 批准/拒绝 buttons → `agent:approve`/`agent:deny`
  - browser_task progress: live-updating card with current step + URL + thumbnail
  - Stop button always visible during a turn → `agent:abort`

### 7.2 useChat migration

- [ ] Update `client/src/hooks/useChat.js`:
  - Listen on `agent:event` (preferred) + `chat:*` (legacy alias)
  - Render `tool` role messages (don't filter)
  - Render `assistant` messages with `tool_calls` list visible

### 7.3 **Cutover (drop Execute mode tab)**

- [ ] Delete `client/src/panels/ExecutePanel.jsx` (or whatever the Execute tab is)
- [ ] Remove the Execute tab from main navigation
- [ ] Replace `mode === 'execute'` branch in `electron/ipc/chat.js`: route everything through `agent:run-turn` IPC instead. The old branch becomes dead code → delete.

### 7.4 Activity log

- [ ] Rename Control Center → Activity log. Read-only audit feed. Approval-pending items echo there for visibility but action lives in chat.

### 7.5 Welcome dialog updates

- [ ] "Browser automation" tier check: `runtime:status` → `browser.state === 'running'` (instead of "Midscene Bridge connected")
- [ ] If `bootstrap:status` !== 'ready', show "首次设置 →" button that opens BootstrapDialog
- [ ] Drop the Chrome extension setup (Midscene Bridge Mode is gone)

### 7.6 Settings → Privacy

- [ ] Add Privacy panel with:
  - "Clear all browser screenshots" button
  - "Browser screenshot retention: [7 days] dropdown (1/7/30/never)"
  - "Sensitive-domain list (no screenshots)" textarea (default populated with pre-set list)

Commit: `feat(client): single Chat surface, conversation sidebar, browser progress, drop Execute mode`

---

## Phase 9: Acceptance — clean Windows VM (0.5 day)

(Yes, Phase 9 BEFORE Phase 8.)

12 happy + 7 failure scenarios from v3 spec §10, real sites only:

1. No-tool chat
2. Pure shell (`run_shell_command`) with approval
3. Multi-tool sequence (write_file + read_file)
4. Browser stable site (example.com)
5. Browser query (docs.python.org)
6. SKILL.md load (existing skill via `load_skill`)
7. Auto-block shell (`Remove-Item -Recurse -Force C:\\` blocked)
8. Auto-block browser (alipay.com/checkout pre-flight blocked)
9. Auto-block scheme (`file:///` blocked)
10. Cancellation: long browser task, Stop, "操作已取消" within 2s
11. History persistence
12. Bootstrap on fresh VM

Failure modes:
- A: browser sidecar killed mid-task
- B: malformed tool_calls JSON
- C: bootstrap dismissed (browser_task absent)
- D: user denies approval
- E: path traversal blocked
- F: sidecar token mismatch (401)
- G: network down during browser_task

Append results to `docs/test-report.md`. **Stop here if anything fails. Do NOT enter Phase 8.**

Commit: `docs(test-report): v4 acceptance results`

---

## Phase 8: Retire (0.5 day, ONLY after Phase 9 PASS)

- [ ] Delete:
  - `electron/services/actionPlanner.js`
  - `electron/services/visionPlanner.js`
  - `electron/services/taskOrchestrator.js`
  - `electron/services/midscene/` (whole dir)
  - Tests for the above
- [ ] Move `server/midscene-bridge/` → `server/midscene-bridge.deprecated/` (rollback path)
- [ ] Remove `midscene` from supervisor DEFAULTS, package.json workspaces, extraResources
- [ ] Remove `WEB_*` action types from `actionTypes.js`; remove `RUNTIME_NAMES.MIDSCENE`
- [ ] Remove `webRisk` branch from `actionPolicy.js`
- [ ] Update README:
  - Drop Midscene Bridge Mode references
  - Document agent-loop usage
  - Note browser_task requires uv bootstrap on first use
  - SKILL.md skills section unchanged

Commit: `chore: retire midscene + planner + execute UI (post-acceptance)`

---

## Definition of Done

- All 19 acceptance items (12 happy + 7 failure) PASS on clean Windows VM
- All tests green: `npm test`
- `npm run build:client` clean
- `npm run electron:build` produces installer
- `electron/tools/index.js` extended (not duplicated); existing tools intact
- Existing SKILL.md skills (`resources/skills/*`) work unchanged
- `electron/services/deepseek.js` extended with tools support if not already (verify it does); no parallel chatWithTools
- sidecar tokens in memory only; not on disk
- `PLAYWRIGHT_BROWSERS_PATH` set explicitly in browser sidecar env
- `requirements.lock` checked in
- Phase 9 PASS before Phase 8
- README updated; reviewer-round-3 #15 cutover honored (no Execute tab)
