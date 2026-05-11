# Phase C: browser-use Sidecar Integration (3-4 days)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Python FastAPI sidecar wrapping the `browser-use` library, register a `browser_task` tool in the agent catalog, and wire it through the existing bridge supervisor pattern so the agent loop can drive web browser automation.

**Architecture:** A new Python sidecar (`server/browser-use-bridge/`) runs a FastAPI server on 127.0.0.1:8780, wrapping `browser-use` with its own Playwright-managed Chromium. The Electron main process spawns it via `bridgeSupervisor.js` using the same pattern as oi-bridge/uitars-bridge. A thin Node.js adapter (`electron/services/browserUse/adapter.js`) calls the sidecar over HTTP. The `browser_task` tool registers into the existing `tools/index.js` registry and is immediately available to the agent loop via `getAgentLoopToolSchemas()`.

**Tech Stack:** Python 3.11+, FastAPI, uvicorn, browser-use (pip), Playwright/Chromium, Doubao seed-1.6-vision (vision model for browser-use's DOM+vision reasoning).

**Prerequisite:** Phase A (agent loop backend) and Phase B (frontend wiring) are complete on `feat/phase-b-frontend-wiring`.

---

## Reuse pact (MUST honor)

| | What |
|---|---|
| 1 | Use existing `bridgeSupervisor.js` — add a `browser-use` entry to `DEFAULTS`, don't rewrite the supervisor. |
| 2 | Use existing `tools/index.js#register()` — register `browser_task` the same way all 16 built-in tools are registered. |
| 3 | Use existing `electron/services/deepseek.js` for the agent LLM. browser-use's internal vision model uses Doubao independently (env vars passed by supervisor). |
| 4 | Follow the existing bridge HTTP pattern: `GET /health`, `POST /execute`. |
| 5 | Do NOT delete midscene-bridge, actionPlanner, visionPlanner, or any old code. Retirement is Phase D. |
| 6 | Do NOT touch SQLite, conversation persistence, or the frontend. |
| 7 | Do NOT modify the agent loop (`agentLoop.js`). The `browser_task` tool is added via the tool registry and picked up automatically. |
| 8 | browser-use sidecar binds 127.0.0.1 only. |

---

## File plan

```
NEW
  server/browser-use-bridge/main.py              FastAPI server: /health, /execute (SSE)
  server/browser-use-bridge/browser_agent.py     browser-use Agent wrapper
  server/browser-use-bridge/requirements.txt     Python dependencies (pinned)
  electron/services/browserUse/adapter.js        HTTP adapter calling the sidecar
  electron/services/browserUse/index.js          Module entry: exports bootstrap/detect/repair
  electron/tools/browserTask.js                  Tool registration for browser_task
  scripts/prepare-browser-use.sh                 Bootstrap: uv pip install + playwright install
  electron/__tests__/browser-task.test.js        Unit test: tool registration + adapter contract
  electron/__tests__/browser-adapter.test.js     Unit test: adapter request/response shaping

MODIFY
  electron/services/bridgeSupervisor.js          Add browser-use to DEFAULTS, buildEnv
  package.json                                   Add server/browser-use-bridge workspace (optional)
```

---

## Task 0: Verify Python and browser-use availability (~30 min)

Before writing any Node.js integration code, confirm the Python side can work on the development machine.

- [ ] **Step 1: Check Python version**

```bash
python --version
```
Expected: `Python 3.11.x` or newer (3.11 required by browser-use).

- [ ] **Step 2: Check if browser-use is installable**

```bash
pip install browser-use 2>&1 | tail -3
```

If this fails (network, mirror, etc.), note the error. The plan assumes `pip install browser-use` works.

- [ ] **Step 3: Verify Playwright Chromium can be installed**

```bash
playwright install chromium --with-deps 2>&1 | tail -5
```

If this fails, the sidecar can still work but needs `--no-sandbox` on certain environments.

- [ ] **Step 4: Quick smoke — run a browser-use Agent in Python**

Create a temp script:
```python
from browser_use import Agent, Browser, BrowserConfig, ChatOpenAI
import asyncio

async def main():
    browser = Browser(config=BrowserConfig(headless=True))
    agent = Agent(
        task="Go to example.com and return the page title",
        llm=ChatOpenAI(model="gpt-3.5-turbo"),
        browser=browser,
    )
    result = await agent.run(max_steps=3)
    print("Result:", result)

asyncio.run(main())
```

Run: `python temp_smoke.py`
Expected: Agent navigates, returns page title. If this fails without a valid OpenAI key, that's OK — the real integration uses the user's Doubao endpoint. The goal is to verify the Python import chain works.

- [ ] **Step 5: Record findings in `docs/test-report.md`** under `## Phase C Task 0 — Python availability`.

---

## Task 1: Create the browser-use-bridge sidecar (~3 hours)

### Task 1.1: Project scaffold

- [ ] **Step 1: Create directory and requirements.txt**

```bash
mkdir server\browser-use-bridge 2>nul || cd .   # Windows
# or: mkdir -p server/browser-use-bridge        # Unix
```

File: `server/browser-use-bridge/requirements.txt`
```
browser-use>=0.10.0
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
pydantic>=2.0.0
```

- [ ] **Step 2: Write the browser agent wrapper**

File: `server/browser-use-bridge/browser_agent.py`

```python
"""browser-use Agent wrapper — single concurrency, configurable LLM backend."""
import asyncio
import os
import traceback
from dataclasses import dataclass, field
from typing import Optional

from browser_use import Agent, Browser, ChatOpenAI


@dataclass
class BrowserTask:
    goal: str
    max_steps: int = 15
    start_url: Optional[str] = None
    headless: bool = True


@dataclass
class BrowserResult:
    success: bool
    summary: str
    final_url: str = ""
    screenshot_base64: Optional[str] = None
    error: Optional[str] = None
    steps_completed: int = 0
    duration_ms: int = 0


class BrowserAgentPool:
    """Single-concurrency browser agent pool.

    Only one task runs at a time. An in-flight task can be cancelled
    via cancel_current().
    """

    def __init__(self):
        self._current_task: Optional[asyncio.Task] = None
        self._browser: Optional[Browser] = None

    def _build_llm(self):
        endpoint = os.environ.get("BROWSER_USE_MODEL_ENDPOINT", "")
        api_key = os.environ.get("BROWSER_USE_MODEL_API_KEY", "")
        model_name = os.environ.get("BROWSER_USE_MODEL_NAME", "doubao-seed-1-6-vision-250815")

        if endpoint and api_key:
            return ChatOpenAI(
                model=model_name,
                base_url=endpoint,
                api_key=api_key,
            )
        # Fallback: try standard OpenAI env vars
        return ChatOpenAI(model="gpt-4o")

    async def _ensure_browser(self, headless: bool) -> Browser:
        if self._browser is None:
            self._browser = Browser(headless=headless)
        return self._browser

    async def run_task(self, task: BrowserTask):
        import time
        started = time.time()

        async def _run():
            llm = self._build_llm()
            browser = await self._ensure_browser(task.headless)

            agent = Agent(
                task=task.goal,
                llm=llm,
                browser=browser,
                use_vision=True,
            )

            result = await agent.run(max_steps=task.max_steps)

            return BrowserResult(
                success=result.is_successful(),
                summary=str(result.final_result()),
                final_url=result.urls[-1] if result.urls else "",
                steps_completed=result.number_of_steps(),
                duration_ms=int(result.total_duration_seconds() * 1000),
            )

        self._current_task = asyncio.ensure_future(_run())
        try:
            return await self._current_task
        except asyncio.CancelledError:
            return BrowserResult(
                success=False,
                summary="任务已被取消。",
                error="CANCELLED",
                duration_ms=int((time.time() - started) * 1000),
            )
        except Exception as exc:
            return BrowserResult(
                success=False,
                summary=f"browser-use 执行失败：{exc}",
                error=traceback.format_exc(),
                duration_ms=int((time.time() - started) * 1000),
            )
        finally:
            self._current_task = None

    async def cancel_current(self):
        if self._current_task and not self._current_task.done():
            self._current_task.cancel()
            try:
                await self._current_task
            except asyncio.CancelledError:
                pass

    async def close(self):
        await self.cancel_current()
        if self._browser:
            try:
                await self._browser.close()
            except Exception:
                pass
            self._browser = None


# Module-level singleton
_pool: Optional[BrowserAgentPool] = None


def get_pool() -> BrowserAgentPool:
    global _pool
    if _pool is None:
        _pool = BrowserAgentPool()
    return _pool
```

- [ ] **Step 3: Write the FastAPI server**

File: `server/browser-use-bridge/main.py`

```python
"""browser-use bridge — FastAPI server on 127.0.0.1.

Endpoints:
  GET  /health     → { ok, runtime, version, ready }
  POST /execute    → SSE stream of { type, ... }
  POST /cancel     → cancels in-flight task
"""
import asyncio
import json
import os
import sys
import traceback
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from browser_agent import BrowserTask, get_pool

app = FastAPI(title="browser-use-bridge", version="0.1.0")


class ExecuteRequest(BaseModel):
    goal: str
    max_steps: int = 15
    start_url: str | None = None
    headless: bool = True


@app.get("/health")
async def health():
    return {
        "ok": True,
        "runtime": "browser-use",
        "version": "0.1.0",
        "ready": True,
    }


async def sse_event(event_type: str, data: dict | str):
    if isinstance(data, dict):
        data = json.dumps(data, ensure_ascii=False, default=str)
    return f"event: {event_type}\ndata: {data}\n\n"


@app.post("/execute")
async def execute(req: ExecuteRequest):
    """Run a browser task, streaming SSE events back to the client."""
    pool = get_pool()

    async def event_stream():
        import time
        started = time.time()

        # Emit start event
        yield await sse_event("start", {
            "goal": req.goal,
            "max_steps": req.max_steps,
            "start_url": req.start_url,
        })

        task = BrowserTask(
            goal=req.goal,
            max_steps=req.max_steps,
            start_url=req.start_url,
            headless=req.headless,
        )

        result = await pool.run_task(task)

        # Emit result
        yield await sse_event("result", {
            "success": result.success,
            "summary": result.summary,
            "final_url": result.final_url,
            "steps_completed": result.steps_completed,
            "duration_ms": result.duration_ms,
            "error": result.error,
        })

        # Emit done
        yield await sse_event("done", {
            "duration_ms": int((time.time() - started) * 1000),
        })

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/cancel")
async def cancel_task():
    pool = get_pool()
    await pool.cancel_current()
    return {"ok": True, "message": "已请求取消当前任务。"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("BROWSER_USE_PORT", sys.argv[1] if len(sys.argv) > 1 else "8780"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
```

- [ ] **Step 4: Verify the sidecar starts**

```bash
cd server/browser-use-bridge
pip install -r requirements.txt  # first time only
python main.py 8780 &
sleep 3
curl http://127.0.0.1:8780/health
```
Expected: `{"ok":true,"runtime":"browser-use","version":"0.1.0","ready":true}`

Kill with: `curl -X POST http://127.0.0.1:8780/cancel; kill %1`

- [ ] **Step 5: Commit**

```bash
git add server/browser-use-bridge/
git commit -m "feat(bridge): browser-use FastAPI sidecar — /health, /execute (SSE), /cancel"
```

---

## Task 2: Add browser-use to bridge supervisor (~1.5 hours)

- [ ] **Step 1: Read the current bridge supervisor**

Read `electron/services/bridgeSupervisor.js`. Note the current structure:
- `DEFAULTS` entries use `{ name, port, dir }` — NOT `{ key, entry, runtime, args }`
- `startOne()` hardcodes `spawnImpl('node', [path.join(rootDir, cfg.dir, 'index.js'), '--port', String(cfg.port)])`
- `buildEnv(key)` gets config via `require('../store').store.getConfig()` and uses `config.doubaoVisionEndpoint`, `config.doubaoVisionApiKey`, `config.doubaoVisionModel` (these already exist in the app config store for uitars/midscene bridges)

- [ ] **Step 2: Add browser-use entry to DEFAULTS**

In `bridgeSupervisor.js`, add to the `DEFAULTS` object:

```js
browserUse: { name: 'browser-use-bridge', port: 8780, dir: 'server/browser-use-bridge' }
```

- [ ] **Step 3: Add browser-use env vars in buildEnv()**

In the `buildEnv(key)` function, add after the existing `midscene` block:

```js
if (key === 'browserUse') {
  env.BROWSER_USE_MODEL_ENDPOINT = config.doubaoVisionEndpoint || ''
  env.BROWSER_USE_MODEL_API_KEY = config.doubaoVisionApiKey || ''
  env.BROWSER_USE_MODEL_NAME = config.doubaoVisionModel || 'doubao-seed-1-6-vision-250815'
}
```

`config` is already obtained via `require('../store').store.getConfig()` at the top of `buildEnv`. The `doubaoVision*` config keys already exist in the app config store (used by uitars/midscene bridges).

- [ ] **Step 4: Modify startOne() to support Python bridges**

The current `startOne()` hardcodes `spawnImpl('node', [path.join(rootDir, cfg.dir, 'index.js'), '--port', String(cfg.port)], spawnOptions)`.

Add a `runtime` field to DEFAULTS entries that need it, and branch in `startOne()`:

```js
// In DEFAULTS, add runtime field to the browserUse entry:
browserUse: { name: 'browser-use-bridge', port: 8780, dir: 'server/browser-use-bridge', runtime: 'python' }

// In startOne(), replace the hardcoded spawnImpl call:
const runtime = cfg.runtime || 'node'
const child = runtime === 'python'
  ? spawnImpl('python', ['-u', path.join(rootDir, cfg.dir, 'main.py'), String(cfg.port)], spawnOptions)
  : spawnImpl('node', [path.join(rootDir, cfg.dir, 'index.js'), '--port', String(cfg.port)], spawnOptions)
```

Only `browserUse` gets `runtime: 'python'`; existing entries default to `'node'` and are unchanged.

- [ ] **Step 5: Run the supervisor test**

```bash
npx vitest run electron/__tests__/bridge-supervisor.test.js
```

Existing tests must pass. If the test provides a mock `spawnImpl`, update it to handle the new `browserUse` default entry.

- [ ] **Step 6: Commit**

```bash
git add electron/services/bridgeSupervisor.js
git commit -m "feat(supervisor): add browser-use bridge entry (Python, port 8780)"
```

---

## Task 3: Create the browser-use adapter (~1.5 hours)

### Task 3.1: Adapter module

- [ ] **Step 1: Create the adapter**

File: `electron/services/browserUse/adapter.js`

```js
const PORT = 8780

function endpoint() {
  return `http://127.0.0.1:${PORT}`
}

async function healthCheck() {
  try {
    const resp = await fetch(`${endpoint()}/health`, { signal: AbortSignal.timeout(3000) })
    const data = await resp.json()
    return { available: data.ok === true && data.ready === true, detail: data }
  } catch {
    return { available: false, detail: { ok: false } }
  }
}

async function execute(action, context = {}) {
  const { goal, max_steps = 15, start_url, headless = true } = action.payload || action

  const resp = await fetch(`${endpoint()}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal, max_steps, start_url, headless }),
    signal: context.signal,
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    return { ok: false, error: { code: 'BRIDGE_ERROR', message: `browser-use bridge ${resp.status}: ${text.slice(0, 200)}` } }
  }

  // Read SSE stream
  const text = await resp.text()
  const events = parseSSE(text)

  const resultEvent = events.find(e => e.type === 'result')
  if (resultEvent) {
    return {
      ok: resultEvent.data?.success !== false,
      summary: resultEvent.data?.summary || '',
      final_url: resultEvent.data?.final_url || '',
      steps_completed: resultEvent.data?.steps_completed || 0,
      duration_ms: resultEvent.data?.duration_ms || 0,
      error: resultEvent.data?.error,
    }
  }

  return { ok: false, error: { code: 'NO_RESULT', message: 'browser-use 未返回结果事件。' } }
}

async function cancel() {
  try {
    await fetch(`${endpoint()}/cancel`, { method: 'POST' })
  } catch { /* bridge may already be down */ }
}

function parseSSE(text) {
  const events = []
  let currentType = ''
  let currentData = ''

  for (const line of text.split('\n')) {
    if (line.startsWith('event: ')) {
      currentType = line.slice(7).trim()
      currentData = ''
    } else if (line.startsWith('data: ')) {
      currentData += line.slice(6)
    } else if (line === '' && currentType) {
      try {
        events.push({ type: currentType, data: JSON.parse(currentData) })
      } catch {
        events.push({ type: currentType, data: currentData })
      }
      currentType = ''
      currentData = ''
    }
  }

  return events
}

module.exports = { healthCheck, execute, cancel, endpoint, PORT }
```

- [ ] **Step 2: Create the module index**

File: `electron/services/browserUse/index.js`

```js
const adapter = require('./adapter')

async function detect() {
  return adapter.healthCheck()
}

async function repair() {
  return {
    runtime: 'browser-use',
    guidance: '请确保 Python 3.11+ 已安装，并运行：pip install browser-use && playwright install chromium',
    installCommand: 'pip install browser-use && playwright install chromium --with-deps',
  }
}

async function getSetupGuide() {
  return {
    title: '浏览器自动化 (browser-use)',
    description: 'browser-use 通过 AI 驱动真实浏览器完成网页任务。需要 Python 3.11+ 和 Chromium。',
    steps: [
      '安装 Python 3.11 或更高版本',
      'pip install browser-use',
      'playwright install chromium --with-deps',
      '在设置页面配置 Doubao vision 模型的 API Key 和 endpoint',
    ],
  }
}

module.exports = { detect, repair, getSetupGuide, adapter }
```

- [ ] **Step 3: Unit test**

File: `electron/__tests__/browser-adapter.test.js`

```js
import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Mock global fetch
global.fetch = vi.fn()

const { healthCheck, execute, parseSSE } = require('../services/browserUse/adapter')

test('healthCheck returns available when bridge responds ok', async () => {
  fetch.mockResolvedValueOnce({
    json: async () => ({ ok: true, runtime: 'browser-use', version: '0.1.0', ready: true }),
  })

  const result = await healthCheck()
  expect(result.available).toBe(true)
  expect(result.detail.runtime).toBe('browser-use')
})

test('healthCheck returns unavailable on fetch error', async () => {
  fetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

  const result = await healthCheck()
  expect(result.available).toBe(false)
})

test('parseSSE extracts events from SSE stream', () => {
  const text = [
    'event: start',
    'data: {"goal":"test"}',
    '',
    'event: result',
    'data: {"success":true,"summary":"done"}',
    '',
    'event: done',
    'data: {"duration_ms":1000}',
    '',
  ].join('\n')

  const events = parseSSE(text)
  expect(events).toHaveLength(3)
  expect(events[0]).toEqual({ type: 'start', data: { goal: 'test' } })
  expect(events[1]).toEqual({ type: 'result', data: { success: true, summary: 'done' } })
  expect(events[2]).toEqual({ type: 'done', data: { duration_ms: 1000 } })
})
```

- [ ] **Step 4: Run test**

```bash
npx vitest run electron/__tests__/browser-adapter.test.js
```
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/services/browserUse/ electron/__tests__/browser-adapter.test.js
git commit -m "feat(browser-use): adapter — HTTP client for browser-use sidecar with SSE parsing"
```

---

## Task 4: Register browser_task tool (~1 hour)

- [ ] **Step 1: Write the tool handler**

File: `electron/tools/browserTask.js`

```js
const { register } = require('./index')
const { healthCheck, execute, cancel } = require('../services/browserUse/adapter')
const { requestConfirm } = require('../confirm')

async function browserTask(args, context = {}) {
  const { goal, max_steps = 15, start_url } = args

  if (!goal || typeof goal !== 'string') {
    return { error: { code: 'INVALID_ARGS', message: '需要提供 goal 参数（浏览器任务描述）。' } }
  }

  // Check sidecar health
  const health = await healthCheck()
  if (!health.available) {
    return {
      error: {
        code: 'RUNTIME_UNAVAILABLE',
        message: 'browser-use 运行时不可用。请确认 Python 3.11+ 和 browser-use 已安装，并在设置中配置 Doubao vision 模型。',
        detail: health.detail,
      },
    }
  }

  // Confirm with user (medium risk)
  if (!context.skipInternalConfirm) {
    const allowed = await requestConfirm({
      kind: 'browser-task',
      payload: { goal, max_steps, start_url },
    })
    if (!allowed) {
      return { error: { code: 'USER_CANCELLED', message: '用户已取消浏览器任务。' } }
    }
  }

  const result = await execute(
    { goal, max_steps, start_url },
    { signal: context.signal }
  )

  return result
}

register({
  name: 'browser_task',
  description: 'Run a self-contained web browser sub-task using AI. The agent will navigate, click, type, and extract information from real web pages. Use this for: logging into websites, scraping information, filling forms, navigating to URLs. Args: goal (required) — natural-language task description; max_steps (optional, default 15) — maximum browser steps; start_url (optional) — starting URL.',
  parameters: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'Natural-language description of the browser task.' },
      max_steps: { type: 'number', description: 'Maximum browser interaction steps. Default 15.' },
      start_url: { type: 'string', description: 'Optional starting URL.' },
    },
    required: ['goal'],
  },
}, browserTask)

module.exports = { browserTask }
```

- [ ] **Step 2: Load the tool in builtins**

In `electron/tools/index.js`, add `require('./browserTask')` to the `loadBuiltins()` function:

```js
function loadBuiltins() {
  if (builtinsLoaded) return
  builtinsLoaded = true
  require('./fs-read')
  require('./fs-write')
  require('./fs-destructive')
  require('./shell')
  require('./env')
  require('./docs')
  require('./remember')
  require('../skills/loader')
  require('./browserTask')  // NEW
}
```

- [ ] **Step 3: Update tool policy**

In `electron/security/toolPolicy.js`, add a case for `browser_task` in the `evaluateToolCall()` switch (before the `default` case):

```js
case 'browser_task':
  return { risk: RISK_LEVELS.MEDIUM, reason: '浏览器自动化任务会操作真实网页。' }
```

Note: `evaluateToolCallWithMeta` (the exported wrapper) automatically adds `allowed` and `requiresApproval` fields based on risk level — MEDIUM gets `allowed: true, requiresApproval: true`.

- [ ] **Step 4: Unit test**

File: `electron/__tests__/browser-task.test.js`

```js
import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Mock adapter before loading tool module
vi.mock('../services/browserUse/adapter', () => ({
  healthCheck: vi.fn(async () => ({ available: true, detail: { ok: true } })),
  execute: vi.fn(async () => ({ ok: true, summary: 'done', final_url: 'https://example.com' })),
  cancel: vi.fn(),
}))

// Force reload tool module
const { TOOLS, TOOL_SCHEMAS, loadBuiltins, execute } = require('../tools')
const toolPolicy = require('../security/toolPolicy')

test('browser_task is registered in tool registry', () => {
  // loadBuiltins should have already registered it (called at module load)
  const schemas = TOOL_SCHEMAS
  const browserTaskSchema = schemas.find(s => s.name === 'browser_task')
  expect(browserTaskSchema).toBeDefined()
  expect(browserTaskSchema.parameters.required).toContain('goal')
})

test('browser_task tool policy returns medium risk', () => {
  const decision = toolPolicy.evaluateToolCall('browser_task', { goal: 'test' })
  expect(decision.risk).toBe('medium')
  expect(decision.allowed).toBe(true)
  expect(decision.requiresApproval).toBe(true)
})

test('browser_task rejects empty goal', async () => {
  const result = await require('../tools/browserTask').browserTask({}, { skipInternalConfirm: true })
  expect(result.error).toBeDefined()
  expect(result.error.code).toBe('INVALID_ARGS')
})
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```
Expected: all existing tests pass + new browser task tests pass.

- [ ] **Step 6: Commit**

```bash
git add electron/tools/browserTask.js electron/tools/index.js electron/security/toolPolicy.js electron/__tests__/browser-task.test.js
git commit -m "feat(tool): register browser_task tool — browser-use web automation"
```

---

## Task 5: Wire adapter into action broker (OPTIONAL — skip for Phase C)

The action broker (`electron/security/actionBroker.js`) is used by the legacy execute mode. For Phase C, the `browser_task` tool works directly through the tool registry used by the agent loop — no broker registration is required. Skip this task. If the legacy Control Center needs browser-use status in a future phase, registration can be added then.

---

## Task 6: End-to-end smoke test (~30 min)

- [ ] **Step 1: Start the browser-use bridge manually**

```bash
cd server/browser-use-bridge
python main.py 8780 &
sleep 3
```

- [ ] **Step 2: Test health**

```bash
curl http://127.0.0.1:8780/health
```

- [ ] **Step 3: Run a simple task via curl (SSE)**

```bash
curl -X POST http://127.0.0.1:8780/execute \
  -H "Content-Type: application/json" \
  -d '{"goal":"Go to example.com and return the page title.","max_steps":5,"headless":true}'
```

Expected: SSE stream with `start`, `result`, `done` events. If the model key isn't configured, expect a `result` with `success: false` and a helpful error — not a crash.

- [ ] **Step 4: Run the full integration smoke test via Node**

Create `scripts/smoke-browser-task.js`:

```js
// Same mock-Electron pattern as smoke-agent-frontend.js
// Calls agentLoop.runTurn with "open example.com and tell me the page title"
// Requires browser-use bridge running + Doubao key configured
```

- [ ] **Step 5: Kill the bridge**

```bash
curl -X POST http://127.0.0.1:8780/cancel
kill %1
```

- [ ] **Step 6: Append results to `docs/test-report.md`** under `## Phase C acceptance smoke`.

---

## Phase C Definition of Done

- [ ] `server/browser-use-bridge/` exists with `main.py`, `browser_agent.py`, `requirements.txt`
- [ ] `GET /health` returns `{ ok: true, runtime: 'browser-use', ready: true }`
- [ ] `POST /execute` accepts `{ goal, max_steps, start_url, headless }` and returns SSE stream
- [ ] `POST /cancel` cancels in-flight task
- [ ] `bridgeSupervisor.js` includes `browser-use` entry in DEFAULTS with `runtime: 'python'`
- [ ] `buildEnv` injects `BROWSER_USE_MODEL_*` env vars from Doubao vision config
- [ ] `electron/services/browserUse/adapter.js` calls sidecar over HTTP, parses SSE
- [ ] `browser_task` tool registered in `tools/index.js` and visible in `getAgentLoopToolSchemas()`
- [ ] `toolPolicy.evaluateToolCall('browser_task', ...)` returns MEDIUM risk with approval
- [ ] All existing tests pass (46+ test files)
- [ ] `npm run build:client` passes
- [ ] No midscene/planner/old code deleted or broken
- [ ] Branch ready for Phase D (UI-TARS tools wrapper + old code retirement)

---

## Out of scope (Phase D/E)

- Deleting midscene-bridge, actionPlanner, visionPlanner
- Desktop tools (`desktop.observe`, `desktop.click`, `desktop.type`) — these are UI-TARS, not browser-use
- SQLite conversation persistence
- Skill registry / plugin mechanism
- Frontend browser-task result cards (basic tool card rendering already works from Phase B)
- uv-based Python bootstrap (Phase D)
- Login-state preservation / browser profiles
- Multi-tab or concurrent browser tasks
- Shipping Python inside the Electron installer
