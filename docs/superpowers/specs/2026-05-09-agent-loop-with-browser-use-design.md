# Agent Loop + browser-use Integration Design

- Date: 2026-05-09
- Status: Approved (for codex execution)
- Audience: codex (executor)
- Supersedes: substantial parts of the existing AionUi V2 architecture (see §7)

## 0. Why

Today's AionUi splits "Chat" and "Execute" into separate UI surfaces. Execute
mode runs a one-shot planner (DeepSeek text or Doubao vision) that generates
all actions up-front, then submits them to a broker for per-action approval.
This is brittle:

- The planner can't see results between steps, so it either over-commits
  (wrong clicks because it guessed the page) or under-commits (only an
  observe, leaving the user stuck typing "继续").
- "Chat" and "Execute" are linguistically the same conversation in the user's
  head. Splitting them is friction.

Modern agent products (Claude Code, Codex CLI, Operator, Computer Use) are
**single chat surfaces with native tool-calling**. The model decides when to
take a screenshot, when to click, when to read a file — all as tool calls
in a continuous loop, with the agent self-correcting based on each tool's
return value.

This spec rebuilds AionUi around that pattern, with these constraints from
the user:

1. **No more Bridge Mode** (login state preservation is no longer required).
   browser-use replaces midscene-bridge wholesale.
2. **Domestic models only** (DeepSeek-V4, Doubao seed-1.6-vision, Qwen3-VL).
   No GPT/Claude.
3. **Seven product pillars** must remain: 屏幕监视, 鼠键控制, skill/plugin,
   浏览器自动化, 本地资源, 历史对话, 本地 exe.

## 1. End-state architecture

```
Electron shell (本地 exe — unchanged packaging path)
 ├── React frontend (simplified)
 │     - Chat (with conversation list sidebar) — primary UI
 │     - Settings (API keys, screen authorization)
 │     - Skills panel (list installed skills, browse marketplace)
 │     - Activity log (renamed from "Control Center"; passive view of agent
 │       actions; only blocks for high-risk tool calls)
 │
 ├── Main-process services
 │     - agentLoop.js (NEW — replaces actionPlanner + visionPlanner +
 │       taskOrchestrator's plan-execute split)
 │     - toolDispatcher.js (NEW — routes agent's tool calls to sidecars)
 │     - skillRegistry.js (NEW — loads installed skills, exposes them as tools)
 │     - conversations.js (NEW — SQLite-backed history)
 │     - existing: store.js, security/policy, security/broker (broker becomes
 │       a tool-call gate, not an action queue)
 │     - existing: bridgeSupervisor.js (now manages browser-use + uitars + oi)
 │
 ├── Sidecars
 │     - server/browser-use-bridge/ (NEW Python — FastAPI + browser-use SDK)
 │     - server/uitars-bridge/ (kept — desktop screen/mouse/keyboard)
 │     - server/oi-bridge/ (kept — shell/file/code via Open Interpreter)
 │     - server/midscene-bridge/ (RETIRED, kept on disk for one release as
 │       fallback if user opts in)
 │
 └── Storage
       - SQLite: conversations.db (NEW — chat history)
       - existing: audit.jsonl, run-outputs.json, config.json
```

## 2. The agent loop

```
async function runAgentTurn(conversationId, userMessage):
  history = conversations.load(conversationId)  // last N messages incl. tool calls/results
  history.append({ role: 'user', content: userMessage })

  for step in 1..MAX_STEPS:
    response = model.chatWithTools({
      messages: history,
      tools: toolDispatcher.catalog(),  // see §3
      tool_choice: 'auto'
    })

    history.append({ role: 'assistant', content: response.text, toolCalls: response.toolCalls })

    if response.toolCalls.length === 0:
      break  // agent has nothing more to do this turn

    for call in response.toolCalls:
      if policy.requiresApproval(call):
        await ui.requestApproval(call)  // user sees the pending call in Activity log
      result = await toolDispatcher.invoke(call)
      audit.append(call, result)
      history.append({ role: 'tool', toolCallId: call.id, content: result })

  conversations.save(conversationId, history)
  return final response.text
```

**Model**: DeepSeek-V4 (`deepseek-chat`) is the agent brain — text-only, but
visual reasoning is delegated to browser-use's internal vision model and to
the desktop screen-observe tool. Tool-calling format is OpenAI-compatible
function calling (DeepSeek native).

**Step cap**: `MAX_STEPS = 30` per turn, configurable. Beyond that the
agent reports "本轮已达 30 步上限，是否继续？" and waits for user.

**Cancellation**: Emergency Stop kills the in-flight tool call and breaks the
loop, sending the partial state back as a final assistant message.

## 3. Tool catalog

The agent sees these tools (function-calling schema). Each tool lives behind
a sidecar or a built-in handler.

| Tool name | Backend | Risk | Description |
|-----------|---------|------|-------------|
| `browser_task` | browser-use sidecar | medium | Run a self-contained browser sub-task (login, scrape, fill form, navigate). Args: `{ goal: string, max_steps?: int, start_url?: string }`. Returns final URL + summary + screenshot. |
| `desktop.observe` | uitars-bridge | low | Capture full-screen screenshot, return base64 + summary. |
| `desktop.click` | uitars-bridge | high | Click on a screen element matched by natural-language target. Args: `{ target: string }`. |
| `desktop.type` | uitars-bridge | high | Type text into focused field. Args: `{ text: string }`. |
| `shell.command` | oi-bridge | medium (high if installs/deletes) | Run a shell command. Args: `{ command: string, cwd?: string }`. |
| `file.read` | oi-bridge | low | Read a file. Args: `{ path: string }`. |
| `file.write` | oi-bridge | medium | Write a file. Args: `{ path: string, content: string }`. |
| `code.execute` | oi-bridge | medium | Run a code snippet. Args: `{ language: string, code: string }`. |
| `skill.invoke` | skillRegistry | depends on skill manifest | Run an installed skill. Args: `{ name: string, args: object }`. |

Skill registry can dynamically add more tools at runtime — they show up in
the catalog when present, namespaced as `skill.<name>` for discoverability.

## 4. browser-use sidecar

`server/browser-use-bridge/` (Python, FastAPI on 127.0.0.1:8780).

**Endpoints:**
- `GET /health` → `{ ok, runtime: 'browser-use', version }`
- `POST /run-task` → SSE stream of events: `{ type: 'thought' | 'tool' | 'screenshot' | 'done', ... }`. Body: `{ goal, max_steps?, model_endpoint?, model_api_key?, model_name?, start_url? }`.
- `POST /cancel/<task_id>` → cancels a running task.

**Implementation notes:**
- Uses `browser-use` (pip), pinned version. The package vendors its own
  Playwright Chromium download on first run.
- Configures `langchain.chat_models.ChatOpenAI` with `base_url` and `api_key`
  from env vars, pointing at the user's Doubao seed-1.6-vision endpoint
  (visual model required because browser-use uses DOM extraction + vision).
- Single concurrency: only one task at a time per sidecar. Multi-task queuing
  is out of scope for v1.
- No login-state preservation — accepts that the Chromium it spawns is fresh
  every run. User accepts this in their requirement statement.

**Spawn:** managed by `bridgeSupervisor.js` like the others. New env vars:
`BROWSER_USE_MODEL_ENDPOINT`, `BROWSER_USE_MODEL_API_KEY`, `BROWSER_USE_MODEL_NAME`.

## 5. Skill / plugin mechanism

Skills live at `%APPDATA%/agentdev-lite/agentdev-lite/skills/<name>/`. Each
skill is a folder with:

- `skill.json` — `{ name, description, parameters: <JSON schema>, executable: 'entry.js' | './run.cmd', risk: 'low' | 'medium' | 'high' }`
- The executable file (Node script, shell script, or .exe).

**Skill registry:**
- Scans the directory at startup, watches for changes.
- Exposes each as a tool in the agent's catalog.
- On invocation, spawns the executable with the agent's `args` as JSON on
  stdin, captures stdout JSON as the tool result, kills if it exceeds
  `timeout` (default 30s).
- Risk level from `skill.json` is honored by policy.

**Built-in starter skills shipped with v1:**
- `web-search` — searches Bing / 百度 via API, returns top results
- `note-write` — appends to a notes folder
- `screenshot-save` — saves a desktop or browser screenshot to disk

A "Skills" panel in the React frontend lists installed skills, lets the user
toggle each on/off (off skills are absent from the catalog), and provides an
"Install from URL" button that downloads a zip and unzips into the skills
dir.

## 6. Conversation history (SQLite)

`%APPDATA%/agentdev-lite/agentdev-lite/data/conversations.db`.

Schema:
```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '新对话',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content TEXT,
  tool_calls TEXT,        -- JSON array when role='assistant'
  tool_call_id TEXT,      -- when role='tool'
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_messages_conv ON messages (conversation_id, created_at);
```

**API (in conversations.js):**
- `listConversations()` → `[{id, title, updated_at}]`
- `createConversation(title?)` → `{id, ...}`
- `loadMessages(conversationId, limit?)` → `[message]`
- `appendMessage(conversationId, message)` → updates `updated_at`
- `renameConversation(id, title)`
- `deleteConversation(id)`

Frontend chat UI uses these via IPC. Sidebar shows conversations sorted by
`updated_at desc`.

## 7. What gets retired

After this rebuild, these files are unused and should be removed in Phase 0:

- `electron/services/actionPlanner.js`
- `electron/services/visionPlanner.js`
- `electron/services/midscene/` (whole directory)
- `electron/__tests__/action-planner.test.js`, `vision-planner.test.js`,
  `midscene-adapter.test.js`, `midscene-bootstrap.test.js`
- `server/midscene-bridge/` (move to `server/midscene-bridge.deprecated/`
  for a release; reference removed from supervisor)
- The Execute mode UI (replaced by single Chat mode that handles both
  conversational queries and execution)
- The Welcome dialog's "Browser automation" tier still applies but the
  underlying check is now "browser-use bridge healthy" not "Midscene Bridge"
  attached

What stays:
- `bridgeSupervisor.js` (manages 3 sidecars: browser-use, uitars, oi)
- `oi-bridge/`, `uitars-bridge/`
- `security/actionTypes.js`, `security/actionPolicy.js`,
  `security/actionBroker.js` (broker becomes the approval gate for
  high-risk tool calls)
- `store.js`, `runOutputs.js`, audit log
- Settings, Welcome dialog (with content adjustments)

## 8. Acceptance criteria

The new architecture is "done" when these scenarios all work end-to-end:

1. **Pure chat**: "中国地质大学有几个校区？" — agent answers from DeepSeek
   without any tool calls.
2. **Browser sub-task**: "帮我登录学习通看视频" — agent invokes
   `browser_task("login to chaoxing and start the first unfinished video")`,
   browser-use does the work, agent reports back. (Without bridge mode, user
   is OK re-logging-in inside browser-use's spawned Chromium.)
3. **Multi-tool**: "把桌面上 demo.txt 的内容改成 hello, 然后打开记事本验证" —
   agent calls `file.write`, then `desktop.observe` to confirm Notepad isn't
   open, then... well, you get the idea. Multiple tools in sequence.
4. **Skill invocation**: a starter skill `web-search` is invoked when user
   asks "搜一下豆包最新模型发布日期".
5. **High-risk gating**: `desktop.click` request pauses for user approval in
   the Activity log before firing. User can deny.
6. **Conversation history**: open AionUi, have a chat, close AionUi, reopen
   — last conversation is in the sidebar and the messages reload.
7. **Cancel**: long-running `browser_task` is cancelled mid-flight via
   Emergency Stop; agent receives the cancellation, replies "任务已取消".

## 9. Red lines

1. Do **not** keep the old `Execute` mode UI. One unified chat surface only.
2. browser-use sidecar must run **on 127.0.0.1 only**.
3. Skills are user-installed code — sandbox via subprocess, never `eval` or
   `vm.Script` them in the main process.
4. Native tool calling on the model side. Do **not** prompt-engineer JSON
   blobs into a non-tool-calling response — DeepSeek + Doubao both have
   native tool calling, use it.
5. Conversation history must round-trip through SQLite — no in-memory only.
6. Existing audit log keeps its current format. Tool calls are appended as
   audit events with the same shape as today's action events.
7. Don't ship a Python bundle inside the installer. browser-use sidecar
   requires the user to have Python 3.11+ + `pip install browser-use`. The
   Welcome dialog's "完整" tier check verifies this; "中等" tier (which is
   most users) doesn't require browser-use until they actually ask for a web
   task.
