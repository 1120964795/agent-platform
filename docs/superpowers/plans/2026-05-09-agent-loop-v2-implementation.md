# Agent Loop + browser-use Implementation Plan v2

> **For codex (executor):** Execute by Phase. **Do NOT delete old code until Phase 8** (after verifying new code works). Spec: `docs/superpowers/specs/2026-05-09-agent-loop-v2-design.md`. This v2 incorporates 9 reviewer-caught issues + first-run Python bootstrap.

**Goal:** Ship a single-Chat agent loop with native DeepSeek tool calling, replacing the plan-execute split. browser-use replaces Midscene. Skills system, conversation history, sidecar token security, and first-run Python bootstrap are new.

**Branch:** `feat/agent-loop-v2` from `main`.

**Order discipline (reviewer-mandated):** Spike first → build alongside old → verify → delete old. **Phase 8 is the only place anything is deleted.**

---

## Phase 0: Spike (validate before committing)

**Goal:** 3 tiny scripts in `scripts/spikes/` that prove the risky integrations work. None of these enter production code; they're throwaway validation.

### Spike A — DeepSeek native tool calling

- [ ] Create `scripts/spikes/spike-deepseek-tools.js`. ~50 lines:
  - Calls DeepSeek `/v1/chat/completions` with `tools: [{type:'function', function:{name:'shell_command', description:'...', parameters:{...}}}]`.
  - Sends user message: "请用 ls 命令看下当前目录".
  - Asserts response has `tool_calls` with `function.name === 'shell_command'` and parseable JSON `arguments`.
  - Asserts the name passes regex `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$`.
- [ ] Run; commit on success.

### Spike B — browser-use minimal end-to-end

- [ ] Create `scripts/spikes/spike-browser-use/`:
  - `requirements.txt` with pinned versions
  - `spike.py` — instantiate browser-use Agent with `ChatOpenAI(base_url=Doubao endpoint, api_key=…, model=ep-…)`, run goal "open baidu.com and search 'AionUi'", print final URL + screenshot bytes.
  - `README.md` documenting Python version, install steps actually used.
- [ ] Run; capture: real browser-use API surface (Agent class signature, action result fields, cancellation API, screenshot output format). Update spec §5 with verified facts.
- [ ] Commit. **Block Phase 3 until this passes.**

### Spike C — sidecar token + Origin gate

- [ ] Create `scripts/spikes/spike-sidecar-auth.js`. ~60 lines:
  - Spawn a tiny Express server on 127.0.0.1:9999 with `X-AionUi-Token` middleware and `Origin` rejection.
  - Test: request without token → 401. Request with wrong token → 401. Request with `Origin: http://evil.com` → 403. Request with no Origin (Node fetch default) and correct token → 200.
- [ ] Commit.

**Phase 0 commit:** `chore(spikes): validate tool calling, browser-use, sidecar auth`

---

## Phase 1: Agent loop core (alongside existing code)

### Task 1.1: tool dispatcher with permission gate

- [ ] Create `electron/services/toolDispatcher.js`:

```js
const TOOLS = new Map()  // name -> { schema, risk, invoke, permissions }
const TOOL_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/

function registerTool(def) {
  if (!TOOL_NAME_RE.test(def.name)) throw new Error(`Invalid tool name: ${def.name}`)
  TOOLS.set(def.name, def)
}

function unregisterTool(name) { TOOLS.delete(name) }

function catalog() {
  return [...TOOLS.values()].map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }))
}

async function invoke(call, { signal } = {}) {
  const t = TOOLS.get(call.function.name)
  if (!t) throw new Error(`Unknown tool: ${call.function.name}`)
  const args = JSON.parse(call.function.arguments || '{}')
  return t.invoke(args, { signal })
}

function clear() { TOOLS.clear() }  // tests only

module.exports = { registerTool, unregisterTool, catalog, invoke, clear, TOOL_NAME_RE }
```

- [ ] `electron/__tests__/tool-dispatcher.test.js` — name-validation rejects dots, registers + invokes a fake tool, unknown tool throws, signal propagates.

### Task 1.2: dynamic policy

- [ ] Create `electron/security/toolPolicy.js`. Reuse regex constants from `actionPolicy.js`:

```js
const { ACTION_TYPES, RISK_LEVELS } = require('./actionTypes')
const policy = require('./actionPolicy')  // for the regex constants below

const PATH_TRAVERSAL = /\.\.[\\/]|^[\\/](?:Windows|System32|etc|root)/i

function evaluateToolCall(name, args = {}, ctx = {}) {
  if (name === 'shell_command') {
    const cmd = String(args.command || '')
    const blocked = policy.blockedShellReason ? policy.blockedShellReason(cmd) : ''
    if (blocked) return { risk: 'blocked', reason: blocked, allowed: false, requiresApproval: false }
    if (/install|delete|format/i.test(cmd)) return { risk: 'high', reason: 'install/delete/format', allowed: true, requiresApproval: true }
    return { risk: 'medium', reason: 'shell command', allowed: true, requiresApproval: true }
  }
  if (name === 'file_read') {
    const p = String(args.path || '')
    if (PATH_TRAVERSAL.test(p)) return { risk: 'blocked', reason: 'path traversal/system path', allowed: false, requiresApproval: false }
    return { risk: 'low', reason: 'read file', allowed: true, requiresApproval: false }
  }
  if (name === 'file_write') {
    const p = String(args.path || '')
    if (PATH_TRAVERSAL.test(p)) return { risk: 'blocked', reason: 'path traversal/system path', allowed: false, requiresApproval: false }
    return { risk: 'medium', reason: 'write file', allowed: true, requiresApproval: true }
  }
  if (name === 'desktop_click' || name === 'desktop_type') {
    const text = String(args.text || args.target || '')
    if (/api[_-]?key|password|secret|token|credential/i.test(text)) return { risk: 'high', reason: 'credentials in payload', allowed: true, requiresApproval: true }
    return { risk: 'high', reason: 'desktop input', allowed: true, requiresApproval: true }
  }
  if (name === 'desktop_observe') return { risk: 'low', reason: 'screenshot', allowed: true, requiresApproval: false }
  if (name === 'browser_task') return { risk: 'medium', reason: 'browser sub-task', allowed: true, requiresApproval: true }
  if (name === 'code_execute') {
    const code = String(args.code || '')
    if (/api[_-]?key|secret|token/i.test(code) && /(curl|wget|fetch|requests|axios)/i.test(code)) return { risk: 'blocked', reason: 'suspected credential exfiltration', allowed: false, requiresApproval: false }
    return { risk: 'medium', reason: 'execute code', allowed: true, requiresApproval: true }
  }
  if (name.startsWith('skill_')) {
    return { risk: 'medium', reason: 'skill invocation', allowed: true, requiresApproval: true }
  }
  // Unknown tool — block.
  return { risk: 'blocked', reason: `unknown tool ${name}`, allowed: false, requiresApproval: false }
}

module.exports = { evaluateToolCall, PATH_TRAVERSAL }
```

- [ ] Tests: `electron/__tests__/tool-policy.test.js` — each branch (rm -rf blocked, install high, ../etc/passwd blocked, normal write medium, credential text in click → high, code with credentials+fetch → blocked, unknown tool → blocked).

### Task 1.3: modelRouter.chatWithTools

- [ ] Modify `electron/services/modelRouter.js`: add `chatWithTools({messages, tools, role, config, signal})`.
- [ ] Modify `electron/services/models/deepseekProvider.js`: implement `chatWithTools` per [DeepSeek tool calling docs](https://api-docs.deepseek.com/guides/tool_calls). Pass `tools` and `tool_choice: 'auto'`. Return `{content, tool_calls}`.
- [ ] Tests with mocked fetch.

### Task 1.4: agent loop with cancellation

- [ ] Create `electron/services/agentLoop.js` (per spec §2). Key requirements:
  - Tracks `inFlight: Map<callId, AbortController>` for active tool invocations.
  - When outer signal aborts, abort all in-flight calls.
  - Uses `dispatcher.invoke(call, {signal})` so each call can be individually aborted.
  - `MAX_STEPS = 30`.
  - Emits events via callback: `assistant_message`, `tool_pending_approval`, `tool_result`, `tool_error`, `tool_cancelled`, `tool_blocked`.

- [ ] Tests: `electron/__tests__/agent-loop.test.js` covering:
  - No tool calls → returns immediately
  - Single tool call → result fed back → second response no calls → ends
  - Approval denied → "USER_DENIED" appended
  - Policy blocked → "POLICY_BLOCKED" appended, no invoke
  - Outer abort signal → in-flight tool's signal aborted
  - MAX_STEPS exhausted → returns step-limit message
  - Bad JSON in tool_calls → caught, logged, agent message returned

**Phase 1 commit:** `feat(agent): tool dispatcher + dynamic policy + cancellable loop (alongside old code)`

---

## Phase 2: Wire existing oi-bridge + uitars-bridge as tools (with token auth)

### Task 2.1: sidecar token infrastructure

- [ ] Create `electron/services/sidecarTokens.js`:

```js
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

let tokens = null

function generateTokens(keys) {
  const t = {}
  for (const k of keys) t[k] = crypto.randomBytes(32).toString('base64url')
  tokens = t
  return t
}

function persistTokens(filePath) {
  fs.writeFileSync(filePath, JSON.stringify(tokens), { mode: 0o600 })
}

function getToken(key) { return tokens?.[key] }

module.exports = { generateTokens, persistTokens, getToken }
```

- [ ] Modify `electron/services/bridgeSupervisor.js`:
  - Generate tokens for `oi`, `uitars`, `browser-use` at supervisor.start().
  - Inject `SIDECAR_TOKEN` env var per spawn.
  - Health check sends `X-AionUi-Token` header.

- [ ] Modify each existing sidecar (`server/oi-bridge/index.js`, `server/uitars-bridge/index.js`):
  - On startup, read `process.env.SIDECAR_TOKEN`. If empty → exit with error.
  - Add Express middleware:
    ```js
    app.use((req, res, next) => {
      if (req.headers['origin'] && req.headers['origin'] !== 'null') return res.status(403).end('forbidden origin')
      if (req.headers['x-aionui-token'] !== process.env.SIDECAR_TOKEN) return res.status(401).end('bad token')
      next()
    })
    ```

- [ ] Tests for sidecar middleware: 401 on missing/wrong token, 403 on bad origin, 200 on correct token + no origin.

### Task 2.2: tool wrappers for oi-bridge

- [ ] Create `electron/services/tools/oiTools.js`:
  - Registers `shell_command`, `file_read`, `file_write`, `code_execute` via `toolDispatcher.registerTool`.
  - Each tool's `invoke` POSTs to `http://127.0.0.1:8756/execute` with the new token header.
  - Translates from agent tool args to existing AionUi protocol shape, returns parsed result text.

### Task 2.3: tool wrappers for uitars-bridge

- [ ] Create `electron/services/tools/desktopTools.js`:
  - Registers `desktop_observe`, `desktop_click`, `desktop_type`.
  - Same token pattern, port 8765.

### Task 2.4: integration smoke test

- [ ] Manual: start AionUi dev mode, run a script that calls agentLoop directly with a mock model that emits a `shell_command` tool call. Verify shell command runs and result returned.

**Phase 2 commit:** `feat(tools): sidecar tokens + oi/uitars wrapped as agent tools`

---

## Phase 3: browser-use sidecar (only after Phase 0 Spike B passed)

### Task 3.1: scaffold based on spike's verified API

- [ ] Create `server/browser-use-bridge/`:
  - `requirements.txt` with versions verified by Spike B.
  - `main.py` — FastAPI app with token middleware, `/health`, `/run-task` (SSE), `/cancel/<id>`.
  - Task registry: `tasks: dict[str, asyncio.Task]`.
  - Cancellation: `task.cancel()` + `agent.browser.close()`.

### Task 3.2: bridgeSupervisor adoption

- [ ] Add `'browser-use'` to `DEFAULTS` in supervisor:
  - `command: <userData>/python-runtime/python.exe` (or system `python` if user opted in)
  - `args: [<sidecar dir>/main.py, --port, 8780]`
  - env: SIDECAR_TOKEN + BROWSER_USE_MODEL_*
- [ ] If `<userData>/python-runtime/.bootstrap-complete` is missing, supervisor skips this sidecar and reports state `'pending-bootstrap'`.

### Task 3.3: browser_task tool wrapper

- [ ] Create `electron/services/tools/browserTaskTool.js`:
  - Registers `browser_task` if browser-use is configured.
  - Generates a `taskId` (uuid).
  - Opens SSE connection to `/run-task`, accumulates events into the agent's `onEvent` callback (for live progress in chat).
  - On agent's signal abort, fires `/cancel/<taskId>` and waits for confirmation.
  - Returns final summary text once `done` event received.

- [ ] Tests with mocked SSE.

**Phase 3 commit:** `feat(browser-use): Python sidecar with cancellation + browser_task tool`

---

## Phase 4: First-run Python bootstrap

### Task 4.1: detection + UI

- [ ] Create `electron/services/bootstrap.js`:
  - `detectStatus()` — checks `<userData>/python-runtime/.bootstrap-complete`, system Python via `where python`/`where py`, returns one of `{ready-embedded, ready-system, missing}`.
  - `installEmbedded(onProgress)` — async function performing the 6 steps from spec §6, calling `onProgress({stage, percent})` for UI.

- [ ] Create `client/src/components/BootstrapDialog.jsx`:
  - Shown when `detectStatus()` returns `missing` AND user opens Welcome dialog or invokes a browser task.
  - Shows steps with progress.
  - "Skip for now" button — closes; browser_task remains absent.
  - "Use existing system Python" radio if system Python is detected — runs only the `pip install` and `playwright install` steps.

### Task 4.2: bootstrap implementation

- [ ] Hash-verified Python download (hardcode SHA256 of `python-3.12.7-embed-amd64.zip`).
- [ ] `_pth` file edit to enable `import site`.
- [ ] `get-pip.py` download + run.
- [ ] `pip install browser-use==<pin> langchain-openai==<pin> fastapi uvicorn[standard]`.
- [ ] `playwright install chromium`.
- [ ] Write `.bootstrap-complete` with timestamp + version.

### Task 4.3: tests

- [ ] `detectStatus()` unit test (mocked fs).
- [ ] `installEmbedded()` integration test using a small mock zip + a file:// download URL.

**Phase 4 commit:** `feat(bootstrap): first-run installer for Python + browser-use + Chromium`

---

## Phase 5: Skill registry

### Task 5.1: registry core

- [ ] Create `electron/services/skillRegistry.js`:
  - `loadAll()` — scans `<userData>/skills/`, validates each `skill.json` against schema (use `ajv`), reads `.state.json` for enabled/disabled, registers enabled ones via `toolDispatcher.registerTool`.
  - Tool name: `skill_<sanitized>` where sanitized = name lowercased + dashes/dots → underscores.
  - Tool invoke: spawns the executable via `child_process.spawn`, writes args JSON to stdin, reads JSON from stdout (with 30s timeout), returns the result.
  - Permission gate: before invoke, check declared permissions; if a callback IPC path is used by the skill, gate the IPC handlers on the skill's permissions.
- [ ] `chokidar` watch for live (re)load.

### Task 5.2: starter skills

- [ ] `resources/builtin-skills/web-search/skill.json` + `entry.js` (Bing or 百度 API; api key from settings).
- [ ] `resources/builtin-skills/note-write/skill.json` + `entry.js`.
- [ ] `resources/builtin-skills/screenshot-save/skill.json` + `entry.js` (calls back to AionUi via a callback IPC for `desktop_observe` — gated by skill permission `desktop`).
- [ ] On first run, copy `resources/builtin-skills/*` to `<userData>/skills/`.
- [ ] Default state for all 3: `enabled: false`. User must opt in.

### Task 5.3: Skills panel UI

- [ ] `client/src/panels/SkillsPanel.jsx` — list installed skills, toggle enable per skill, show declared permissions, button to "查看 skill.json".

**Phase 5 commit:** `feat(skills): file-watched registry + 3 starter skills (default disabled)`

---

## Phase 6: SQLite conversations + IPC migration layer

### Task 6.1: SQLite store

- [ ] `npm install better-sqlite3`.
- [ ] Create `electron/services/conversations.js` with schema + API per spec §6.
- [ ] IPC: `electron/ipc/conversations.js` — list/create/load/append/rename/delete.
- [ ] Tests against `:memory:`.

### Task 6.2: agent IPC

- [ ] Create `electron/ipc/agent.js`:
  - `agent:run-turn` handler — kicks off `agentLoop.runTurn()`.
  - Streams events via `mainWindow.webContents.send('agent:event', ...)`.
  - Also emits legacy `chat:delta`/`chat:tool-*` events for one-release backward compat. Mark with `__deprecated: true` flag in payload.
  - `agent:approve`/`agent:deny` for pending approvals.
  - `agent:abort` for Stop button.

### Task 6.3: useChat migration

- [ ] Update `client/src/hooks/useChat.js` to:
  - Listen on `agent:event` (new) AND `chat:*` (legacy alias) — but prefer `agent:event` if both fire.
  - Render `tool` role messages (don't filter out).

**Phase 6 commit:** `feat(history+ipc): SQLite conversations + agent:event with legacy alias`

---

## Phase 7: Frontend rework — single Chat surface

### Task 7.1: chat panel changes

- [ ] Conversation list sidebar with list/new/rename/delete.
- [ ] Tool call rendering as collapsible cards.
- [ ] Approval-pending card with 批准/拒绝.

### Task 7.2: Activity log

- [ ] Rename Control Center → Activity log; remove approval-queue interactivity (approval lives in chat now).

### Task 7.3: Welcome dialog updates

- [ ] "Browser automation" tier check switches to "browser-use sidecar healthy".
- [ ] If Python missing, dialog row shows "首次设置 →" button that opens BootstrapDialog.
- [ ] Skills panel link.

**Phase 7 commit:** `feat(client): single chat UI with conversations sidebar + skills panel`

---

## Phase 8: Retire old code

This is the only phase that deletes things. **Do not start before Phase 9 acceptance verifies new code works.** (Yes, this is a deliberate ordering — verify new before deleting old.)

- [ ] Wait for Phase 9 PASS.
- [ ] Delete:
  - `electron/services/actionPlanner.js`
  - `electron/services/visionPlanner.js`
  - `electron/services/midscene/` (dir)
  - `electron/__tests__/{action-planner,vision-planner,midscene-adapter,midscene-bootstrap}.test.js`
- [ ] Move `server/midscene-bridge/` → `server/midscene-bridge.deprecated/` (don't fully delete; allow rollback).
- [ ] Remove `midscene` from `bridgeSupervisor.DEFAULTS`.
- [ ] Remove `WEB_NAVIGATE/OBSERVE/CLICK/TYPE/QUERY` from `actionTypes.js`; remove `RUNTIME_NAMES.MIDSCENE`.
- [ ] Remove `webRisk` branch from `actionPolicy.js`.
- [ ] Remove `midscene` from package.json workspaces and `extraResources`.
- [ ] Remove legacy `chat:*` IPC events (after one release cycle — note in PR if not safe yet).

**Phase 8 commit:** `chore: retire midscene + planner + execute UI (after v2 acceptance)`

---

## Phase 9: Acceptance — clean Windows VM

- [ ] Set up clean Windows 11 VM with no Python, no Node-related state.
- [ ] Install AionUi installer.
- [ ] Run scenarios §10.1 (10 happy paths) + §10.2 (7 failure modes) from the spec.
- [ ] Append results to `docs/test-report.md` under `## 2026-05-09 Agent Loop v2 Acceptance` with PASS/FAIL per item.
- [ ] If all PASS → push branch, open PR titled `feat: agent loop v2 with browser-use + skills + first-run bootstrap`.
- [ ] If anything FAILs → don't proceed to Phase 8; surface to human.

---

## Definition of Done

- All 17 acceptance items (10 happy + 7 failure) PASS on clean Windows VM.
- All new + existing tests green: `npm test`.
- `npm run build:client` clean.
- `npm run electron:build` produces a Windows installer that on first launch prompts for Python bootstrap; subsequent launches start cleanly.
- Old code deleted (Phase 8).
- README updated:
  - Drop "Midscene Bridge Mode" mentions
  - Add browser-use Python module note
  - Document skill folder
  - Document first-run bootstrap
- Sidecar token file at `<userData>/agentdev-lite/data/sidecar-tokens.json` exists; sidecars reject unauthenticated requests.
- Cancellation works for browser_task (verified in §10.1.7).
