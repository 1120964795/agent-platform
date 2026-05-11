# Agent Loop v4 Design (final, after 4 review rounds)

- Date: 2026-05-10
- Status: Approved (for codex execution)
- Audience: codex (executor)
- Supersedes: v1 / v2 / v3 / fork-spike-stage-0 (all earlier paths cancelled)
- Project: continues in existing `agent-lite` repo on existing `main` branch (no new repo)

## 0. Why v4 exists

After 4 reviewer rounds + a failed fork spike (UI-TARS-desktop's pnpm
electron install couldn't complete on the user's Windows machine even with
Developer Mode + LongPaths + admin + Defender exclusions), the path is
**self-build** with reviewer feedback fully absorbed.

v4 = v3 architecture + reviewer round 3's 15 patches + concrete grounding in
the actual `agent-lite` codebase (which v3 didn't fully respect).

## 0.1 What changed from v3 (15 patches applied)

| # | v3 mistake | v4 fix |
|---|-----------|--------|
| 1 | Phase 8/9 order ambiguous | Phase 9 acceptance happens BEFORE Phase 8 deletion. Plan section ordering matches execution order. |
| 2 | New `toolDispatcher.js` duplicates existing `electron/tools/index.js` register pattern | **Extend existing registry**, not parallel. New tools register via the same `register({name, description, parameters}, fn)` API. |
| 3 | Tool names invented (`file_read`, `shell_command`) conflict with existing (`read_file`, `write_file`, `run_shell_command`) | **Keep existing verb_noun names**. New tools follow same convention: `observe_screen`, `click_target`, `type_text`, `browser_task`, `load_skill` |
| 4 | "Build chatWithTools in modelRouter" — duplicates existing `electron/services/deepseek.js` which already does normalizeTools + tool_calls parsing | **Use existing deepseek.js's `chat({tools, ...})`**. No parallel implementation. agentLoop calls deepseek.chat with the catalog. |
| 5 | `browser_task` was `risk: low` because no approval | Risk = `medium` (intrinsic), `requiresApproval: false` (UX decision). Audit knows this is autonomous-but-recorded |
| 6 | Browser auto-block was pre-flight only | Add Playwright `page.route()` interception inside the browser sidecar — every navigation/request checked at runtime, not just start_url |
| 7 | localhost/RFC1918 host regex insufficient against DNS rebinding | Browser sidecar Playwright route() checks resolved IP, not just hostname. Reject if final IP matches private/loopback ranges. |
| 8 | Screenshots saved indefinitely with no privacy controls | 7-day retention by default; Settings → Privacy has "Clear all browser screenshots" button; sensitive-domain detector blanks credential fields in saved PNGs |
| 9 | Intent denylist treated as "security" | Reframed as "best-effort guardrails for unintentional misuse, not a security boundary". Documented limits |
| 10 | pathSafety table said file_read blocked outside allowlist; code only blocked system paths | Aligned: file_read allowed broadly within home but blocks system paths; file_write strictly bound to writable-roots |
| 11 | Symlink traversal on non-existent write paths bypassed checks | realpath the PARENT directory, then resolve filename against it. Junction links to system paths now caught. |
| 12 | Claimed uv "hash-locked by default" — overstated | Use explicit `uv pip compile --generate-hashes` to produce `requirements.lock` checked into repo. Bootstrap installs from the lockfile. |
| 13 | Playwright Chromium path implicit | Set `PLAYWRIGHT_BROWSERS_PATH=<userData>/python-runtime/chromium` explicitly in browser sidecar env |
| 14 | Real-site acceptance only | User confirmed: real sites only for human acceptance. v4 honors this. Automated CI tests remain unit-level (mocked); no fixture mode. |
| 15 | Single Chat migration timing unclear | Phase 7.X explicitly drops the Execute mode tab + the `mode === 'execute'` branch in `electron/ipc/chat.js`. Until Phase 7.X, both modes coexist via `agentLoopEnabled` config flag. |

## 1. Existing code to respect

The current `agent-lite` repo already has these working pieces. v4 EXTENDS them, doesn't replace:

| Existing | Purpose | v4 treatment |
|----------|---------|--------------|
| `electron/tools/index.js` | tool registry with `register()`, `execute()`, `getExecutionToolSchemas()` | **EXTEND** — new tools use same register API |
| `electron/tools/{shell,fs-read,fs-write,fs-destructive,env,docs,remember}.js` | existing tool implementations: read_file, write_file, edit_file, create_dir, list_dir, search_files, run_shell_command, delete_path, move_path, get_os_info, which, generate_docx, generate_pptx, remember_user_rule, forget_user_rule | **KEEP, USE AS-IS** |
| `electron/services/deepseek.js` | DeepSeek chat with tools + tool_calls parsing | **USE AS-IS** for agentLoop's model calls |
| `electron/skills/loader.js` + `registry.js` + `resources/skills/*/SKILL.md` | prompt-skill system with `load_skill` tool already registered | **KEEP, USE AS-IS** |
| `electron/security/actionPolicy.js` patterns | INSTALL_PATTERN, DELETE_PATTERN, etc. (currently const, not exported) | **EXTRACT to `policyPatterns.js` and export** (reviewer #7 from round 2). actionPolicy.js re-exports for backcompat. |
| `electron/security/actionBroker.js` | action queue + adapter dispatch | becomes a tool-call execution gate; existing tests adapted |
| `electron/services/openInterpreter/` + `server/oi-bridge/` | OI sidecar (post-Phase-5.5f-fix) | **KEEP** — registered as tools but not as broker adapters |
| `electron/ipc/chat.js` `mode === 'execute'` branch | current chat-with-tools execution path | **REPLACE** with agentLoop call in Phase 7.X |
| `electron/services/midscene/`, `server/midscene-bridge/`, `electron/services/uiTars/`, `server/uitars-bridge/`, `electron/services/{actionPlanner,visionPlanner,taskOrchestrator}.js` | Midscene + UI-TARS bridges + planner+orchestrator | **RETIRE** in Phase 8 (after Phase 9 acceptance) |
| `client/src/panels/ExecutePanel.jsx` (and Execute mode tab) | separate Execute UI surface | **DROP** in Phase 7.X |

**Net: the existing tool/skill/deepseek infrastructure carries forward. We add agent loop + browser + desktop tools on top.**

## 2. Architecture

```
existing electron/ infrastructure (KEEP)
 ├── tools/index.js                        REGISTRY (existing — extended)
 │   ├── existing: read_file, write_file, edit_file, run_shell_command, ...
 │   └── new tools registered:
 │       ├── observe_screen      (uitars-bridge)
 │       ├── click_target        (uitars-bridge)
 │       ├── type_text           (uitars-bridge)
 │       ├── browser_task        (NEW browser sidecar)
 │       └── load_skill          (existing in skills/loader.js)
 ├── services/
 │   ├── deepseek.js                       USE AS-IS for agent's chat-with-tools
 │   ├── agentLoop.js                      NEW — single-turn agent loop
 │   ├── bridgeSupervisor.js               EXTEND — adds browser sidecar
 │   ├── sidecarTokens.js                  NEW — in-memory tokens
 │   ├── conversations.js                  NEW — SQLite history
 │   └── bootstrap.js                      NEW — uv-based browser sidecar setup
 ├── security/
 │   ├── policyPatterns.js                 NEW — extracted regex constants
 │   ├── toolPolicy.js                     NEW — evaluateToolCall + browser pre-flight
 │   ├── pathSafety.js                     NEW — realpath + parent-realpath + Windows allowlist
 │   └── actionPolicy.js                   KEEP — re-exports patterns for backcompat
 ├── skills/loader.js                      USE AS-IS
 └── ipc/chat.js                           REWRITE to call agentLoop in Phase 7.X

new server/browser-bridge/                 NEW Python sidecar
 ├── main.py                               FastAPI on 127.0.0.1:8780; token + Origin gated
 ├── browser_runner.py                     browser-use Agent with cancellation + Playwright route()
 ├── pyproject.toml + requirements.lock    pinned deps with hashes
 └── README.md                             install via uv

retired in Phase 8 (after Phase 9 acceptance):
  electron/services/{actionPlanner,visionPlanner,taskOrchestrator,midscene/,uiTars/}.js
  server/midscene-bridge/
  server/uitars-bridge/  ← actually KEEP if observe_screen tool uses it; review at Phase 8
  client/src/panels/ExecutePanel.jsx
```

## 3. Tool catalog

All names use existing `verb_noun` convention. Names match `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$`.

| Tool | Backend | Risk | Approval | Notes |
|------|---------|------|----------|-------|
| `read_file` | existing fs-read.js | low | no (system path blocked) | KEEP |
| `write_file` | existing fs-write.js | medium | yes (path checked) | KEEP |
| `edit_file` | existing fs-write.js | medium | yes | KEEP |
| `create_dir` | existing fs-write.js | low | no | KEEP |
| `list_dir`, `search_files` | existing fs-read.js | low | no | KEEP |
| `run_shell_command` | existing shell.js | medium | yes (auto-block per policyPatterns) | KEEP, policy enriched |
| `delete_path`, `move_path` | existing fs-destructive.js | high | yes | KEEP |
| `code_execute` | new wrapper around oi-bridge | medium | yes | NEW |
| `observe_screen` | uitars-bridge | low | no | NEW |
| `click_target` | uitars-bridge | high | yes (always) | NEW |
| `type_text` | uitars-bridge | high | yes (high+ for credential text) | NEW |
| `browser_task` | NEW browser sidecar | **medium** | **NO** | autonomous; pre-flight + runtime route() + step audit |
| `load_skill` | existing skills/loader.js | low | no | KEEP |
| `remember_user_rule`, `forget_user_rule` | existing remember.js | low | no | KEEP |
| `get_os_info`, `which` | existing env.js | low | no | KEEP |
| `generate_docx`, `generate_pptx` | existing docs.js | medium | yes | KEEP |

## 4. Agent loop

`electron/services/agentLoop.js`:

```js
const deepseek = require('./deepseek')
const tools = require('../tools')  // existing registry
const { evaluateToolCall } = require('../security/toolPolicy')
const conversations = require('./conversations')

const MAX_STEPS = 30

async function runTurn({ conversationId, userMessage, signal, onEvent }) {
  const history = conversations.loadMessages(conversationId)
  history.push({ role: 'user', content: userMessage })

  const inFlight = new Set()  // AbortControllers for live tool calls
  signal?.addEventListener('abort', () => { for (const ctl of inFlight) ctl.abort() })

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })

    // Use EXISTING deepseek.chat — it already supports tools + parses tool_calls
    const response = await deepseek.chat({
      messages: history,
      tools: tools.getExecutionToolSchemas(),  // existing API
      temperature: 0.1
    })

    history.push({ role: 'assistant', content: response.content || '', tool_calls: response.tool_calls })
    onEvent?.('assistant_message', { content: response.content, toolCalls: response.tool_calls })

    if (!response.tool_calls?.length) break

    for (const call of response.tool_calls) {
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })

      const decision = evaluateToolCall(call.function.name, JSON.parse(call.function.arguments || '{}'))
      audit.append('tool_proposed', { call, decision })

      if (decision.risk === 'blocked') {
        history.push({ role: 'tool', tool_call_id: call.id, content: `POLICY_BLOCKED: ${decision.reason}` })
        onEvent?.('tool_blocked', { call, reason: decision.reason })
        continue
      }

      if (decision.requiresApproval) {
        const ok = await onEvent?.('approval_request', { call, decision })
        if (!ok) {
          history.push({ role: 'tool', tool_call_id: call.id, content: 'USER_DENIED' })
          continue
        }
      }

      const ctl = new AbortController()
      inFlight.add(ctl)
      try {
        const result = await tools.execute(call.function.name, JSON.parse(call.function.arguments || '{}'), { signal: ctl.signal })
        history.push({ role: 'tool', tool_call_id: call.id, content: typeof result === 'string' ? result : JSON.stringify(result) })
        audit.append('tool_completed', { call, result })
      } catch (err) {
        if (err.name === 'AbortError') {
          history.push({ role: 'tool', tool_call_id: call.id, content: 'CANCELLED' })
          conversations.appendMessages(conversationId, history)
          onEvent?.('cancelled')
          return { finalText: '操作已取消' }
        }
        history.push({ role: 'tool', tool_call_id: call.id, content: `ERROR: ${err.message}` })
      } finally {
        inFlight.delete(ctl)
      }
    }
  }

  conversations.appendMessages(conversationId, history)
  return { finalText: history.at(-1)?.content || '已完成' }
}

module.exports = { runTurn }
```

Key reuse: `deepseek.chat({tools})` and `tools.getExecutionToolSchemas()` and `tools.execute()` — all already exist.

## 5. browser_task — autonomous with safety rails

### 5.1 Risk + approval

Risk: **medium** (intrinsic). Approval: **NO** (UX decision per user requirement).

The audit log records every browser_task as `phase: autonomous_executed` so post-hoc review distinguishes autonomous from approved actions.

### 5.2 Pre-flight check (toolPolicy)

Before dispatch, `evaluateToolCall('browser_task', {goal, start_url})` runs the v3 §4.1 denylist:
- start_url scheme in {file, chrome, edge, devtools, javascript, data, about (except about:blank)}
- start_url hostname matches `RFC1918_HOST` regex
- goal text matches `PAYMENT_INTENT`, `ACCOUNT_DESTRUCTION`, `PASSWORD_CHANGE`, `MONEY_TRANSFER`

If any match → `{risk: 'blocked'}`, agent gets POLICY_BLOCKED.

### 5.3 Runtime interception (Playwright route)

Inside `server/browser-bridge/browser_runner.py`, before any browser-use Agent run:

```python
async def install_route_guards(page):
    async def handle_route(route, request):
        url = request.url
        # Resolve final IP (handle DNS rebinding)
        try:
            ip = await resolve_ip(request.url)
            if is_private_ip(ip):
                await route.abort()
                return
        except: pass
        # Reject blocked schemes
        if any(url.startswith(s) for s in ['file:', 'chrome:', 'devtools:', 'about:'] if url != 'about:blank'):
            await route.abort()
            return
        # Reject downloads of executables
        if url.lower().endswith(('.exe', '.msi', '.bat', '.ps1', '.sh')):
            await route.abort()
            return
        await route.continue_()
    await page.route('**/*', handle_route)
```

This catches navigations DURING the task even if the agent gets redirected
or tries to fetch a download. **The pre-flight + route() combination is best-
effort guardrails, not a security boundary** (per reviewer #9 from round 3).

### 5.4 Per-step audit + screenshots

Each browser-use SSE event becomes an audit entry:
```json
{
  "phase": "browser_step",
  "session": "conv_abc",
  "tool_call_id": "call_xyz",
  "step": 7,
  "event_type": "click",
  "url": "<current page url>",
  "target": "<element description>",
  "screenshot_path": "<userData>/browser-screenshots/<convId>/step_7.png",
  "ts": "2026-05-10T..."
}
```

For `event_type == "type"`, the `text` field is redacted to
`<redacted: N chars>` if matched against `CREDENTIAL_PATTERN` from
policyPatterns.js.

### 5.5 Screenshot privacy

Per reviewer #8 from round 3:
- Default retention: **7 days**, then auto-delete
- Settings → Privacy panel: "Clear all browser screenshots now" button
- If page hostname matches a known sensitive domain (banks, government, healthcare — short hardcoded list), screenshots are NOT saved at all (only the action description is audited)

### 5.6 Cancellation

End-to-end:
1. User clicks Stop → frontend sends `agent:abort` IPC → main process aborts agentLoop signal
2. agentLoop's outer signal aborts all in-flight tool ABORT controllers
3. browser_task's tool wrapper:
   - Closes its fetch to the sidecar (signal.abort)
   - Sends `POST /cancel/<taskId>` to sidecar in parallel
4. Sidecar: `task.cancel()` on the asyncio task → in `except CancelledError`, `await agent.browser.close()`
5. agentLoop receives `AbortError`, returns "操作已取消" — does NOT make another model call

Target: <2s from Stop click to chat showing "操作已取消".

## 6. Path safety (v4-fixed)

`electron/security/pathSafety.js`:

```js
const path = require('path')
const fs = require('fs')
const os = require('os')

function getWritableRoots(config) {
  return [
    config.workspace_root,
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'Documents'),
    path.join(os.homedir(), 'Downloads'),
    path.join(os.tmpdir(), 'aionui-temp')
  ].filter(Boolean).map(p => path.resolve(p))
}

function realpathParent(input) {
  // For non-existent files (write target), realpath the PARENT directory.
  // Junction/symlink at the parent level is now caught.
  const resolvedInput = path.resolve(input)
  const parent = path.dirname(resolvedInput)
  let realParent
  try {
    realParent = fs.realpathSync.native(parent)
  } catch {
    // Parent doesn't exist; resolve as best we can
    realParent = parent
  }
  return path.join(realParent, path.basename(resolvedInput))
}

function safePath(input, mode = 'read', config = {}) {
  if (!input || typeof input !== 'string') throw new Error('invalid path')

  let resolved
  if (fs.existsSync(input)) {
    resolved = fs.realpathSync.native(input)
  } else {
    resolved = realpathParent(input)
  }

  // Reject UNC by default (allow only \\?\<drive>: long-path prefix)
  if (resolved.startsWith('\\\\') && !resolved.startsWith('\\\\?\\')) {
    throw new Error(`UNC path blocked: ${resolved}`)
  }
  if (resolved.startsWith('\\\\?\\')) resolved = resolved.slice(4)

  // Reject system paths (read AND write)
  const lower = resolved.toLowerCase()
  if (/^[a-z]:\\windows(\\|$)/.test(lower)) throw new Error('Windows system path blocked')
  if (/^[a-z]:\\program files/.test(lower)) throw new Error('Program Files blocked')
  if (/^[a-z]:\\programdata/.test(lower)) throw new Error('ProgramData blocked')
  if (lower.includes('\\system32\\')) throw new Error('system32 blocked')

  if (mode === 'write') {
    const roots = getWritableRoots(config)
    const ok = roots.some(r => {
      const rl = r.toLowerCase()
      return resolved.toLowerCase() === rl || resolved.toLowerCase().startsWith(rl + path.sep)
    })
    if (!ok) throw new Error(`write outside writable allowlist: ${resolved}`)
  }
  // mode === 'read': allowed broadly within home, only system paths blocked above

  return resolved
}

module.exports = { safePath, getWritableRoots, realpathParent }
```

## 7. Browser sidecar (Python via uv)

### 7.1 Lockfile-based install

`server/browser-bridge/`:
- `pyproject.toml` declaring deps
- `requirements.lock` generated via `uv pip compile pyproject.toml --generate-hashes -o requirements.lock`
- Bootstrap installs from this lockfile, not from the loose deps

### 7.2 Bootstrap (uv-based with explicit Playwright path)

```bash
# Phase 4 bootstrap script:
uv venv "<userData>/python-runtime/.venv" --python 3.12
uv pip install --python "<venv>/python.exe" -r server/browser-bridge/requirements.lock
PLAYWRIGHT_BROWSERS_PATH="<userData>/python-runtime/chromium" \
  "<venv>/python.exe" -m playwright install chromium --with-deps
```

`PLAYWRIGHT_BROWSERS_PATH` is set in supervisor env when spawning the browser sidecar — **explicit, not implicit**.

## 8. Acceptance — real sites, no fixture

(Per user direction; reviewer round 3 #14 noted CI tests need fixtures, but
the user has not asked for CI yet; can add later.)

12 happy paths + 7 failure modes per v3 spec §10. Real sites: example.com,
docs.python.org. No login flows.

## 9. Phase ordering (corrected)

```
Phase 0  Spike (3 throwaway scripts)            1 day
Phase 1  policyPatterns + pathSafety + toolPolicy + agentLoop (uses existing tools/index.js + deepseek.js)   2 days
Phase 2  uitars-bridge tools (observe/click/type) + sidecar tokens   1 day
Phase 3  browser sidecar (Python, with Playwright route())   2 days
Phase 4  uv bootstrap (with lockfile)           1.5 days
Phase 5  conversations.js (SQLite)              0.5 day
Phase 6  agent IPC (agent:event with chat:* legacy alias)   1 day
Phase 7  Frontend single Chat — coexists with old via flag  2 days
   7.X  cutover: drop ExecutePanel, replace mode==='execute' branch, remove the Execute tab
Phase 8  N/A — see Phase 9 first
Phase 9  Acceptance on clean Windows VM (real sites)  0.5 day
Phase 8  Retire midscene/uiTars/planner — only after Phase 9 PASS  0.5 day
                                              ─────────
                                              ~13 days
```

## 10. Red lines

1. **Reuse `electron/tools/index.js` registry**, do NOT write a parallel `toolDispatcher.js`
2. **Reuse `electron/services/deepseek.js`'s `chat({tools})`**, do NOT write parallel chatWithTools
3. **Tool names follow existing verb_noun convention** (`read_file`, not `file_read`)
4. **Phase 9 acceptance happens BEFORE Phase 8 deletion**
5. **browser_task = medium risk + no approval** (not low risk)
6. **Playwright route() interception is mandatory** (not just pre-flight)
7. **Path safety realpath the PARENT for non-existent paths**
8. **uv lockfile mandatory** — `requirements.lock` checked into repo
9. **PLAYWRIGHT_BROWSERS_PATH set explicitly** in browser sidecar env
10. **sidecar tokens in memory only**, never on disk
11. **Cancellation actually kills**: AbortController + `/cancel/:taskId` + `task.cancel()` + `browser.close()`. After cancel, NO further model call same turn.
12. **Existing SKILL.md prompt skills unchanged** — `electron/skills/loader.js` is not modified
13. **Old code retired only after Phase 9 PASS**, with one-release deprecation period for the legacy IPC events
