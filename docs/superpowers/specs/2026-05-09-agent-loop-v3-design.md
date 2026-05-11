# Agent Loop + browser-use Design (v3 — final)

- Date: 2026-05-09
- Status: Approved (for codex execution)
- Audience: codex (executor)
- Supersedes: v1 + v2 (this is the third iteration after two rounds of review)

## 0. Background + what changed in v3

v1 was a sketch. v2 hardened it after reviewer #1 (9 issues). v3 hardens
again after reviewer #2 (12 issues). All 21 unique issues across both
reviews are absorbed.

The user's confirmed pillars + new constraints:

- **Single Chat surface** (drop Chat/Execute split)
- **Native tool calling** on DeepSeek-V4
- **Browser tasks DO NOT require per-call approval** (auto-block + full audit + live progress + cancellable)
- **Existing SKILL.md prompt-skill system stays unchanged** (no new executable-plugin system in v3)
- **uv** (Astral) for Python bootstrap (not embeddable Python + get-pip)
- **Real-world acceptance**, no test fixture mode

## 0.1 What v3 fixes vs v2

| v2 issue | v3 fix |
|----------|--------|
| browser_task always-approval contradicts product req | browser_task is **auto-execute, low-friction**, but pre-flight URL/intent block + per-step audit + always-cancellable |
| browser-use internal steps invisible | All SSE events (thought/action/screenshot/URL) streamed into chat AND persisted to audit.jsonl with screenshots saved to disk |
| No browser auto-block rules | Concrete denylist: dangerous URL schemes, RFC1918/localhost/link-local, payment/account-deletion/password-change URL patterns |
| Skills system clashes with existing SKILL.md | **Drop new executable-plugin design entirely**. Agent loop reuses existing `load_skill` tool from `electron/skills/loader.js`. v3 changes nothing about prompt skills |
| "subprocess sandbox" was a fiction | Removed claim. Only prompt skills exist; no subprocess plugins in v3 |
| Path safety via regex | `path.resolve` + `fs.realpathSync.native` + writable-root allowlist (workspace_root, Desktop, Documents, app data); UNC/long-path/symlink handling explicit |
| actionPolicy constants not exported | New module `electron/security/policyPatterns.js` extracts and exports the regex set; `actionPolicy.js` re-exports for backcompat |
| Shell rules not Windows-aware | Adds: PowerShell aliases (`gci`, `rm`, `del`, `ls`), `cmd /c` wrappers, `rd /s /q`, env-var expansion, `Invoke-Expression`, base64-encoded payloads |
| embeddable Python + get-pip fragile | uv (single binary, hash-locked, retries, proxy-tolerant) downloads + installs browser-use into a venv at `<userData>/python-runtime/` |
| Persistent token file unnecessary | Tokens are in-memory only. Generated at supervisor.start(), passed via env to children, never written to disk |
| Cancellation only outer-loop signal check | End-to-end abort: outer signal → fetch AbortController → sidecar `/cancel/:taskId` → `task.cancel()` + `browser.close()` for browser-use, `kill('SIGKILL')` for shell/code subprocesses, AbortError propagated to fetch caller |
| Acceptance uses flaky real sites with login | Real sites only, but stable ones: example.com, docs.python.org, MDN. Login flows excluded entirely |

## 1. Architecture (final)

```
Electron shell (本地 exe)
 ├── React frontend
 │     - Chat panel (single surface; conversation sidebar; tool cards inline)
 │     - Settings (existing + skills toggle pane = list of SKILL.md skills)
 │     - Activity log (renamed Control Center; passive audit feed)
 │     - Bootstrap dialog (first-run uv + browser-use installer)
 │
 ├── Main-process services
 │     - agentLoop.js                  one-turn agent with cancellable tool dispatch
 │     - toolDispatcher.js             registry + invoke (validates names, routes)
 │     - tools/                        per-tool wrappers
 │         oiTools.js                  shell_command, file_read, file_write, code_execute
 │         desktopTools.js             desktop_observe, desktop_click, desktop_type
 │         browserTaskTool.js          browser_task — auto-execute, no approval
 │         loadSkillTool.js            load_skill — wraps existing electron/skills/loader.js (UNCHANGED)
 │     - security/policyPatterns.js    NEW — exported regex constants
 │     - security/toolPolicy.js        NEW — evaluateToolCall, browser auto-block list
 │     - security/pathSafety.js        NEW — realpath + writable-root allowlist
 │     - conversations.js              SQLite history
 │     - bootstrap.js                  uv-based Python bootstrap
 │     - sidecarTokens.js              in-memory only (no disk)
 │     - existing: bridgeSupervisor (manages 3 sidecars: oi, uitars, browser-use)
 │     - existing: skills/loader.js + skills/registry.js (UNCHANGED)
 │
 ├── Sidecars (token + Origin gated)
 │     - server/oi-bridge/             kept; +token middleware
 │     - server/uitars-bridge/         kept; +token middleware
 │     - server/browser-use-bridge/    NEW Python (run by uv-managed venv)
 │     - server/midscene-bridge/       RETIRED in Phase 8 only
 │
 └── Storage
       <userData>/agentdev-lite/agentdev-lite/data/
         - conversations.db (NEW)
         - audit.jsonl (existing)
         - config.json (existing)
       <userData>/agentdev-lite/python-runtime/  (NEW; uv-created venv)
       <userData>/agentdev-lite/screenshots/     (NEW; browser_task per-step PNGs)
```

## 2. Tool catalog

All names match `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$`. No dots.

| Tool | Backend | Default risk | Approval? | Notes |
|------|---------|--------------|-----------|-------|
| `browser_task` | browser-use sidecar | low (auto) | **NO** | Pre-flight URL/intent block, full per-step audit |
| `desktop_observe` | uitars-bridge | low | no | Requires `uiTarsScreenAuthorized` |
| `desktop_click` | uitars-bridge | high | yes | Always confirm |
| `desktop_type` | uitars-bridge | high | yes (auto-blocked if text matches credential pattern) | |
| `shell_command` | oi-bridge | medium | yes (auto-blocked for FORMAT/SECURITY-DISABLE/HIDDEN/UNBOUNDED-DELETE) | |
| `file_read` | oi-bridge | low | no (auto-blocked outside writable-root allowlist) | |
| `file_write` | oi-bridge | medium | yes (auto-blocked outside writable-root allowlist) | |
| `code_execute` | oi-bridge | medium | yes (auto-blocked for credential-exfiltration patterns) | |
| `load_skill` | electron/skills/loader.js | low | no | UNCHANGED — invokes existing SKILL.md prompt skill |

## 3. Agent loop (cancellation-correct)

```
async function runTurn({conversationId, userMessage, signal, onEvent}):
  history = conversations.load(conversationId)
  history.append({role:'user', content:userMessage})

  // Track every in-flight tool call so signal abort kills them all
  inFlight = new Set()
  signal.addEventListener('abort', () => {
    for (const ctl of inFlight) ctl.abort('user-cancelled')
  })

  for step in 1..30:
    if signal.aborted: throw new AbortError()
    response = await modelRouter.chatWithTools({history, tools: dispatcher.catalog(), signal})
    history.append({role:'assistant', content:response.content, tool_calls:response.tool_calls})
    onEvent('assistant_message', ...)

    if !response.tool_calls?.length: break

    for call in response.tool_calls:
      if signal.aborted: throw new AbortError()
      decision = toolPolicy.evaluateToolCall(call.name, call.args, ctx)
      audit.append('tool_proposed', {call, decision})

      if decision.risk === 'blocked':
        history.append({role:'tool', tool_call_id:call.id, content:`POLICY_BLOCKED: ${decision.reason}`})
        onEvent('tool_blocked', {call, reason: decision.reason})
        continue

      if decision.requiresApproval:
        approved = await ui.requestApproval(call, decision)
        if !approved:
          history.append({role:'tool', tool_call_id:call.id, content:'USER_DENIED'})
          continue

      ctl = new AbortController()
      inFlight.add(ctl)
      try:
        result = await dispatcher.invoke(call, {signal: ctl.signal})
        audit.append('tool_completed', {call, result, decision})
        history.append({role:'tool', tool_call_id:call.id, content:result})
      catch err if err.name === 'AbortError':
        history.append({role:'tool', tool_call_id:call.id, content:'CANCELLED'})
        audit.append('tool_cancelled', {call})
        // After cancel, exit the step loop entirely — don't proceed to next model call
        conversations.append(conversationId, history.diff)
        onEvent('cancelled')
        return {finalText: '操作已取消'}
      catch err:
        history.append({role:'tool', tool_call_id:call.id, content:`ERROR: ${err.message}`})
        audit.append('tool_error', {call, error: err.message})
      finally:
        inFlight.delete(ctl)

  conversations.append(conversationId, history.diff)
  return {finalText: response.content || '已完成'}
```

Critical invariants:
- **After cancellation, no further model call happens.** The function returns immediately. (v2 only checked signal between calls and could continue.)
- **Every tool call has its own AbortController.** When outer signal aborts, all in-flight controllers fire.
- **Outer signal is wired to fetch.signal** for HTTP calls, which propagates to sidecar via socket close.
- **Subprocess kills on signal abort.** oi-bridge child processes get SIGKILL; browser-use sidecar's task.cancel() closes the browser.

## 4. browser_task: auto-execute with safety rails

### 4.1 No approval, but pre-flight policy

`evaluateBrowserTask({goal, start_url})` runs **before** the call dispatches:

**Auto-block (return `{risk: 'blocked'}`)**:
- start_url scheme is one of: `file:`, `chrome:`, `chrome-extension:`, `edge:`, `devtools:`, `about:` (except `about:blank`), `javascript:`, `data:`
- start_url host is in: `localhost`, `127.0.0.0/8`, `::1`, `0.0.0.0`, `169.254.0.0/16` (link-local), RFC1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
- goal text matches one of:
  - `/(checkout|pay(ment)?|paypal|alipay|wechat[-_]?pay|order)\b/i`
  - `/(delete|close|cancel)[-_\s]?(account|profile)/i`
  - `/(change|reset|update)[-_\s]?password/i`
  - `/(transfer|wire|send)\s+(money|fund|btc|eth)/i`
  - `/credit\s*card|银行卡|信用卡|支付密码/`

**Auto-allow** (`{risk: 'low', allowed: true}`): everything else.

This is **denylist**, not allowlist — most tasks pass. The list catches the
obvious pitfalls. `goal` is the user's natural-language description; if they
say "去淘宝下单" the regex catches "下单"-equivalent and stops.

### 4.2 Every step audited

browser-use sidecar emits SSE events. Each event is captured by AionUi as:

```json
{
  "ts": "2026-05-09T20:00:00Z",
  "session": "conv_abc",
  "tool_call_id": "call_xyz",
  "phase": "browser_step",
  "step": 7,
  "event_type": "click",
  "url": "https://example.com/some-page",
  "target_description": "the 'Submit' button below the form",
  "screenshot_path": "<userData>/screenshots/conv_abc/step_7.png",
  "agent_thought": "I should submit the form now",
  "result": "ok"
}
```

For `event_type === 'type'`, the `text` field is captured **except** when it
matches the credential regex from `policyPatterns.js` — then it's redacted
to `<redacted: 12 chars>`.

Screenshots saved to `<userData>/screenshots/<convId>/step_<n>.png` so the
user can review what AionUi actually saw at each step.

### 4.3 Live progress in chat

The agent's `onEvent('browser_progress', {step, action, url})` callback
fires for every browser-use SSE event. Frontend renders a live-updating
card under the `browser_task` tool call showing:

- Current step number
- Current URL (truncated)
- Latest action description ("Clicking 'Submit' button")
- Thumbnail of latest screenshot
- "Cancel" button (always visible)

### 4.4 Cancellation that actually works

Click Cancel → frontend sends `agent:abort` IPC → main process aborts
agentLoop's signal → propagates to:
1. fetch to `/run-task` (closes socket; sidecar's stream consumer raises CancelledError)
2. Direct call to sidecar `POST /cancel/<taskId>` (kills the asyncio task explicitly, even if socket is sluggish)
3. Sidecar's task.cancel() → browser-use Agent's run task is cancelled → `browser.close()` is called in `except CancelledError`
4. agentLoop returns `'操作已取消'` to user without making another model call

End-to-end target: <2 seconds from Cancel click to chat showing "已取消".

## 5. Skills (existing system, unchanged)

The existing `electron/skills/loader.js` exposes `load_skill({name})` which
loads a SKILL.md file's content into the agent's context. v3 makes ONE
change: `load_skill` is registered as a tool in toolDispatcher, agent loop
sees it in its catalog. Skill listing/install UI in Settings is unchanged.

**No executable plugins in v3.** No skill.json. No subprocess sandboxing
claims. The Skill panel just lists `resources/skills/*/SKILL.md` files and
lets user toggle which ones the agent's `load_skill` tool can see.

## 6. uv-based Python bootstrap

### 6.1 Bootstrap flow

On first launch (`<userData>/python-runtime/.bootstrap-complete` absent),
on user opening Welcome dialog OR triggering a `browser_task`:

1. **Detect uv**: `where uv` (Windows) or `which uv`. If present + version ≥0.4 → use it.
2. **Otherwise download uv**:
   - URL: `https://github.com/astral-sh/uv/releases/download/<pinned>/uv-x86_64-pc-windows-msvc.zip`
   - Hardcoded SHA256 in source
   - Extract to `<userData>/python-runtime/uv.exe`
3. **Create venv**: `uv venv <userData>/python-runtime/.venv --python 3.12`
   - uv handles Python download/install if needed; user doesn't need a system Python
4. **Install browser-use + deps**:
   ```
   uv pip install --python <venv-python> \
     browser-use==<pinned> \
     langchain-openai==<pinned>
   ```
5. **Install Playwright Chromium**:
   ```
   <venv-python> -m playwright install chromium --with-deps
   ```
6. **Mark complete**: write `<userData>/python-runtime/.bootstrap-complete` with `{ts, uv_version, browser_use_version}`.

### 6.2 Failure handling

Each step has retry (3x) + exponential backoff. Network errors fall through
to user with actionable error: "下载 uv 失败：{network/cert/proxy 提示}。
检查 Settings → Network 中的代理设置后重试。"

Skip is allowed: user dismisses dialog, AionUi keeps working without
`browser_task` (tool absent from catalog with reason "browser-use sidecar
not available — bootstrap to install").

### 6.3 Why uv

- Single binary (~10MB vs Python 30MB+pip)
- Hash-locked installs by default (deterministic)
- 10-100× faster than pip
- Resolves dependency conflicts more cleanly
- Better proxy/cert handling on enterprise networks
- Active project from Astral; widely used

## 7. Sidecar security

### 7.1 In-memory tokens (no disk)

```js
// electron/services/sidecarTokens.js
const crypto = require('crypto')
let tokens = null

function generateAll() {
  tokens = {
    oi:           crypto.randomBytes(32).toString('base64url'),
    uitars:       crypto.randomBytes(32).toString('base64url'),
    'browser-use': crypto.randomBytes(32).toString('base64url')
  }
}
function get(key) { return tokens?.[key] }
function clear() { tokens = null }  // on app quit

module.exports = { generateAll, get, clear }
```

Supervisor calls `generateAll()` on startup. Spawns each sidecar with
`SIDECAR_TOKEN=<token>` env. AionUi's HTTP calls include
`X-AionUi-Token: <token>` header.

**No file persistence.** Tokens live in main-process memory only. On main
process death, tokens are gone — sidecars die with main (already happens
via `before-quit`).

### 7.2 Origin validation

Each sidecar's middleware:
```js
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && origin !== 'null') return res.status(403).end('forbidden origin')
  if (req.headers['x-aionui-token'] !== process.env.SIDECAR_TOKEN) return res.status(401).end('bad token')
  next()
})
```

Origin: rejects ANY value except `null`/empty (Electron's IPC fetches send
no Origin; browser pages would send their domain → blocked).

This stops:
- DNS rebinding attacks (browser page tricked into hitting localhost)
- Same-user other process probing localhost (no token = 401)

It does NOT stop:
- Same-user processes that read AionUi's main-process memory (they could
  extract the token). For that we'd need OS-level isolation; explicit
  non-goal in v3.

## 8. Path safety

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

function safePath(input, mode = 'read', config) {
  if (!input || typeof input !== 'string') throw new Error('invalid path')

  // Resolve symbolic links + UNC + long-path prefix
  let resolved
  try {
    resolved = fs.realpathSync.native(path.resolve(input))
  } catch {
    // Path doesn't exist yet (e.g., for write); resolve without realpath
    resolved = path.resolve(input)
  }

  // Reject UNC by default
  if (resolved.startsWith('\\\\') && !resolved.startsWith('\\\\?\\')) {
    throw new Error(`UNC paths blocked: ${resolved}`)
  }

  // Strip Windows long-path prefix for comparison
  if (resolved.startsWith('\\\\?\\')) resolved = resolved.slice(4)

  // Reject system paths
  const lower = resolved.toLowerCase()
  if (lower.match(/^[a-z]:\\windows(\\|$)/)) throw new Error('system path blocked')
  if (lower.match(/^[a-z]:\\program files/)) throw new Error('system path blocked')
  if (lower.match(/^[a-z]:\\programdata/)) throw new Error('system path blocked')
  if (lower.includes('\\system32\\')) throw new Error('system32 blocked')

  if (mode === 'write') {
    const roots = getWritableRoots(config)
    const ok = roots.some(r => resolved.toLowerCase().startsWith(r.toLowerCase() + path.sep) || resolved.toLowerCase() === r.toLowerCase())
    if (!ok) throw new Error(`write outside allowlist: ${resolved}`)
  }

  return resolved
}

module.exports = { safePath, getWritableRoots }
```

Used by `file_read`/`file_write`/`code_execute` tools before invoking
oi-bridge. Throws → tool returns `POLICY_BLOCKED` to agent.

## 9. policyPatterns.js (extracted)

`electron/security/policyPatterns.js`:

```js
// Centralized regex constants. actionPolicy.js continues to use these and
// re-exports for backcompat. New tool policy uses them directly.
exports.INSTALL_PATTERN = /\b(npm|pnpm|yarn|pip|pip3|uv|winget|choco|scoop)\s+(install|add|i)\b|\bsetup\.exe\b|\bmsiexec\b/i
exports.DELETE_PATTERN = /\b(rm|del|erase|rd|rmdir|remove-item|ri)\b/i
exports.FORMAT_PATTERN = /\b(format|diskpart|mkfs|dd)\b/i
exports.SECURITY_DISABLE_PATTERN = /\b(Set-MpPreference|DisableRealtimeMonitoring|Add-MpPreference|netsh\s+advfirewall|sc\s+stop|Stop-Service|disable-windowsoptionalfeature)\b/i
exports.CREDENTIAL_PATTERN = /\b(api[_-]?key|secret|token|password|passwd|credential|authorization|bearer)\b/i
exports.EXFIL_PATTERN = /\b(curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod|fetch|axios|requests\.)\b/i
exports.HIDDEN_PATTERN = /\b(-WindowStyle\s+Hidden|Start-Process\b.*\bHidden\b|nohup\b|setsid\b|schtasks\s+\/create|Start-Job\b)\b/i
exports.UNBOUNDED_DELETE_PATTERN = /\b(rm\s+(-[a-z]*r[a-z]*f|-rf|-fr)\s+([\\/]|\.|\*)|del\s+\/s\s+\/q\s+([A-Z]:\\|\\|\*)|remove-item\b.*\b-recurse\b.*\b-force\b.*([A-Z]:\\|\\|\*)|rd\s+\/s\s+\/q\s+([A-Z]:\\|\\|\*))\b/i

// New v3 patterns — Windows-aware shell coverage
exports.PS_INVOKE_EXPRESSION = /\b(Invoke-Expression|iex|cmd\s+\/c\s|powershell\s+-encodedcommand|FromBase64String)\b/i
exports.URL_PROTOCOLS_BLOCKED = /^(file|chrome|chrome-extension|edge|devtools|javascript|data|about):/i
exports.RFC1918_HOST = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|0\.0\.0\.0|::1|localhost)/i
exports.PAYMENT_INTENT = /(checkout|pay(ment)?|paypal|alipay|wechat[-_]?pay|order|下单|付款|支付)\b/i
exports.ACCOUNT_DESTRUCTION = /(delete|close|cancel|删除|注销|关闭)[-_\s]?(account|profile|账号|账户)/i
exports.PASSWORD_CHANGE = /(change|reset|update|修改|重置|更改)[-_\s]?password|密码/i
exports.MONEY_TRANSFER = /(transfer|wire|send|转账|汇款)\s+(money|fund|btc|eth|资金|钱)/i
```

`actionPolicy.js` is updated to `require('./policyPatterns')` and re-export
the originals — no breaking change to today's call sites.

## 10. Acceptance — real-world, no fixture mode

Per user direction: real sites, accept some flakiness, design around it
(stable static sites, retry semantics, screenshot-only validation where
possible).

### 10.1 Required passes

1. **No-tool chat**: "中国地质大学有几个校区？" — answers without tool calls.
2. **Pure shell**: "在桌面创建 hello.txt 写入 hello world" — `file_write` (medium, requires approval) → user approves → file created.
3. **Multi-tool**: "创建 hello.txt 写入 hello，然后读出来" — `file_write` then `file_read` → result text matches.
4. **Browser stable site**: "用浏览器打开 https://example.com 告诉我页面标题" — uses [example.com (IANA-managed test domain, intentionally stable)](https://example.com) → result text contains "Example Domain".
5. **Browser query**: "查询 https://docs.python.org/3/library/os.html 中 os.getcwd 的描述" — model uses `browser_task` to navigate + extract text → response contains a short description from MDN-like content.
6. **Skill load**: "use the file-explorer skill to list my downloads" — `load_skill('file-explorer')` invoked, skill content loaded, agent uses it.
7. **Auto-block (shell)**: "运行 `Remove-Item -Recurse -Force C:\\`" — policy blocks, agent reports refusal.
8. **Auto-block (browser)**: "用浏览器去 alipay.com/checkout 付钱" — pre-flight blocks `PAYMENT_INTENT`, agent reports refusal.
9. **Auto-block (browser scheme)**: "用浏览器打开 file:///C:/Windows/win.ini" — pre-flight blocks `URL_PROTOCOLS_BLOCKED`.
10. **Cancellation**: ask for a long browser task, click Stop within 5s, chat shows "操作已取消" within 2s.
11. **History persistence**: have a 5-message chat with mixed tools, restart AionUi, the conversation reloads from the sidebar.
12. **Bootstrap first-run**: clean Windows VM, no Python, first launch shows BootstrapDialog, install completes, browser_task becomes available.

### 10.2 Failure modes (graceful degradation required)

A. browser-use sidecar killed mid-task → fetch error caught, agent reports failure, no infinite loop.
B. DeepSeek returns malformed `tool_calls` JSON → caught, agent message returned ("我没法解析这个工具调用，请重新描述需求").
C. Bootstrap dismissed → app works without `browser_task`; trying to use it results in graceful "browser_task 未可用，请先完成 Settings 中的浏览器自动化设置".
D. User denies an approval → tool returns `USER_DENIED`, agent moves on or reports.
E. Path traversal: `file_read("..\\..\\Windows\\System32\\config\\SAM")` → blocked.
F. Sidecar token mismatch (e.g., race during restart) → 401, fetch wrapper retries once with refreshed token; if still 401, agent reports tool unavailable.
G. Network down during `browser_task` → browser-use raises ConnectionError, sidecar emits `error` event, agent reports failure.

### 10.3 Acknowledged flakiness

Per user direction, real-site scenarios accept that:
- Tests #4/#5 may fail if example.com or docs.python.org is unreachable (rare but possible). Re-run is the remedy; we don't add fixture-mode workarounds.
- Test #5's content extraction depends on Doubao's reading of the actual page. Allow ≥1 of 3 runs to PASS.

## 11. Migration order (Phase plan)

```
Phase 0  Spike (3 throwaway scripts: tool calling, browser-use, sidecar auth)
Phase 1  Core agent loop + dispatcher + policyPatterns + toolPolicy + pathSafety + tests
Phase 2  Wire oi/uitars as tools + sidecar tokens (in-memory) + Origin gate
Phase 3  browser-use sidecar (after Phase 0 Spike B PASS) — auto-execute, full audit, real cancel
Phase 4  uv-based Python bootstrap + BootstrapDialog
Phase 5  load_skill tool wraps existing skills/loader.js (UNCHANGED)
Phase 6  SQLite conversations + agent IPC with chat:* legacy alias
Phase 7  Frontend: single Chat surface, conversation sidebar, tool cards, live browser progress
Phase 8  Retire actionPlanner / visionPlanner / midscene/* (after Phase 9 PASS)
Phase 9  Acceptance (§10.1 + §10.2) on clean Windows VM
```

Phase 0-7 ship alongside old code (feature-flagged: `agentLoopEnabled` in store). Phase 8 deletes only after Phase 9 verifies. Backout = revert Phase 8.

## 12. Red lines

1. Tool names: `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$`. No dots.
2. Sidecars require `X-AionUi-Token` (in-memory tokens, never on disk).
3. API keys via env only; never in request bodies.
4. **Skills are PROMPT skills only** in v3. No executable plugins. Existing `electron/skills/loader.js` is not modified.
5. Phase 8 (deletion) only after Phase 9 (acceptance) PASSes on clean VM.
6. `browser_task` does NOT require approval, but pre-flight URL/intent block is mandatory; per-step audit + screenshots are mandatory.
7. Cancellation actually kills subprocesses + closes browser; after cancel, NO further model call in the same turn.
8. Path safety uses `realpath` + writable-root allowlist, not regex traversal checks.
9. uv is the bootstrap tool; no embeddable Python + get-pip path in v3.
10. Acceptance on real sites (no fixture mode); flakiness mitigated by stable choice of test sites.
