# Agent Loop + browser-use Design (v2 — Reviewer-Hardened)

- Date: 2026-05-09
- Status: Approved (for codex execution)
- Audience: codex (executor)
- Supersedes: `2026-05-09-agent-loop-with-browser-use-design.md` (v1; v1's design was right but lacked engineering rigor — see §0.1 for what changed)

## 0. Background

Today's AionUi splits Chat/Execute. The plan-then-execute split forces the
model to commit to actions before seeing results, which fails in dense UIs
(see today's logs: 学习通 sidebar 任务/章节 mis-clicked, 继续 loops).
Modern agents (Claude Code, Codex, Operator) use a single chat surface with
**native tool calling** — the model loops, deciding when to take a screenshot,
click, read a file, all as tool calls.

This rebuilds AionUi around that pattern, with seven product pillars
preserved: 屏幕监视 / 鼠键控制 / skill / 浏览器自动化 / 本地资源 / 历史对话 / 本地 exe.

## 0.1 What changed from v1

A reviewer audit caught 9 real issues in v1. v2 fixes each:

| Issue | v1 | v2 |
|-------|----|----|
| Tool names with dots violate `^[a-zA-Z0-9_-]{1,64}$` | `desktop.observe` | `desktop_observe`, `shell_command`, `file_read`, `skill_<n>` |
| Policy too coarse | `policy.requiresApproval(call)` | `policy.evaluateToolCall(name, args, context)` returns `{risk, reason, allowed}` with content-aware checks |
| "subprocess sandbox" is fiction | called it sandboxing | acknowledged as "user-permission code"; skills require explicit per-permission grants in manifest, default-disabled, no install-from-URL |
| Localhost not a security boundary | bound 127.0.0.1, no auth | per-sidecar random token + `X-AionUi-Token` header + `Origin` validation; API keys via env only, never in request body |
| browser-use integration assumed | "browser-use bundles its own Chromium" | mandatory Phase 0 spike; Chromium via `playwright install chromium` (not bundled with browser-use); pin exact versions |
| Cancellation incomplete | check `signal` between tool calls | per-task `AbortController` registry, `AbortSignal` propagated to fetch, sidecar `/cancel/:taskId` actually kills subprocess |
| Frontend event protocol drift | renamed to `agent:event`, no migration | explicit migration layer; kept `chat:*` channels as aliases until next release |
| Acceptance not testable | "you get the idea", login-dependent | 10 deterministic scenarios + 5 failure modes |
| Python not bundled | "user installs Python" | first-run bootstrap auto-downloads embeddable Python + `pip install browser-use` + `playwright install chromium` with progress UI |

## 1. End-state architecture

```
Electron shell (本地 exe)
 ├── React frontend (single Chat surface, conversation sidebar, Settings, Skills panel, Activity log)
 │
 ├── Main-process services
 │     - agentLoop.js (NEW)              core agent
 │     - toolDispatcher.js (NEW)         registry + invoke (with permission gate)
 │     - skillRegistry.js (NEW)          loads skills from <userData>/skills/
 │     - conversations.js (NEW)          SQLite-backed history
 │     - bootstrap.js (NEW)              first-run Python+browser-use installer
 │     - sidecarTokens.js (NEW)          per-sidecar localhost auth tokens
 │     - existing: store, security/{actionPolicy,actionBroker} (broker becomes
 │       the per-tool-call approval gate, not an action queue)
 │     - existing: bridgeSupervisor (now manages browser-use + uitars + oi)
 │     - retired: actionPlanner, visionPlanner, midscene/* (deleted in Phase 8)
 │
 ├── Sidecars (each behind a localhost token)
 │     - server/browser-use-bridge/  (NEW Python — FastAPI + browser-use)
 │     - server/uitars-bridge/       (kept)
 │     - server/oi-bridge/           (kept)
 │     - server/midscene-bridge/     (RETIRED in Phase 8)
 │
 └── Storage
       <userData>/agentdev-lite/agentdev-lite/data/
         - conversations.db (NEW SQLite)
         - sidecar-tokens.json (NEW, mode 0600)
         - audit.jsonl (existing)
         - config.json (existing)
       <userData>/agentdev-lite/python-runtime/   (NEW, populated by bootstrap)
         - python.exe                  (embeddable Python distribution)
         - Lib/site-packages/...        (browser-use, langchain-openai, playwright)
         - chromium/                    (Playwright's Chromium)
       <userData>/agentdev-lite/skills/           (NEW, user-installed skills)
```

## 2. Agent loop

```
async function runTurn({conversationId, userMessage, signal, onEvent}) {
  history = conversations.load(conversationId)
  history.append({role:'user', content:userMessage})

  abortRegistry = new AbortRegistry()
  signal.addEventListener('abort', () => abortRegistry.abortAll())

  for step in 1..MAX_STEPS:
    if signal.aborted: throw 'aborted'
    response = model.chatWithTools({messages:history, tools:dispatcher.catalog(), signal})
    history.append({role:'assistant', content:response.content, tool_calls:response.tool_calls})
    onEvent('assistant_message', ...)

    if !response.tool_calls.length: break

    for call in response.tool_calls:
      decision = policy.evaluateToolCall(call.name, call.args, {conversationId, history})
      if decision.risk === 'blocked':
        history.append({role:'tool', tool_call_id:call.id, content:`POLICY_BLOCKED: ${decision.reason}`})
        continue
      if decision.requiresApproval:
        approved = await ui.requestApproval(call, decision)
        if !approved:
          history.append({role:'tool', tool_call_id:call.id, content:'USER_DENIED'})
          continue
      try:
        const taskAbort = abortRegistry.spawn()
        const result = await dispatcher.invoke(call, {signal: taskAbort.signal})
        audit.append({call, result, decision})
        history.append({role:'tool', tool_call_id:call.id, content:result})
        onEvent('tool_result', {call, result})
      catch err if err.name === 'AbortError':
        history.append({role:'tool', tool_call_id:call.id, content:'CANCELLED'})
        break  // exit step loop
      catch err:
        history.append({role:'tool', tool_call_id:call.id, content:`ERROR: ${err.message}`})

  conversations.append(conversationId, history.diff)
  return finalText
}
```

`MAX_STEPS = 30`. Beyond that returns "已达 30 步上限。是否继续？" and stops.

## 3. Tool catalog (DeepSeek/OpenAI naming, underscores only)

| Tool | Backend | Args | Default risk | Risk overrides |
|------|---------|------|--------------|----------------|
| `browser_task` | browser-use | `{goal, max_steps?, start_url?}` | medium | always-approval |
| `desktop_observe` | uitars | `{}` | low | requires `uiTarsScreenAuthorized` |
| `desktop_click` | uitars | `{target}` | high | always-approval |
| `desktop_type` | uitars | `{text}` | high | always-approval; high+ if text matches `/api[_-]?key|password|secret|token/i` |
| `shell_command` | oi | `{command, cwd?}` | medium | high if matches install/delete/format/security-disable patterns from existing `actionPolicy.blockedShellReason` |
| `file_read` | oi | `{path}` | low | blocked if path traverses outside `workspace_root` |
| `file_write` | oi | `{path, content}` | medium | high if path is in `<userData>` config files; blocked outside workspace_root |
| `code_execute` | oi | `{language, code}` | medium | high if code contains EXFIL+CREDENTIAL patterns from existing actionPolicy |
| `skill_<n>` | skillRegistry | declared per-skill | per skill manifest | follows manifest's `permissions` |

**Tool name format:** strict regex `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$`. Skill tools are namespaced as `skill_<sanitized_name>` (e.g. `web-search` → `skill_web_search`).

**Dynamic policy:** `evaluateToolCall(name, args, context)` returns
`{risk: 'low'|'medium'|'high'|'blocked', reason, requiresApproval, allowed}`.
Reuses regex patterns from `electron/security/actionPolicy.js`
(`INSTALL_PATTERN`, `DELETE_PATTERN`, `CREDENTIAL_PATTERN`, etc.) — those
patterns are battle-tested today; v2 wraps them in tool-call language.

## 4. Sidecar security

### 4.1 Localhost is not a boundary — add a token.

On supervisor startup, generate a per-sidecar random token (32 bytes,
base64). Write `<userData>/agentdev-lite/data/sidecar-tokens.json` with
mode `0o600` (best-effort on Windows; ACL the file for current user only).

```json
{"oi":"…", "uitars":"…", "browser-use":"…"}
```

Each sidecar:
- Reads its token from env var `SIDECAR_TOKEN` (set by supervisor at spawn).
- Rejects requests missing or mismatching `X-AionUi-Token` header → HTTP 401.
- Rejects requests with `Origin` header set to anything (Electron requests
  have empty `Origin`; browser-page requests would have `Origin: http://...`).
  → HTTP 403.
- Listens on `127.0.0.1` only (already the case).

This stops local-process exfiltration via DNS rebinding / cross-origin
fetch attacks.

### 4.2 API keys live in env only, never in request body.

Today's `wireDefaultBridge` already does this for OI/uitars. Confirmed no
HTTP request body in the new design carries an API key — only `goal`,
`max_steps`, etc.

### 4.3 Sidecar process startup ordering

Supervisor:
1. Generate tokens, write file.
2. For each sidecar, spawn with `SIDECAR_TOKEN=<token>` env.
3. After spawn, poll `/health` (which requires the token) until ready.
4. If a sidecar doesn't authenticate within 5s, kill + restart up to N times.

## 5. browser-use sidecar (Python)

`server/browser-use-bridge/`. **Phase 0 spike validates everything below
before this is implemented.** Pinned versions:
- `browser-use==<verified-by-spike>`
- `langchain-openai==<verified>`
- `fastapi`, `uvicorn[standard]`

### 5.1 Endpoints

All require `X-AionUi-Token`.

- `GET /health` → `{ok, runtime:'browser-use', version, chromium_installed}`
- `POST /run-task` → SSE stream:
  ```
  data: {"type":"thought","content":"..."}
  data: {"type":"action","action":"click","details":...}
  data: {"type":"screenshot","b64":"..."}
  data: {"type":"done","final":"...summary..."}
  data: {"type":"error","message":"..."}
  ```
  Body: `{taskId, goal, max_steps?, start_url?}`. `taskId` is generated by
  caller; sidecar registers it for `/cancel`.
- `POST /cancel/<taskId>` → triggers AbortSignal in the running task,
  closes browser, returns `{ok:true}`.

### 5.2 Cancellation

Sidecar maintains `tasks: dict[str, asyncio.Task]`. `/cancel/<id>` calls
`task.cancel()`. The agent's `await agent.run(max_steps=...)` is
cancellable in browser-use 0.x via the asyncio task. On cancel:
- Browser is closed (`browser.close()`).
- Stream emits `{type:'error', message:'cancelled'}`.
- Task is removed from registry.

### 5.3 Configuration via env

```
SIDECAR_TOKEN
BROWSER_USE_MODEL_ENDPOINT       (Doubao seed-1.6-vision endpoint)
BROWSER_USE_MODEL_API_KEY        (from config.doubaoVisionApiKey)
BROWSER_USE_MODEL_NAME           (the ep-... endpoint id)
BROWSER_USE_PYTHON               (path to embedded python; from bootstrap)
BROWSER_USE_PLAYWRIGHT_CHROMIUM  (path to bootstrap-installed chromium)
```

## 6. First-run Python bootstrap

When AionUi starts and `<userData>/python-runtime/python.exe` doesn't exist,
the user is shown a `BootstrapDialog` (modal, blocking the browser_task tool
but not other features). It runs:

1. **Detect existing Python**: try `where python` / `where py`. If a Python
   ≥3.11 is already in PATH, optionally use it (user choice).
2. **Otherwise download embeddable Python**: from
   `https://www.python.org/ftp/python/3.12.7/python-3.12.7-embed-amd64.zip`,
   verify SHA256 against a hardcoded value, extract to
   `<userData>/python-runtime/`.
3. **Add `Lib/site-packages` to `sys.path`**: edit `python312._pth` to
   uncomment `import site` (embeddable Python's quirk).
4. **`pip install`**: download `get-pip.py`, run it; then
   `pip install browser-use==<pin> langchain-openai==<pin> fastapi uvicorn[standard]`.
5. **`playwright install chromium`**: invoke playwright's installer to
   `<userData>/python-runtime/chromium/`.
6. **Mark complete**: write `<userData>/python-runtime/.bootstrap-complete`
   with timestamp.

Total download: ~50-100 MB (Python ~10 MB + browser-use deps ~50 MB +
Chromium ~100 MB). Estimated time on a 10 MB/s connection: ~30 seconds.

UI shows progress bar with stages and percentages. On failure: "未能完成
浏览器自动化模块安装（{step}失败：{message}）。其他功能仍可使用。请稍后
在 Settings 重试。" with a "Retry" button. The Skills panel and chat
remain functional, only `browser_task` is unavailable.

The bootstrap can be re-triggered from Settings → "Browser automation" tier.

## 7. Skill system (hardened)

Skills live at `<userData>/agentdev-lite/skills/<name>/`.

### 7.1 Manifest schema

`skill.json`:
```json
{
  "name": "web-search",
  "version": "1.0.0",
  "description": "...",
  "executable": "entry.js",
  "parameters": {"type":"object","properties":{...},"required":[...]},
  "permissions": ["network","fs.read:notes-folder"],
  "default_risk": "low"
}
```

`permissions` allowed values:
- `network` — skill may make outbound HTTP
- `fs.read:<path-prefix>` — limited file read
- `fs.write:<path-prefix>` — limited file write
- `shell` — may invoke shell (always treated as high risk)
- `desktop` — may call uitars-bridge equivalents (always high)
- `browser` — may call browser-use (always medium)

Permissions not in the manifest are **denied** by the sidecar wrapper that
invokes the skill. v1 enforces this **at the dispatcher layer** (toolDispatcher
sees skill manifest; if skill calls back to AionUi via a callback IPC, AionUi
checks permission). Skills are launched via Node `child_process.spawn` —
not eval, never `vm.Script`.

### 7.2 No install-from-URL in v1

v1 ships with **3 starter skills** baked into `resources/builtin-skills/`,
copied to `<userData>/skills/` on first run. No remote install path. Future
v2 may add SHA256+signed remote install but that's out of scope here.

### 7.3 Default-disabled

All skills default `enabled: false` (per-skill state in
`<userData>/skills/.state.json`). User flips to enabled per skill in Settings
→ Skills panel. Disabled skills are absent from the agent's tool catalog.

### 7.4 Three starter skills

- `web-search` — Bing API or 百度搜索 (user provides API key in Settings).
  permissions: `network`. risk: low.
- `note-write` — appends a line to `<userData>/notes.md`. permissions:
  `fs.write:<userData>/notes.md`. risk: low.
- `screenshot-save` — calls AionUi's `desktop_observe` tool internally then
  writes the PNG to `<userData>/screenshots/`. permissions: `desktop`,
  `fs.write:<userData>/screenshots/`. risk: medium.

## 8. Conversation history (SQLite)

(Schema and API unchanged from v1 — see v1 §6.) Uses `better-sqlite3` for
synchronous IPC handlers; no async-await complexity in storage layer.

## 9. Frontend rework + migration

### 9.1 New surfaces

- **Chat panel** (primary): conversation list sidebar + message thread + input. Tool calls render as collapsible cards (call args + result). Pending approval renders as a yellow card with 批准/拒绝 buttons.
- **Settings**: existing + Skills sub-panel (toggle each skill enabled, manage permissions per skill, install Bing key for web-search).
- **Activity log** (renamed from Control Center): read-only audit feed. Approval-pending items also surface here in case user missed the chat-side prompt.
- **Welcome dialog**: kept; the "Browser automation" tier check changes from "Midscene Bridge connected" to "browser-use sidecar healthy". On first run, the dialog directs user to the BootstrapDialog if Python isn't ready.

### 9.2 IPC migration layer

Existing renderer code listens on `chat:delta`, `chat:tool-*`, `chat:action-*`.
The new orchestrator emits `agent:event`. Add an adapter in `electron/ipc/agent.js`
that emits BOTH the new event and (for one release) the old chat:* events
mapped from agent events. Mark the old events as deprecated with a `console.warn`
in renderer when received via the legacy listener.

After one release cycle, drop the legacy events.

### 9.3 useChat history filter

Today's `client/src/hooks/useChat.js` filters `tool` role messages out of
display. Update it to:
- Render `tool` messages as collapsible cards (not hide them).
- Render `assistant` messages with tool_calls as the assistant's text + a
  "Used tools: [...]" footer that links to the tool result cards.

This is the migration path for the new conversation persistence which
includes tool messages.

## 10. Acceptance — deterministic scenarios

### 10.1 Happy paths (each must PASS)

1. **No-tool chat**: User: "中国地质大学有几个校区？" → agent answers without tools.
2. **Pure shell**: "在桌面创建一个 hello.txt 文件，内容是 'hello world'" → `file_write` (medium, requires approval) → user approves → file appears on disk.
3. **Multi-tool sequence**: "创建 hello.txt 写入 'hello'，然后读出来确认" → `file_write` + `file_read` → result text matches.
4. **Browser**: "用浏览器打开 baidu.com 搜索 AionUi 然后告诉我标题" → `browser_task("open baidu.com, search 'AionUi', report top result title")` → result text contains a recognizable string.
5. **Skill**: User explicitly enables `web-search` skill; "用 web-search 搜 deepseek 最新模型" → `skill_web_search` invoked with appropriate query.
6. **Approval gate**: "运行 `rm -rf C:\\` 命令" → `shell_command` evaluated as `blocked` → tool returns `POLICY_BLOCKED` → agent reports refusal in plain text.
7. **Cancel**: long `browser_task` started; user clicks Stop within 2s; sidecar receives `/cancel/<id>` within 1s; agent receives `CANCELLED` and reports cancellation.
8. **History persistence**: have a 5-message chat; close AionUi; reopen; the conversation is in the sidebar; clicking it reloads all 5 messages including tool cards.
9. **Bootstrap first-run**: fresh Windows VM with no Python; first launch shows BootstrapDialog; user clicks "Install"; progress completes; `browser_task` becomes available.
10. **Locked-down skill**: skill is disabled in Settings; user asks for it → agent reports the skill isn't available.

### 10.2 Failure modes (each must degrade gracefully)

A. browser-use sidecar is killed mid-task → agent sees error, replies "browser_task 失败" (not infinite loop).
B. DeepSeek returns malformed JSON for tool_calls → agent replies an apologetic message; loop ends.
C. Python is missing AND user dismisses BootstrapDialog → app still works for chat / shell / desktop / file tools; `browser_task` is absent from catalog with explanation if asked.
D. User denies an approval → agent receives `USER_DENIED`, replies "用户拒绝了该操作".
E. Skill subprocess hangs >30s → wrapper kills it, returns timeout error.
F. Path traversal: `file_read("C:\\Windows\\System32\\config\\SAM")` → policy `blocked`.
G. localhost token tampered: external curl without correct token → 401.

## 11. Migration order (NOT delete-first)

Per reviewer's recommendation:

```
Phase 0  Spike       — validate browser-use, tool calling, sidecar token
Phase 1  Core        — agent loop + dispatcher + dynamic policy
Phase 2  Existing    — wire oi/uitars as tools (NEW tools alongside OLD broker)
Phase 3  Browser     — browser-use sidecar (with security)
Phase 4  Bootstrap   — Python first-run installer
Phase 5  Skills      — registry + 3 starter skills (default-disabled)
Phase 6  History     — SQLite conversations + IPC migration layer
Phase 7  Frontend    — Chat-only UI, Activity log, conversation sidebar
Phase 8  Retire      — finally delete actionPlanner / visionPlanner / midscene
Phase 9  Acceptance  — run §10.1 + §10.2 on a clean Windows VM
```

Phases 1-7 can ship as-is alongside the old code (feature flagged). Phase 8
is the deletion. Phase 9 verifies. Backout: revert Phase 8 only, keep 1-7.

## 12. Red lines

1. Tool names match `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$`. **No dots.**
2. Sidecars require `X-AionUi-Token`. **No exception** for "internal observe".
3. API keys via env vars only. **Never in request body.**
4. Skills are user-permission code. **No "sandbox" claim**, no install-from-URL, default-disabled.
5. browser-use spike (Phase 0) must complete before Phase 3 starts. **No coding around unverified assumptions.**
6. Cancellation is real: sidecar `/cancel/:id` actually kills, AbortSignal propagates through fetch. **No "check signal between calls" pseudo-cancel.**
7. Python bootstrap downloads are hash-verified. **No silent installs**.
8. Old code stays in tree until Phase 8. **Phase 0 is spike, not delete.**
9. Acceptance requires clean Windows VM. **No relying on developer machine state.**
