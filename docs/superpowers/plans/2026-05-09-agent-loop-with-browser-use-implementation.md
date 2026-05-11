# Agent Loop + browser-use Implementation Plan

> **For codex (executor):** Execute by Phase. Each phase commits independently. Spec: `docs/superpowers/specs/2026-05-09-agent-loop-with-browser-use-design.md`. **This is a major rebuild — Phase 0 deletes deprecated code, Phases 1-6 build the new architecture, Phase 7 verifies acceptance.**

**Goal:** Replace AionUi's plan-execute split with a single chat surface backed by an agent loop using DeepSeek-V4 native tool calling. Tools route to browser-use (browser), uitars-bridge (desktop), oi-bridge (shell/file), and a new skill registry. Drop Midscene Bridge Mode entirely.

**Branch:** `feat/agent-loop-browser-use` from `main`.

**Red lines** (per spec §9):
1. No keeping the old Execute mode UI — one unified chat surface only
2. browser-use sidecar binds 127.0.0.1 only
3. Skills are sandboxed via subprocess
4. Use native tool calling, never prompt-engineered JSON
5. SQLite round-trip required
6. Audit log shape preserved
7. Python bundle not shipped — user installs browser-use themselves

---

## Phase 0: Retire deprecated code

- [ ] Branch off main: `git checkout -b feat/agent-loop-browser-use`
- [ ] Delete files (per spec §7):
  - `electron/services/actionPlanner.js`
  - `electron/services/visionPlanner.js`
  - `electron/services/midscene/` (whole dir)
  - `electron/__tests__/action-planner.test.js`
  - `electron/__tests__/vision-planner.test.js`
  - `electron/__tests__/midscene-adapter.test.js`
  - `electron/__tests__/midscene-bootstrap.test.js`
  - `server/midscene-bridge/` → rename to `server/midscene-bridge.deprecated/` (don't delete; reference removed from supervisor)
- [ ] Update `electron/security/actionTypes.js`: remove `WEB_NAVIGATE/OBSERVE/CLICK/TYPE/QUERY` and `RUNTIME_NAMES.MIDSCENE` (these become tool names, not action types).
- [ ] Update `electron/security/actionPolicy.js`: remove `webRisk` function and its branch.
- [ ] Update `electron/services/bridgeSupervisor.js`: remove `midscene` from `DEFAULTS`.
- [ ] Update `electron/services/taskOrchestrator.js`: keep file but gut the body — replace with a thin shim that calls the new `agentLoop.runTurn(...)` (Phase 1).
- [ ] Update `package.json` workspaces: remove `server/midscene-bridge`.
- [ ] Update `package.json` `build.extraResources`: remove midscene-bridge entry.
- [ ] Run `npm test` — many tests will fail; that's expected. Note which fail and remove the references in Phase 1.
- [ ] Commit: `chore: retire midscene + planner pre-rebuild`

---

## Phase 1: Agent loop core (Node, in-process)

**Goal:** A working `agentLoop.runTurn(...)` that calls DeepSeek with native tool calling, dispatches tool calls to a stub dispatcher, loops until done.

### Task 1.1: toolDispatcher.js skeleton

- [ ] Create `electron/services/toolDispatcher.js`:

```js
const TOOLS = []  // populated by registerTool

function registerTool(definition) {
  // definition: { name, description, parameters (JSON schema), risk, invoke: async (args) => result }
  TOOLS.push(definition)
}

function catalog() {
  // Returns OpenAI-format tool array
  return TOOLS.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }))
}

async function invoke(toolCall) {
  const t = TOOLS.find(x => x.name === toolCall.function.name)
  if (!t) throw new Error(`Unknown tool: ${toolCall.function.name}`)
  const args = JSON.parse(toolCall.function.arguments || '{}')
  const result = await t.invoke(args)
  return typeof result === 'string' ? result : JSON.stringify(result)
}

function clear() { TOOLS.length = 0 }  // for tests

module.exports = { registerTool, catalog, invoke, clear }
```

- [ ] Test: `electron/__tests__/tool-dispatcher.test.js` covering register/catalog/invoke/unknown-tool.
- [ ] Commit.

### Task 1.2: agentLoop.js core

- [ ] Create `electron/services/agentLoop.js`:

```js
const modelRouter = require('./modelRouter')
const { MODEL_ROLES } = require('./models/modelTypes')
const toolDispatcher = require('./toolDispatcher')
const { evaluateAction } = require('../security/actionPolicy')

const MAX_STEPS = 30

function buildSystemPrompt() {
  return [
    'You are AionUi, a desktop AI agent. Help the user via tool calls.',
    'You have tools for: browser tasks, desktop screen/mouse/keyboard, local shell/files/code, and user-installed skills.',
    'Loop: think, call a tool when needed, observe its result, continue. When the task is complete or you need user input, reply with text and stop.',
    'Do not narrate every internal thought. Use tools concisely.'
  ].join('\n')
}

async function runTurn({ messages, conversationId, onEvent, signal }, deps = {}) {
  const router = deps.modelRouter || modelRouter
  const dispatcher = deps.toolDispatcher || toolDispatcher
  const config = deps.storeRef?.getConfig?.() || {}
  const policy = deps.policy || { requiresApproval: () => false }
  const audit = deps.audit || { append: () => {} }
  const requestApproval = deps.requestApproval || (async () => true)

  const history = [{ role: 'system', content: buildSystemPrompt() }, ...messages]

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal?.aborted) throw new Error('aborted')

    const response = await router.chatWithTools({
      messages: history,
      tools: dispatcher.catalog(),
      role: MODEL_ROLES.TASK_PLANNING,
      config
    })

    history.push({ role: 'assistant', content: response.content || '', tool_calls: response.tool_calls })
    onEvent?.('assistant_message', { content: response.content, toolCalls: response.tool_calls })

    if (!response.tool_calls?.length) {
      return { messages: history, finalText: response.content }
    }

    for (const call of response.tool_calls) {
      if (signal?.aborted) throw new Error('aborted')
      const approved = policy.requiresApproval(call) ? await requestApproval(call) : true
      if (!approved) {
        history.push({ role: 'tool', tool_call_id: call.id, content: '用户拒绝了该工具调用' })
        audit.append({ call, denied: true })
        continue
      }
      try {
        const result = await dispatcher.invoke(call)
        history.push({ role: 'tool', tool_call_id: call.id, content: result })
        audit.append({ call, result })
        onEvent?.('tool_result', { call, result })
      } catch (err) {
        const errStr = String(err?.message || err)
        history.push({ role: 'tool', tool_call_id: call.id, content: `ERROR: ${errStr}` })
        audit.append({ call, error: errStr })
        onEvent?.('tool_error', { call, error: errStr })
      }
    }
  }

  history.push({ role: 'assistant', content: `已达 ${MAX_STEPS} 步上限。是否继续？` })
  return { messages: history, finalText: `已达 ${MAX_STEPS} 步上限。是否继续？` }
}

module.exports = { runTurn, buildSystemPrompt }
```

### Task 1.3: modelRouter.chatWithTools

- [ ] Modify `electron/services/modelRouter.js`: add `chatWithTools({ messages, tools, role, config })` that routes to `deepseekProvider.chatWithTools` (or similar).
- [ ] Modify `electron/services/models/deepseekProvider.js`: implement `chatWithTools` that uses DeepSeek's `/v1/chat/completions` with `tools` parameter and parses `tool_calls` from response. (DeepSeek API is OpenAI-compatible.)
- [ ] Tests for modelRouter.chatWithTools and provider.

### Task 1.4: agentLoop tests

- [ ] `electron/__tests__/agent-loop.test.js`:
  - Mocked router returns no tool_calls → loop returns immediately
  - Mocked router returns one tool_call → dispatcher.invoke called → result fed back → loop continues → second response no tool_calls → ends
  - Approval denied → tool not invoked, "用户拒绝了" appended
  - aborted signal mid-loop → throws 'aborted'
  - MAX_STEPS reached → returns step-limit message

- [ ] Commit Phase 1: `feat(agent): native tool-calling loop with policy gate`

---

## Phase 2: Wire existing oi-bridge + uitars-bridge as tools

- [ ] Create `electron/services/tools/oiTools.js`: registers `shell.command`, `file.read`, `file.write`, `code.execute`. Each invokes oi-bridge HTTP `/execute` and parses result.
- [ ] Create `electron/services/tools/desktopTools.js`: registers `desktop.observe`, `desktop.click`, `desktop.type`. Invokes uitars-bridge.
- [ ] In `electron/main.js` after supervisor.start(): import + invoke registration functions.
- [ ] Tests with mock fetch.
- [ ] Smoke test in dev: `npm run electron:dev`, ask agent "请打印 hello world", agent should call `shell.command { command: 'echo hello world' }`.
- [ ] Commit: `feat(tools): wire oi-bridge and uitars-bridge as agent tools`

---

## Phase 3: browser-use sidecar (Python)

### Task 3.1: scaffold

- [ ] Create `server/browser-use-bridge/`:
  - `requirements.txt` — `fastapi`, `uvicorn[standard]`, `browser-use==<latest>`, `langchain-openai`
  - `main.py` — FastAPI app with `/health` and `/run-task` (SSE).
  - `README.md` — install instructions: `python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt`
- [ ] `main.py` skeleton:

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import asyncio, os, json
from browser_use import Agent
from langchain_openai import ChatOpenAI

app = FastAPI()

class RunTaskBody(BaseModel):
    goal: str
    max_steps: int = 30
    start_url: str | None = None

@app.get('/health')
def health():
    return { 'ok': True, 'runtime': 'browser-use', 'version': '<pin>' }

@app.post('/run-task')
async def run_task(body: RunTaskBody):
    async def stream():
        llm = ChatOpenAI(
            base_url=os.environ['BROWSER_USE_MODEL_ENDPOINT'],
            api_key=os.environ['BROWSER_USE_MODEL_API_KEY'],
            model=os.environ['BROWSER_USE_MODEL_NAME'],
            temperature=0.1
        )
        agent = Agent(task=body.goal, llm=llm)
        if body.start_url:
            await agent.browser.go_to(body.start_url)
        history = await agent.run(max_steps=body.max_steps)
        for action in history.action_results():
            yield f"data: {json.dumps({'type':'tool','tool':action.action,'result':action.result})}\n\n"
        yield f"data: {json.dumps({'type':'done','final': history.final_result()})}\n\n"
    return StreamingResponse(stream(), media_type='text/event-stream')
```

(Adjust to actual browser-use API — check its docs at install time and pin the version.)

- [ ] Test manually: `python main.py` then `curl -N -X POST http://127.0.0.1:8780/run-task -d '{"goal":"google ai-news"}'`.

### Task 3.2: bridgeSupervisor adoption

- [ ] In `electron/services/bridgeSupervisor.js`: add `'browser-use'` entry to `DEFAULTS` with port 8780, dir `server/browser-use-bridge`, **command `python` + `[main.py]` instead of node**. Inject `BROWSER_USE_MODEL_*` env vars from `config.doubaoVision*` (which is the user's seed-1.6-vision endpoint).
- [ ] Health check via `/health`.
- [ ] When Python isn't installed, fail gracefully — log to stderr, mark state as `failed`, leave the agent without `browser_task` tool.

### Task 3.3: browserTask tool

- [ ] Create `electron/services/tools/browserTask.js`: registers `browser_task` tool that POSTs to sidecar, streams SSE, accumulates final result.
- [ ] Risk: medium by default, configurable.
- [ ] Tests with mocked SSE stream.
- [ ] Commit: `feat(tools): browser-use sidecar + browser_task tool`

---

## Phase 4: Skill registry

- [ ] Create `electron/services/skillRegistry.js`:
  - On startup, scan `<userData>/agentdev-lite/skills/`.
  - Each subdir is a skill if it has `skill.json`.
  - Validate manifest schema; ignore broken skills with stderr log.
  - For each valid skill, register a tool named `skill.<name>`. Invoke spawns the executable with args JSON on stdin, reads result JSON from stdout, with a 30s timeout.
- [ ] `chokidar` watch for live install/remove (lightweight).
- [ ] Tests: register synthetic skills under `os.tmpdir()`, verify catalog and invocation.
- [ ] Built-in starter skills: ship in `resources/builtin-skills/` and copy to userData on first run if missing. Three starter skills:
  - `web-search` (Bing/百度 — user supplies search API key in Settings)
  - `note-write` (appends to `<userData>/notes.md`)
  - `screenshot-save` (calls `desktop.observe` then writes the PNG to `<userData>/screenshots/`)
- [ ] Commit: `feat(skills): file-watched registry with 3 starter skills`

---

## Phase 5: SQLite conversations

- [ ] Add `better-sqlite3` to root deps.
- [ ] Create `electron/services/conversations.js` with the schema from spec §6 and the API listed there.
- [ ] IPC: `conversations:list`, `conversations:create`, `conversations:load`, `conversations:append`, `conversations:rename`, `conversations:delete` in `electron/ipc/conversations.js`.
- [ ] Tests against `:memory:` SQLite.
- [ ] Commit: `feat(history): SQLite-backed conversations`

---

## Phase 6: Frontend rework

### Task 6.1: simplify

- [ ] Delete `client/src/panels/ExecutePanel.jsx` (or whatever the Execute panel is called) and the related tab.
- [ ] In ChatPanel: support a sidebar with conversation list (read from `conversations:list`).
- [ ] On message send, call new IPC `agent:run-turn` (Phase 6.2).

### Task 6.2: agent IPC + streaming

- [ ] Create `electron/ipc/agent.js` with `agent:run-turn` handler that calls `agentLoop.runTurn` and streams events to renderer via `mainWindow.webContents.send('agent:event', payload)`.
- [ ] Frontend subscribes via `window.aionui.onAgentEvent(handler)` (preload exposes).
- [ ] Render `assistant_message`, `tool_result`, `tool_error`, `tool_pending_approval` distinctly in chat:
  - tool_pending_approval shows a yellow card with "批准 / 拒绝" buttons that send `agent:approve` or `agent:deny` IPC
  - tool_result collapsible card showing call args + result
  - assistant_message rendered as markdown

### Task 6.3: Activity log replaces Control Center

- [ ] Repurpose Control Center: rename to "Activity log". Read from `audit:list` IPC. Show recent tool calls + results. Pure read-only by default; only the pending-approval items have action buttons (which echo the chat-side approval).
- [ ] Update Welcome dialog: remove the "Browser automation" tier's "Bridge Mode" check; the new check is "browser-use sidecar healthy" (`runtime:status` → `browser-use.state === 'running'`). Update copy: "Chrome extension" mentions removed; replaced with "browser-use Python 模块已安装".

- [ ] Commit Phase 6: `feat(client): single chat UI with conversation history + activity log`

---

## Phase 7: Acceptance

Run all 7 scenarios from spec §8. Append results to `docs/test-report.md` under `## 2026-05-09 Agent Loop Acceptance`.

For each: PASS/FAIL plus a 1-line note. Failure stops the phase — surface to human.

If all PASS:
- Push branch: `git push -u origin feat/agent-loop-browser-use`
- Open PR: `feat: agent loop with browser-use, drop midscene + plan-execute split`
- Body lists the 7 acceptance scenarios with statuses
- Commit + done.

---

## Definition of Done

- All 7 acceptance scenarios PASS.
- `npm test` green (the deprecated tests are gone, new tests cover agent loop / dispatcher / conversations / skills / browser-use bridge).
- `npm run build:client` clean.
- `npm run electron:build` produces a Windows installer that bundles all sidecars (browser-use is the new one — its Python deps are NOT bundled; user installs).
- README updated:
  - Drop "Bridge Mode" mentions
  - Add "browser-use Python 模块" prerequisite for browser tasks
  - Document skill folder location
- Conversation history reloads after restart.
- Emergency Stop cancels in-flight tool calls.
