# Agent Loop + browser-use Implementation Plan v3

> **For codex (executor):** Final iteration. Spec: `docs/superpowers/specs/2026-05-09-agent-loop-v3-design.md`. v3 absorbs 21 reviewer-caught issues across two reviews. **Do not delete old code until Phase 8** (after Phase 9 acceptance PASSes).

**Goal:** Single Chat surface + native DeepSeek tool calling. browser-use replaces Midscene as auto-executing browser tool. Existing SKILL.md prompt skills preserved. uv-based Python bootstrap. End-to-end real cancellation.

**Branch:** `feat/agent-loop-v3` from `main`.

**Order discipline:** Spike first → build alongside old (feature-flag `agentLoopEnabled`) → verify → delete old. **Phase 8 = only deletion.**

---

## Phase 0: Spike

Three throwaway scripts in `scripts/spikes/`. **Do not enter production**.

### 0.1 — DeepSeek tool calling

- [ ] `scripts/spikes/spike-deepseek-tools.js`. Calls DeepSeek `/v1/chat/completions` with `tools` parameter. Verifies:
  - tool name regex passes
  - `tool_calls` returned with parseable JSON arguments
  - role-tool message can be appended and model continues sensibly
  - aborting fetch mid-stream raises AbortError correctly

### 0.2 — browser-use end-to-end

- [ ] `scripts/spikes/spike-browser-use/`:
  - `requirements.txt` (pinned versions verified during the spike)
  - `spike.py` — instantiate `Agent(task='open https://example.com and report the title', llm=ChatOpenAI(...with Doubao seed-1.6-vision endpoint))`
  - Run, capture: real Agent class signature, action result fields, `browser.close()` behavior, asyncio cancellation behavior
  - `cancel_test.py` — start a long task, `task.cancel()` after 3s, verify browser closes and process doesn't hang
  - **Update spec §5 with verified API** before Phase 3 starts

### 0.3 — sidecar token + Origin

- [ ] `scripts/spikes/spike-sidecar-auth.js`. Express server with token + Origin middleware. Test: missing token → 401; wrong token → 401; `Origin: http://x` → 403; correct token + no Origin → 200.

**Phase 0 commit:** `chore(spikes): validate tool-calling, browser-use, sidecar auth`

---

## Phase 1: Core (alongside existing code)

### 1.1 policyPatterns extraction

- [ ] Create `electron/security/policyPatterns.js` per spec §9 (centralized regex constants + new v3 patterns).
- [ ] Modify `electron/security/actionPolicy.js`: replace inline `const PATTERN = /.../` with `const { PATTERN } = require('./policyPatterns')`. Keep existing function bodies. Verify existing actionPolicy tests still pass.
- [ ] Tests: `electron/__tests__/policy-patterns.test.js` covering each new pattern (PS_INVOKE_EXPRESSION, URL_PROTOCOLS_BLOCKED, RFC1918_HOST, PAYMENT_INTENT, ACCOUNT_DESTRUCTION, PASSWORD_CHANGE, MONEY_TRANSFER).

### 1.2 pathSafety

- [ ] Create `electron/security/pathSafety.js` per spec §8.
- [ ] Tests: `electron/__tests__/path-safety.test.js`:
  - resolves `..\\..\\Windows\\System32` → throws
  - resolves UNC `\\\\server\\share\\file` → throws
  - resolves long-path `\\\\?\\C:\\Users\\g\\Desktop\\foo.txt` → ok (after stripping)
  - write outside writable-roots → throws
  - write inside Desktop → ok
  - non-existent path (typical for write) → returns resolved path without realpath
  - symlink resolution (mock `fs.realpathSync.native`)

### 1.3 toolPolicy

- [ ] Create `electron/security/toolPolicy.js`:

```js
const patterns = require('./policyPatterns')
const { safePath } = require('./pathSafety')
const { store } = require('../store')

function evaluateToolCall(name, args = {}, ctx = {}) {
  const config = ctx.config || store.getConfig()

  if (name === 'shell_command') {
    const cmd = String(args.command || '')
    if (patterns.UNBOUNDED_DELETE_PATTERN.test(cmd)) return { risk: 'blocked', reason: '无边界删除', allowed: false, requiresApproval: false }
    if (patterns.FORMAT_PATTERN.test(cmd)) return { risk: 'blocked', reason: '磁盘格式化', allowed: false, requiresApproval: false }
    if (patterns.SECURITY_DISABLE_PATTERN.test(cmd)) return { risk: 'blocked', reason: '禁用安全工具', allowed: false, requiresApproval: false }
    if (patterns.HIDDEN_PATTERN.test(cmd)) return { risk: 'blocked', reason: '隐藏后台执行', allowed: false, requiresApproval: false }
    if (patterns.PS_INVOKE_EXPRESSION.test(cmd)) return { risk: 'high', reason: 'PowerShell 动态执行', allowed: true, requiresApproval: true }
    if (patterns.CREDENTIAL_PATTERN.test(cmd) && patterns.EXFIL_PATTERN.test(cmd)) return { risk: 'blocked', reason: '疑似凭据外传', allowed: false, requiresApproval: false }
    if (patterns.INSTALL_PATTERN.test(cmd)) return { risk: 'high', reason: '安装命令', allowed: true, requiresApproval: true }
    if (patterns.DELETE_PATTERN.test(cmd)) return { risk: 'high', reason: '删除命令', allowed: true, requiresApproval: true }
    return { risk: 'medium', reason: 'shell command', allowed: true, requiresApproval: true }
  }

  if (name === 'file_read') {
    try { safePath(args.path, 'read', config); return { risk: 'low', reason: 'file read', allowed: true, requiresApproval: false } }
    catch (e) { return { risk: 'blocked', reason: e.message, allowed: false, requiresApproval: false } }
  }
  if (name === 'file_write') {
    try { safePath(args.path, 'write', config); return { risk: 'medium', reason: 'file write', allowed: true, requiresApproval: true } }
    catch (e) { return { risk: 'blocked', reason: e.message, allowed: false, requiresApproval: false } }
  }

  if (name === 'desktop_observe') return { risk: 'low', reason: 'screenshot', allowed: true, requiresApproval: false }
  if (name === 'desktop_click') return { risk: 'high', reason: 'mouse click', allowed: true, requiresApproval: true }
  if (name === 'desktop_type') {
    if (patterns.CREDENTIAL_PATTERN.test(String(args.text || ''))) return { risk: 'high', reason: 'credentials in keystroke', allowed: true, requiresApproval: true }
    return { risk: 'high', reason: 'keyboard input', allowed: true, requiresApproval: true }
  }

  if (name === 'browser_task') {
    return evaluateBrowserTask(args)  // see §1.4
  }

  if (name === 'code_execute') {
    const code = String(args.code || '')
    if (patterns.CREDENTIAL_PATTERN.test(code) && patterns.EXFIL_PATTERN.test(code)) return { risk: 'blocked', reason: '疑似凭据外传', allowed: false, requiresApproval: false }
    return { risk: 'medium', reason: 'execute code', allowed: true, requiresApproval: true }
  }

  if (name === 'load_skill') return { risk: 'low', reason: 'load skill prompt', allowed: true, requiresApproval: false }

  return { risk: 'blocked', reason: `unknown tool ${name}`, allowed: false, requiresApproval: false }
}

function evaluateBrowserTask({ goal, start_url } = {}) {
  if (start_url) {
    try {
      const u = new URL(start_url)
      if (patterns.URL_PROTOCOLS_BLOCKED.test(u.protocol + ':')) return { risk: 'blocked', reason: `URL scheme blocked: ${u.protocol}`, allowed: false, requiresApproval: false }
      if (patterns.RFC1918_HOST.test(u.hostname)) return { risk: 'blocked', reason: `local/private host blocked: ${u.hostname}`, allowed: false, requiresApproval: false }
    } catch {
      return { risk: 'blocked', reason: 'invalid start_url', allowed: false, requiresApproval: false }
    }
  }
  const g = String(goal || '')
  if (patterns.PAYMENT_INTENT.test(g)) return { risk: 'blocked', reason: '支付意图被阻止', allowed: false, requiresApproval: false }
  if (patterns.ACCOUNT_DESTRUCTION.test(g)) return { risk: 'blocked', reason: '账号破坏意图被阻止', allowed: false, requiresApproval: false }
  if (patterns.PASSWORD_CHANGE.test(g)) return { risk: 'blocked', reason: '改密意图被阻止', allowed: false, requiresApproval: false }
  if (patterns.MONEY_TRANSFER.test(g)) return { risk: 'blocked', reason: '转账意图被阻止', allowed: false, requiresApproval: false }
  return { risk: 'low', reason: 'browser task auto-executes', allowed: true, requiresApproval: false }
}

module.exports = { evaluateToolCall, evaluateBrowserTask }
```

- [ ] Tests: each branch including all auto-block patterns.

### 1.4 toolDispatcher

- [ ] Create `electron/services/toolDispatcher.js`:

```js
const TOOL_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/
const tools = new Map()

function registerTool(def) {
  if (!TOOL_NAME_RE.test(def.name)) throw new Error(`Invalid tool name: ${def.name}`)
  tools.set(def.name, def)
}

function unregisterTool(name) { tools.delete(name) }

function catalog() {
  return [...tools.values()].map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }))
}

async function invoke(call, { signal, config, onEvent } = {}) {
  const t = tools.get(call.function.name)
  if (!t) throw new Error(`Unknown tool: ${call.function.name}`)
  const args = JSON.parse(call.function.arguments || '{}')
  return t.invoke(args, { signal, config, onEvent })
}

function clear() { tools.clear() }

module.exports = { registerTool, unregisterTool, catalog, invoke, clear, TOOL_NAME_RE }
```

- [ ] Tests.

### 1.5 modelRouter.chatWithTools

- [ ] Add to `electron/services/modelRouter.js`. Routes to deepseekProvider.
- [ ] Add `chatWithTools(messages, options)` to `electron/services/models/deepseekProvider.js` per [DeepSeek tool-calling docs](https://api-docs.deepseek.com/guides/tool_calls). Pass `tools` and `tool_choice: 'auto'`. Parse `tool_calls`. Support `signal` for AbortController.
- [ ] Tests.

### 1.6 agentLoop.js

- [ ] Implement per spec §3. Critical:
  - `inFlight: Set<AbortController>` so outer signal aborts everything
  - On `AbortError`, return immediately — no further model call
  - `audit.append` for proposed/completed/cancelled/error each step
- [ ] Tests `electron/__tests__/agent-loop.test.js`:
  - empty tool_calls → returns
  - one tool call → result fed back → next iteration → ends
  - blocked tool → `POLICY_BLOCKED` content, never invoked
  - approval denied → `USER_DENIED` content
  - outer signal abort during tool invocation → tool's signal aborts → loop exits with '操作已取消', no extra model call
  - bad JSON tool_calls → caught, agent message returned
  - MAX_STEPS reached → step-limit message

**Phase 1 commit:** `feat(agent): policyPatterns + pathSafety + toolPolicy + dispatcher + cancellable loop`

---

## Phase 2: Wire oi/uitars + sidecar tokens

### 2.1 sidecarTokens (in-memory)

- [ ] Create `electron/services/sidecarTokens.js` per spec §7.1. **No file persistence.**
- [ ] Modify `electron/services/bridgeSupervisor.js`:
  - Call `sidecarTokens.generateAll()` on `start()`
  - For each spawn, set `SIDECAR_TOKEN: sidecarTokens.get(key)` env
  - Call `sidecarTokens.clear()` on `stop()` (and from Electron `before-quit`)
  - Health check sends `X-AionUi-Token` header

### 2.2 sidecar middleware

- [ ] Modify `server/oi-bridge/index.js` and `server/uitars-bridge/index.js`:
  - On boot, fail-fast if `SIDECAR_TOKEN` env empty → exit 1 with stderr message
  - Add Express middleware:
    ```js
    app.use((req, res, next) => {
      const origin = req.headers.origin
      if (origin && origin !== 'null') return res.status(403).end('forbidden origin')
      if (req.headers['x-aionui-token'] !== process.env.SIDECAR_TOKEN) return res.status(401).end('bad token')
      next()
    })
    ```
- [ ] Tests for the middleware (existing oi/uitars test files extended).

### 2.3 oiTools wrapper

- [ ] Create `electron/services/tools/oiTools.js`:
  - Registers `shell_command`, `file_read`, `file_write`, `code_execute`
  - Each `invoke` runs `toolPolicy.evaluateToolCall` first; if blocked/needs-approval, the dispatcher / agent loop already handled it (this is a defense-in-depth re-check)
  - HTTP POST to `http://127.0.0.1:8756/execute` with `X-AionUi-Token` header
  - signal propagated to fetch
  - Return result text (extracted from response.metadata)

### 2.4 desktopTools wrapper

- [ ] Create `electron/services/tools/desktopTools.js`. Same pattern, port 8765.
- [ ] Smoke test in dev: agent calls `shell_command({command:'dir'})` and gets directory listing.

**Phase 2 commit:** `feat(tools+security): in-memory sidecar tokens; oi/uitars as agent tools`

---

## Phase 3: browser-use sidecar (after Phase 0 spike B passes)

### 3.1 Python sidecar

- [ ] Create `server/browser-use-bridge/`:
  - `requirements.txt` (versions from spike)
  - `main.py` — FastAPI on `127.0.0.1:8780`. Token + Origin middleware (mirror oi-bridge). Endpoints per spec §5.1.
  - Task registry `tasks: dict[str, asyncio.Task]`. `/cancel/<id>` → `task.cancel()` → in `except CancelledError`, `await agent.browser.close()`.
  - Per-step events emitted to SSE: thought, action (click/type/navigate), screenshot (base64 + saved to disk path).
  - Credential redaction: `type` event's text matched against `CREDENTIAL_PATTERN`; matches replaced with `<redacted: N chars>`.

### 3.2 Supervisor

- [ ] Add `'browser-use'` to `bridgeSupervisor.DEFAULTS`:
  - command: `<userData>/python-runtime/.venv/Scripts/python.exe` (or system python3 if user opted in via bootstrap)
  - args: `[main.py, --port, 8780]`
  - env: `SIDECAR_TOKEN`, `BROWSER_USE_MODEL_ENDPOINT`, `BROWSER_USE_MODEL_API_KEY`, `BROWSER_USE_MODEL_NAME`
- [ ] If `<userData>/python-runtime/.bootstrap-complete` missing → state `'pending-bootstrap'`, browser_task tool absent from catalog with explanation.

### 3.3 browserTask tool

- [ ] Create `electron/services/tools/browserTaskTool.js`:
  - Registers `browser_task` ONLY if browser-use sidecar is healthy
  - Generates `taskId` (uuid)
  - Opens SSE stream to `/run-task` with token header
  - For each event:
    - Persist to audit.jsonl with shape from spec §4.2
    - Save screenshot PNG to `<userData>/screenshots/<convId>/step_<n>.png`
    - Forward to onEvent callback for live UI rendering
  - On signal abort: POST `/cancel/<taskId>` (parallel to closing the fetch socket)
  - Return final summary text once `done` event received
- [ ] Tests with mocked SSE.

**Phase 3 commit:** `feat(browser): browser-use sidecar with auto-execute, full audit, hard cancel`

---

## Phase 4: uv-based Python bootstrap

### 4.1 bootstrap service

- [ ] Create `electron/services/bootstrap.js`:
  - `detectStatus()` returns `'ready' | 'partial' | 'missing'` based on:
    - `<userData>/python-runtime/.bootstrap-complete` present
    - `<userData>/python-runtime/uv.exe` runs
    - venv `python.exe` runs
    - browser_use installed (probe `python -c "import browser_use"`)
  - `installAll(onProgress)` performs steps 1-6 from spec §6.1 with retry+exponential backoff per step
  - Hardcoded SHA256 for the pinned uv release zip
  - Returns `{ok:true}` or `{ok:false, step, error}`

### 4.2 BootstrapDialog UI

- [ ] Create `client/src/components/BootstrapDialog.jsx`:
  - Auto-shown on first launch when `detectStatus() !== 'ready'`
  - Manual trigger from Settings → "Browser automation" tier
  - Steps with progress bars
  - Skip button → close, browser_task remains absent
  - Retry button on failure
- [ ] Wire `bootstrap:status` and `bootstrap:install` IPC handlers.

### 4.3 tests

- [ ] `bootstrap.test.js`: detectStatus mocked fs/spawn; installAll mocks step succession + step 4 retry-then-success.

**Phase 4 commit:** `feat(bootstrap): uv-based first-run installer for browser-use`

---

## Phase 5: load_skill tool (existing skills system, no changes to it)

### 5.1 wrap existing loader

- [ ] Create `electron/services/tools/loadSkillTool.js`:
  - Registers `load_skill` in toolDispatcher
  - On invoke, calls existing `electron/skills/loader.js`:`loadSkill({name})` (UNCHANGED)
  - Returns the markdown content as the tool result

### 5.2 Skills panel

- [ ] If `client/src/panels/SkillsPanel.jsx` doesn't exist, create it. Lists `resources/skills/*` directories with their `SKILL.md` summaries. Toggle each for inclusion in the agent's `load_skill` candidates list.
- [ ] If panel exists today, just verify it works with the new tool wrapper.

### 5.3 tests

- [ ] `load-skill-tool.test.js`: registers correctly, invoke calls underlying loader, returns markdown content.

**Phase 5 commit:** `feat(skills): load_skill tool wraps existing prompt skills (unchanged)`

---

## Phase 6: SQLite + agent IPC

### 6.1 better-sqlite3

- [ ] `npm install better-sqlite3`. Native binary via electron-rebuild postinstall.

### 6.2 conversations.js

- [ ] Schema + API per spec §6 (carry from v2).

### 6.3 agent IPC

- [ ] Create `electron/ipc/agent.js`:
  - `agent:run-turn` handler — kicks off agentLoop.runTurn()
  - Streams events via `mainWindow.webContents.send('agent:event', payload)`
  - Also emit legacy `chat:delta` / `chat:tool-*` events for one-release backcompat (reviewer #1's #8)
  - `agent:approve` / `agent:deny` / `agent:abort` IPCs

### 6.4 useChat migration

- [ ] Update `client/src/hooks/useChat.js`:
  - Listen on `agent:event` (new) AND `chat:*` (legacy alias) — prefer agent:event
  - Render `tool` messages (don't filter)
  - Render `assistant` messages with tool_calls including a "调用工具: …" footer

**Phase 6 commit:** `feat(history+ipc): SQLite + agent:event with chat:* legacy alias`

---

## Phase 7: Frontend single Chat surface

### 7.1 conversation sidebar

- [ ] ChatPanel sidebar with list/new/rename/delete using conversations IPCs.

### 7.2 tool call rendering

- [ ] Inline tool cards under assistant messages.
- [ ] Pending-approval card with 批准/拒绝.
- [ ] Live `browser_task` progress card showing current step + URL + thumbnail of latest screenshot.
- [ ] Cancel button always visible during a turn.

### 7.3 Activity log read-only

- [ ] Rename Control Center → Activity log; remove the approval-queue interaction (approval lives in chat).

### 7.4 Welcome dialog updates

- [ ] "Browser automation" tier check changes from "Midscene Bridge connected" to:
  - browser-use bootstrap complete (`detectStatus() === 'ready'`)
  - browser-use sidecar healthy (`/health` returns 200 with token)
- [ ] Bootstrap step in Welcome dialog redirects to BootstrapDialog if needed.

**Phase 7 commit:** `feat(client): single Chat surface, conversations sidebar, live browser progress`

---

## Phase 8: Retire (after Phase 9 PASSes — not before)

- [ ] Delete:
  - `electron/services/actionPlanner.js`
  - `electron/services/visionPlanner.js`
  - `electron/services/midscene/` (entire dir)
  - `electron/__tests__/{action-planner,vision-planner,midscene-adapter,midscene-bootstrap}.test.js`
- [ ] Move `server/midscene-bridge/` → `server/midscene-bridge.deprecated/`. Don't fully remove for one release (rollback path).
- [ ] Remove `midscene` from `bridgeSupervisor.DEFAULTS`.
- [ ] Remove `WEB_NAVIGATE/OBSERVE/CLICK/TYPE/QUERY` from `actionTypes.js`; remove `RUNTIME_NAMES.MIDSCENE`.
- [ ] Remove `webRisk` branch from `actionPolicy.js` (kept for backcompat, no harm but cleanup).
- [ ] Remove midscene from package.json `workspaces` and `extraResources`.
- [ ] Old Execute mode UI: remove tab + ExecutePanel components.
- [ ] Note in PR: legacy `chat:*` IPC events kept for next release; will be removed in vNext.

**Phase 8 commit:** `chore: retire midscene + planner + Execute UI (after v3 acceptance PASS)`

---

## Phase 9: Acceptance — clean Windows VM

- [ ] Provision clean Windows 11 x64 VM with no Python, no Node user state.
- [ ] Install AionUi via NSIS installer.
- [ ] Configure DeepSeek + Doubao API keys via Welcome dialog.
- [ ] Run all 12 §10.1 scenarios + 7 §10.2 failure modes from spec.
- [ ] Append PASS/FAIL with notes to `docs/test-report.md` under `## 2026-05-09 Agent Loop v3 Acceptance`.
- [ ] If anything FAILs → STOP. Surface to human. Phase 8 not entered.
- [ ] If all PASS → push branch, open PR `feat: agent loop v3 with browser-use + uv bootstrap (replaces midscene)`.

---

## Definition of Done

- All 19 acceptance items (12 happy + 7 failure) PASS on clean Windows VM.
- All tests green: `npm test`.
- `npm run build:client` clean.
- `npm run electron:build` produces installer.
- Old code removed (Phase 8).
- README updated:
  - Drop Midscene Bridge Mode mentions
  - Document uv-based bootstrap
  - Skills section unchanged (existing SKILL.md system)
- Sidecar tokens verified in-memory (no `sidecar-tokens.json` written to disk).
- Cancellation verified <2s (Phase 9 #10).
- browser_task verified per-step audit + screenshots saved.
- All 21 reviewer issues addressed (cross-check spec §0.1 + v2 §0.1).
