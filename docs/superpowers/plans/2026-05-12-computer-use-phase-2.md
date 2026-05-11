# Computer Use Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Computer Use so it plans from screenshots, streams live progress, pauses for user help, executes scroll/drag safely, and drives a visible virtual cursor during real desktop actions.

**Architecture:** Keep the current split: `server/desktop-use-bridge` owns screen observation, planning, and OS input; Electron owns policy, chat state, user intervention, and overlay rendering; the React chat remains the only user-facing control surface. Add a bridge event stream keyed by `sessionId` so desktop events can reach Electron while `/execute` is still running, and add a resume path for `ask_user` pauses.

**Tech Stack:** Node/Express sidecar, OpenAI-compatible Chat Completions over `fetch`, `screenshot-desktop`, `@nut-tree-fork/nut-js`, Electron IPC, React hooks/components, Vitest, Supertest.

---

## Scope Check

This is one cohesive runtime feature even though it touches server, Electron, and renderer. The bridge event protocol is the shared boundary; each task below lands one testable slice without changing Browser Use.

## File Structure

- Create `server/desktop-use-bridge/eventHub.js`: in-memory event bus for live task events and `ask_user` resume promises.
- Create `server/desktop-use-bridge/__tests__/planner.test.js`: multimodal planner messages and action normalization.
- Modify `server/desktop-use-bridge/planner.js`: screenshot image payloads, strict action schema, new action normalization.
- Modify `server/desktop-use-bridge/agentRunner.js`: observe-plan-act-verify loop, confidence gating, `ask_user`, scroll, drag, live event names.
- Modify `server/desktop-use-bridge/driver.js`: add `drag()` and normalize action result metadata.
- Modify `server/desktop-use-bridge/translator.js`: accept `desktop.drag` for direct bridge calls.
- Modify `server/desktop-use-bridge/index.js`: add `/events/:sessionId`, `/resume`, and wire runner events into the hub.
- Modify `server/desktop-use-bridge/__tests__/agentRunner.test.js`: runner events, pause/resume, low-confidence safety, scroll/drag.
- Modify `server/desktop-use-bridge/__tests__/driver.test.js`: drag coordinate scaling.
- Modify `server/desktop-use-bridge/__tests__/execute.test.js`: event streaming and resume endpoint.
- Modify `electron/services/desktop/adapter.js`: subscribe to bridge events, forward them to callers, answer `ask_user` through `/resume`.
- Modify `electron/tools/desktopTask.js`: pass live event and user-intervention callbacks from tool context.
- Modify `electron/services/agentLoop.js`: forward desktop task events as stream events while a tool is running.
- Modify `electron/ipc/chat.js`: manage pending desktop questions, live overlay events, and desktop ask replies.
- Modify `electron/services/desktopCursorOverlay.js`: render states for move, click, drag, scroll, type, paused, failed, done.
- Modify `client/src/lib/api.js`: expose desktop ask/progress stream callbacks.
- Modify `client/src/hooks/useChat.js`: display Computer Use progress and route desktop ask replies without aborting the active task.
- Modify chat rendering tests under `client/src/components/chat` only if progress or ask-user messages need static assertions.
- Update focused tests in `electron/__tests__` and `client/src/lib`.

## Task 1: Multimodal Planner Contract

**Files:**
- Create: `server/desktop-use-bridge/__tests__/planner.test.js`
- Modify: `server/desktop-use-bridge/planner.js`

- [ ] **Step 1: Write failing planner tests**

Create `server/desktop-use-bridge/__tests__/planner.test.js`:

```js
import { describe, expect, test, vi } from 'vitest'
import { buildPlannerMessages, createPlanner, normalizeAction } from '../planner'

const observation = {
  screenshotBase64: 'abc123',
  mime: 'image/png',
  screen: { width: 2560, height: 1440, scaleFactor: 1.25, nativeWidth: 2048, nativeHeight: 1152 }
}

describe('desktop planner', () => {
  test('builds a multimodal message with screenshot image data', () => {
    const messages = buildPlannerMessages({ goal: 'open notepad', step: 2, maxSteps: 8, observation, steps: [] })
    expect(messages[0].role).toBe('system')
    expect(messages[1].role).toBe('user')
    expect(messages[1].content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('open notepad') }),
      expect.objectContaining({ type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } })
    ]))
  })

  test('normalizes new planner actions', () => {
    expect(normalizeAction({ action: 'scroll', x: 10, y: 20, direction: 'down', amount: 4, confidence: 0.8 }).type).toBe('scroll')
    expect(normalizeAction({ action: 'drag', from: { x: 1, y: 2 }, to: { x: 3, y: 4 }, confidence: 0.9 }).type).toBe('drag')
    expect(normalizeAction({ action: 'ask_user', question: 'Please log in', confidence: 0.95 }).type).toBe('ask_user')
  })

  test('planner sends response format and parses JSON action', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"action":"done","summary":"finished"}' } }] })
    }))
    const planner = createPlanner({ fetchImpl, env: { DESKTOP_USE_MODEL_API_KEY: 'key', DESKTOP_USE_MODEL_ENDPOINT: 'https://example.test', DESKTOP_USE_MODEL_NAME: 'vision-model' } })

    const action = await planner.nextAction({ goal: 'finish', step: 1, maxSteps: 3, observation, steps: [] })

    expect(action).toEqual(expect.objectContaining({ type: 'done', summary: 'finished' }))
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.model).toBe('vision-model')
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages[1].content[1].image_url.url).toBe('data:image/png;base64,abc123')
  })
})
```

Run:

```powershell
npm.cmd exec -- vitest run server/desktop-use-bridge/__tests__/planner.test.js
```

Expected: FAIL because `buildPlannerMessages` and the new actions are not implemented.

- [ ] **Step 2: Implement planner message building and action normalization**

Modify `server/desktop-use-bridge/planner.js` with these exported helpers:

```js
const ACTION_TYPES = new Set(['click', 'type', 'hotkey', 'wait', 'scroll', 'drag', 'ask_user', 'done', 'fail'])

function actionType(action) {
  return String(action?.action || action?.type || '').trim().toLowerCase()
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizePoint(value = {}) {
  return { x: finiteNumber(value.x), y: finiteNumber(value.y) }
}

function normalizeConfidence(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(0, Math.min(1, parsed))
}

function normalizeAction(action) {
  const type = actionType(action)
  const base = {
    type: ACTION_TYPES.has(type) ? type : 'unsupported',
    confidence: normalizeConfidence(action?.confidence),
    reason: String(action?.reason || ''),
    userVisibleSummary: String(action?.userVisibleSummary || action?.summary || action?.reason || ''),
    raw: action,
  }
  if (base.type === 'click') return { ...base, x: finiteNumber(action.x), y: finiteNumber(action.y), button: action.button || 'left' }
  if (base.type === 'type') return { ...base, text: String(action.text ?? '') }
  if (base.type === 'hotkey') return { ...base, keys: Array.isArray(action.keys) ? action.keys.map(String) : String(action.keys || '').split('+') }
  if (base.type === 'wait') return { ...base, ms: Math.max(0, finiteNumber(action.ms, 500)) }
  if (base.type === 'scroll') return { ...base, x: finiteNumber(action.x), y: finiteNumber(action.y), direction: action.direction || 'down', amount: finiteNumber(action.amount, 3) }
  if (base.type === 'drag') return { ...base, from: normalizePoint(action.from), to: normalizePoint(action.to), durationMs: Math.max(0, finiteNumber(action.durationMs, 300)) }
  if (base.type === 'ask_user') return { ...base, question: String(action.question || action.userVisibleSummary || 'Computer Use needs your input to continue.') }
  if (base.type === 'done') return { ...base, summary: String(action.summary || 'Desktop task completed.') }
  if (base.type === 'fail') return { ...base, summary: String(action.summary || action.reason || 'Desktop task failed.') }
  return { ...base, raw: action }
}

function buildPlannerMessages({ goal, step, maxSteps, observation = {}, steps = [] }) {
  const screen = observation.screen || {}
  const history = steps.slice(-8).map((item) => ({ type: item.type, action: item.action, summary: item.summary, ok: item.ok }))
  const text = [
    `Goal: ${goal}`,
    `Step: ${step} of ${maxSteps}`,
    `Screen: ${JSON.stringify(screen)}`,
    `Recent history: ${JSON.stringify(history)}`,
    'Return only JSON with action, confidence, reason, userVisibleSummary, and action-specific fields.',
    'Use ask_user when login, permission, ambiguity, or low confidence blocks safe execution.',
  ].join('\n')
  const content = [{ type: 'text', text }]
  if (observation.screenshotBase64) {
    content.push({ type: 'image_url', image_url: { url: `data:${observation.mime || 'image/png'};base64,${observation.screenshotBase64}` } })
  }
  return [
    { role: 'system', content: 'You operate a Windows desktop. Plan one safe next desktop action. Return strict JSON only.' },
    { role: 'user', content },
  ]
}
```

Update `createPlanner().nextAction()` to call `buildPlannerMessages({ goal, step, maxSteps, observation, steps })` and include:

```js
response_format: { type: 'json_object' }
```

Export:

```js
module.exports = { createPlanner, normalizeAction, extractJson, buildPlannerMessages }
```

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm.cmd exec -- vitest run server/desktop-use-bridge/__tests__/planner.test.js
```

Expected: PASS.

Commit:

```powershell
git add server/desktop-use-bridge/planner.js server/desktop-use-bridge/__tests__/planner.test.js
git commit -m "feat: send screenshots to desktop planner"
```

## Task 2: Runner Safety, Events, And User Pause

**Files:**
- Modify: `server/desktop-use-bridge/agentRunner.js`
- Modify: `server/desktop-use-bridge/__tests__/agentRunner.test.js`

- [ ] **Step 1: Add failing runner tests**

Append to `server/desktop-use-bridge/__tests__/agentRunner.test.js`:

```js
test('emits observe plan action verify and terminal events in order', async () => {
  const driver = createDriver()
  driver.scroll = vi.fn(async (args) => ({ ok: true, action: { type: 'scroll', ...args } }))
  const planner = {
    nextAction: vi.fn()
      .mockResolvedValueOnce({ type: 'scroll', x: 5, y: 6, direction: 'down', amount: 2, confidence: 0.8, userVisibleSummary: 'scrolling' })
      .mockResolvedValueOnce({ type: 'done', summary: 'done' })
  }
  const events = []
  const runner = createAgentRunner({ driver, planner })

  const result = await runner.runTask({ goal: 'scroll page', maxSteps: 3, onEvent: event => events.push(event) })

  expect(result.ok).toBe(true)
  expect(events.map(event => event.type)).toEqual(expect.arrayContaining(['task_started', 'observe', 'plan', 'cursor_move', 'action_start', 'action_result', 'verify', 'done']))
  expect(driver.scroll).toHaveBeenCalledWith({ x: 5, y: 6, direction: 'down', amount: 2 })
})

test('asks the user and resumes after answer', async () => {
  const driver = createDriver()
  const planner = {
    nextAction: vi.fn()
      .mockResolvedValueOnce({ type: 'ask_user', question: 'Please log in', confidence: 1 })
      .mockResolvedValueOnce({ type: 'done', summary: 'continued' })
  }
  const events = []
  const runner = createAgentRunner({ driver, planner })

  const result = await runner.runTask({
    goal: 'send message',
    maxSteps: 3,
    onEvent: event => events.push(event),
    waitForUser: vi.fn(async () => 'logged in, continue')
  })

  expect(result.ok).toBe(true)
  expect(events.some(event => event.type === 'ask_user')).toBe(true)
  expect(events.some(event => event.type === 'resumed')).toBe(true)
  expect(planner.nextAction.mock.calls[1][0].userReplies.at(-1).answer).toBe('logged in, continue')
})

test('does not execute low confidence pointer actions', async () => {
  const driver = createDriver()
  const planner = { nextAction: vi.fn(async () => ({ type: 'click', x: 10, y: 20, confidence: 0.3, reason: 'not sure' })) }
  const runner = createAgentRunner({ driver, planner })

  const result = await runner.runTask({ goal: 'click maybe', maxSteps: 1 })

  expect(result.ok).toBe(false)
  expect(result.error.code).toBe('LOW_CONFIDENCE_ACTION')
  expect(driver.click).not.toHaveBeenCalled()
})
```

Run:

```powershell
npm.cmd exec -- vitest run server/desktop-use-bridge/__tests__/agentRunner.test.js
```

Expected: FAIL because the runner lacks these events and actions.

- [ ] **Step 2: Implement event naming, confidence gates, and pause/resume**

Modify `server/desktop-use-bridge/agentRunner.js`:

```js
const LOW_CONFIDENCE_THRESHOLD = 0.55
const POINTER_ACTIONS = new Set(['click', 'drag', 'scroll'])

function emit(onEvent, event) {
  onEvent?.({ ts: Date.now(), ...event })
}

function isLowConfidence(action) {
  return POINTER_ACTIONS.has(action.type) && Number(action.confidence) < LOW_CONFIDENCE_THRESHOLD
}
```

In `runTask()`, initialize:

```js
const userReplies = []
emit(onEvent, { type: 'task_started', goal, maxSteps })
```

Call the planner with:

```js
const plannedRaw = await planner.nextAction({ goal, step, maxSteps, observation: observation || {}, steps, userReplies })
```

After normalization, block unsafe pointer actions:

```js
if (isLowConfidence(action)) {
  const error = { code: 'LOW_CONFIDENCE_ACTION', message: action.reason || 'Planner confidence is too low for desktop input.' }
  emit(onEvent, { type: 'fail', code: error.code, summary: error.message })
  return { ok: false, summary: error.message, steps, error }
}
```

Handle `ask_user` before execution:

```js
if (action.type === 'ask_user') {
  const requestId = `ask-${Date.now()}-${step}`
  emit(onEvent, { type: 'ask_user', requestId, question: action.question, summary: action.userVisibleSummary || action.question })
  if (!waitForUser) {
    const error = { code: 'USER_INPUT_REQUIRED', message: action.question }
    return { ok: false, paused: true, summary: action.question, steps, error, requestId }
  }
  const answer = await waitForUser({ requestId, question: action.question, action, step })
  userReplies.push({ requestId, question: action.question, answer: String(answer || '') })
  emit(onEvent, { type: 'resumed', requestId })
  continue
}
```

Emit new event names around every action:

```js
emit(onEvent, { type: 'plan', step, action, summary: action.userVisibleSummary || action.reason || action.type })
const executed = await executeAction(action, onEvent)
emit(onEvent, { type: 'action_result', step, action: action.type, ok: executed?.ok !== false, result: executed.result })
```

After execution, observe once for verification:

```js
const verification = driver?.observe ? await driver.observe() : null
steps.push({ type: 'verify', ok: Boolean(verification), screen: verification?.screen || null })
emit(onEvent, { type: 'verify', step, screen: verification?.screen || null })
```

Emit terminal events for `done`, `fail`, `cancelled`, and max steps.

- [ ] **Step 3: Add scroll and drag execution cases**

In `executeAction()`:

```js
if (action.type === 'scroll') {
  const payload = { x: Number(action.x) || 0, y: Number(action.y) || 0, direction: action.direction || 'down', amount: Number(action.amount) || 3 }
  onEvent?.({ type: 'cursor_move', x: payload.x, y: payload.y, state: 'scrolling', reason: action.reason || '' })
  onEvent?.({ type: 'action_start', action: 'scroll', target: payload })
  const result = await driver.scroll(payload)
  return { ok: result?.ok !== false, result }
}
if (action.type === 'drag') {
  const payload = { from: action.from, to: action.to, durationMs: action.durationMs || 300 }
  onEvent?.({ type: 'cursor_move', x: payload.from.x, y: payload.from.y, state: 'dragging', reason: action.reason || '' })
  onEvent?.({ type: 'action_start', action: 'drag', target: payload })
  const result = await driver.drag(payload)
  return { ok: result?.ok !== false, result }
}
```

Keep the old `cursor.move` and `cursor.click` compatibility events for existing overlay tests until Task 7 broadens the overlay.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm.cmd exec -- vitest run server/desktop-use-bridge/__tests__/agentRunner.test.js
```

Expected: PASS.

Commit:

```powershell
git add server/desktop-use-bridge/agentRunner.js server/desktop-use-bridge/__tests__/agentRunner.test.js
git commit -m "feat: stream desktop runner events"
```

## Task 3: Driver Drag And Direct Bridge Action Support

**Files:**
- Modify: `server/desktop-use-bridge/driver.js`
- Modify: `server/desktop-use-bridge/translator.js`
- Modify: `server/desktop-use-bridge/__tests__/driver.test.js`
- Modify: `server/desktop-use-bridge/__tests__/translator.test.js`
- Modify: `server/desktop-use-bridge/__tests__/execute.test.js`

- [ ] **Step 1: Write failing drag tests**

Add to `server/desktop-use-bridge/__tests__/driver.test.js`:

```js
test('drag maps screenshot coordinates to native coordinates', async () => {
  const nutjs = createNutjs()
  nutjs.mouse.drag = vi.fn(async () => undefined)
  const driver = createDriver({ nutjs, screenshotImpl: async () => pngWithSize(2560, 1440) })

  await driver.observe()
  const result = await driver.drag({ from: { x: 1000, y: 1200 }, to: { x: 1200, y: 1300 }, durationMs: 250 })

  expect(nutjs.moved[0]).toMatchObject({ x: 800, y: 960 })
  expect(result.action).toMatchObject({ type: 'drag', nativeFrom: { x: 800, y: 960 }, nativeTo: { x: 960, y: 1040 } })
})
```

Add to `server/desktop-use-bridge/__tests__/translator.test.js`:

```js
test('classifies desktop drag actions', () => {
  expect(classify({ type: 'desktop.drag', payload: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } } })).toMatchObject({
    backend: 'drag',
    from: { x: 1, y: 2 },
    to: { x: 3, y: 4 }
  })
})
```

Add to `server/desktop-use-bridge/__tests__/execute.test.js`:

```js
test('desktop drag dispatches to driver', async () => {
  const driver = createDriver()
  driver.drag = vi.fn(async (args) => ({ ok: true, action: { type: 'drag', ...args } }))
  const app = createApp({ driver })

  await request(app).post('/execute').send({ type: 'desktop.drag', approved: true, payload: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } } })

  expect(driver.drag).toHaveBeenCalledWith({ from: { x: 1, y: 2 }, to: { x: 3, y: 4 }, durationMs: 300 })
})
```

Run:

```powershell
npm.cmd exec -- vitest run server/desktop-use-bridge/__tests__/driver.test.js server/desktop-use-bridge/__tests__/translator.test.js server/desktop-use-bridge/__tests__/execute.test.js
```

Expected: FAIL because drag is not implemented.

- [ ] **Step 2: Implement driver drag**

In `server/desktop-use-bridge/driver.js`, add:

```js
async function moveToPoint(value) {
  const native = point(value.x, value.y)
  await nutjs.mouse.move(nutjs.straightTo(native))
  return native
}
```

Inside the returned object:

```js
async drag({ from, to, durationMs = 300 }) {
  const nativeFrom = await moveToPoint(from)
  const nativeTo = point(to.x, to.y)
  if (typeof nutjs.mouse.drag === 'function') {
    await nutjs.mouse.drag(nutjs.straightTo(nativeTo))
  } else {
    await nutjs.mouse.pressButton?.(nutjs.Button?.LEFT || 0)
    await nutjs.mouse.move(nutjs.straightTo(nativeTo))
    await nutjs.mouse.releaseButton?.(nutjs.Button?.LEFT || 0)
  }
  return {
    ok: true,
    action: {
      type: 'drag',
      from,
      to,
      nativeFrom: { x: nativeFrom.x, y: nativeFrom.y },
      nativeTo: { x: nativeTo.x, y: nativeTo.y },
      durationMs
    }
  }
}
```

- [ ] **Step 3: Implement translator and endpoint drag dispatch**

In `server/desktop-use-bridge/translator.js`, add:

```js
function pointPayload(value = {}) {
  return { x: num(value.x), y: num(value.y) }
}

if (type === 'desktop.drag') {
  return {
    backend: 'drag',
    from: pointPayload(payload.from),
    to: pointPayload(payload.to),
    durationMs: Math.max(0, num(payload.durationMs, 300))
  }
}
```

In `server/desktop-use-bridge/index.js`, add:

```js
if (plan.backend === 'drag') {
  const result = await driver.drag({ from: plan.from, to: plan.to, durationMs: plan.durationMs })
  return res.json(normalize({ ok: result.ok, metadata: result }))
}
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm.cmd exec -- vitest run server/desktop-use-bridge/__tests__/driver.test.js server/desktop-use-bridge/__tests__/translator.test.js server/desktop-use-bridge/__tests__/execute.test.js
```

Expected: PASS.

Commit:

```powershell
git add server/desktop-use-bridge/driver.js server/desktop-use-bridge/translator.js server/desktop-use-bridge/index.js server/desktop-use-bridge/__tests__/driver.test.js server/desktop-use-bridge/__tests__/translator.test.js server/desktop-use-bridge/__tests__/execute.test.js
git commit -m "feat: support desktop drag actions"
```

## Task 4: Bridge Event Stream And Resume Endpoint

**Files:**
- Create: `server/desktop-use-bridge/eventHub.js`
- Modify: `server/desktop-use-bridge/index.js`
- Modify: `server/desktop-use-bridge/__tests__/execute.test.js`

- [ ] **Step 1: Write failing event stream tests**

Append to `server/desktop-use-bridge/__tests__/execute.test.js`:

```js
test('desktop task publishes live events to session event stream', async () => {
  const agentRunner = {
    ready: () => true,
    runTask: vi.fn(async ({ onEvent }) => {
      onEvent({ type: 'task_started', summary: 'started' })
      onEvent({ type: 'done', summary: 'finished' })
      return { ok: true, summary: 'finished', steps: [] }
    }),
    cancel: vi.fn(async () => ({ ok: true })),
  }
  const app = createApp({ driver: createDriver(), agentRunner })
  const server = app.listen(0)
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  try {
    const events = []
    const eventResponse = await fetch(`${baseUrl}/events/session-live`)
    const reader = eventResponse.body.getReader()
    const executePromise = fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'desktop.task', approved: true, sessionId: 'session-live', payload: { goal: 'Open Notepad' } })
    })
    const decoder = new TextDecoder()
    while (events.length < 2) {
      const chunk = await reader.read()
      events.push(...decoder.decode(chunk.value).split('\n\n').filter(Boolean))
    }
    const executeResponse = await executePromise
    expect((await executeResponse.json()).ok).toBe(true)
    expect(events.join('\n')).toContain('task_started')
    expect(events.join('\n')).toContain('done')
  } finally {
    server.close()
  }
})

test('resume endpoint answers pending ask_user request', async () => {
  const app = createApp({ driver: createDriver() })
  const hub = app.locals.eventHub
  const pending = hub.waitForUser({ sessionId: 'session-resume', requestId: 'ask-1', question: 'Continue?' })

  const response = await request(app).post('/resume').send({ sessionId: 'session-resume', requestId: 'ask-1', answer: 'continue' })

  await expect(pending).resolves.toBe('continue')
  expect(response.body.ok).toBe(true)
})
```

Run:

```powershell
npm.cmd exec -- vitest run server/desktop-use-bridge/__tests__/execute.test.js -t "event stream|resume"
```

Expected: FAIL because the event hub and endpoints do not exist.

- [ ] **Step 2: Create the event hub**

Create `server/desktop-use-bridge/eventHub.js`:

```js
function sseData(event) {
  return `data: ${JSON.stringify(event)}\n\n`
}

function createEventHub() {
  const subscribers = new Map()
  const pendingReplies = new Map()

  function key(sessionId, requestId) {
    return `${sessionId}:${requestId}`
  }

  function publish(sessionId, event) {
    const payload = { sessionId, ts: Date.now(), ...event }
    for (const res of subscribers.get(sessionId) || []) res.write(sseData(payload))
    return payload
  }

  function subscribe(sessionId, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write('\n')
    const set = subscribers.get(sessionId) || new Set()
    set.add(res)
    subscribers.set(sessionId, set)
    res.on('close', () => {
      set.delete(res)
      if (!set.size) subscribers.delete(sessionId)
    })
  }

  function waitForUser({ sessionId, requestId, question }) {
    publish(sessionId, { type: 'ask_user', requestId, question, summary: question })
    return new Promise((resolve) => {
      pendingReplies.set(key(sessionId, requestId), resolve)
    })
  }

  function resume({ sessionId, requestId, answer }) {
    const pendingKey = key(sessionId, requestId)
    const resolve = pendingReplies.get(pendingKey)
    if (!resolve) return false
    pendingReplies.delete(pendingKey)
    resolve(String(answer || ''))
    publish(sessionId, { type: 'resumed', requestId })
    return true
  }

  return { publish, subscribe, waitForUser, resume }
}

module.exports = { createEventHub }
```

- [ ] **Step 3: Wire endpoints into the bridge app**

In `server/desktop-use-bridge/index.js`:

```js
const { createEventHub } = require('./eventHub')
```

Inside `createApp()`:

```js
const eventHub = deps.eventHub || createEventHub()
app.locals.eventHub = eventHub
```

Add routes:

```js
app.get('/events/:sessionId', (req, res) => {
  eventHub.subscribe(String(req.params.sessionId || 'default'), res)
})

app.post('/resume', (req, res) => {
  const ok = eventHub.resume({
    sessionId: String(req.body?.sessionId || 'default'),
    requestId: String(req.body?.requestId || ''),
    answer: req.body?.answer
  })
  res.json({ ok })
})
```

For task execution:

```js
const sessionId = String(action.sessionId || 'default')
const result = await agentRunner.runTask({
  goal: plan.goal,
  maxSteps: plan.maxSteps,
  onEvent: event => {
    events.push(event)
    eventHub.publish(sessionId, event)
  },
  waitForUser: request => eventHub.waitForUser({ sessionId, requestId: request.requestId, question: request.question })
})
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm.cmd exec -- vitest run server/desktop-use-bridge/__tests__/execute.test.js
```

Expected: PASS.

Commit:

```powershell
git add server/desktop-use-bridge/eventHub.js server/desktop-use-bridge/index.js server/desktop-use-bridge/__tests__/execute.test.js
git commit -m "feat: stream desktop bridge events"
```

## Task 5: Electron Adapter Live Events And Ask Replies

**Files:**
- Modify: `electron/services/desktop/adapter.js`
- Modify: `electron/tools/desktopTask.js`
- Modify: `electron/__tests__/desktop-adapter.test.js`
- Modify: `electron/__tests__/desktop-tools.test.js`

- [ ] **Step 1: Write failing adapter stream tests**

Append to `electron/__tests__/desktop-adapter.test.js`:

```js
test('execute subscribes to desktop event stream and forwards events', async () => {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"observe","summary":"Looking"}\n\n'))
      controller.close()
    }
  })
  fetchMock
    .mockResolvedValueOnce({ ok: true, body: stream })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, exitCode: 0, metadata: { summary: 'done' } }) })
  const events = []

  const result = await execute(
    { type: 'desktop.task', payload: { goal: 'Open Notepad' } },
    { sessionId: 'conversation-events', onEvent: event => events.push(event) }
  )

  expect(result.ok).toBe(true)
  expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8790/events/conversation-events')
  expect(events).toContainEqual(expect.objectContaining({ type: 'observe', summary: 'Looking' }))
})

test('execute answers ask_user events through resume endpoint', async () => {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"ask_user","requestId":"ask-1","question":"Continue?"}\n\n'))
      controller.close()
    }
  })
  fetchMock
    .mockResolvedValueOnce({ ok: true, body: stream })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, exitCode: 0, metadata: { summary: 'done' } }) })

  await execute(
    { type: 'desktop.task', payload: { goal: 'Continue task' } },
    { sessionId: 'conversation-ask', waitForUser: vi.fn(async () => 'continue') }
  )

  expect(fetchMock).toHaveBeenCalledWith(
    'http://127.0.0.1:8790/resume',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ sessionId: 'conversation-ask', requestId: 'ask-1', answer: 'continue' })
    })
  )
})
```

Run:

```powershell
npm.cmd exec -- vitest run electron/__tests__/desktop-adapter.test.js -t "event stream|ask_user"
```

Expected: FAIL because the adapter has no event subscription.

- [ ] **Step 2: Implement SSE reader and resume posting**

In `electron/services/desktop/adapter.js`, add helpers:

```js
async function postResume({ sessionId, requestId, answer }) {
  const resp = await fetch(`${endpoint()}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, requestId, answer }),
  })
  return resp.json().catch(() => ({ ok: false }))
}

async function readEventStream(resp, context) {
  if (!resp?.body?.getReader) return
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''
    for (const frame of frames) {
      const line = frame.split('\n').find((entry) => entry.startsWith('data: '))
      if (!line) continue
      const event = JSON.parse(line.slice(6))
      context.onEvent?.(event)
      if (event.type === 'ask_user') {
        const answer = context.waitForUser
          ? await context.waitForUser(event)
          : 'cancel'
        await postResume({ sessionId: context.sessionId || 'default', requestId: event.requestId, answer })
      }
    }
  }
}
```

In `execute()`, before posting `/execute`:

```js
const eventController = new AbortController()
const eventsPromise = context.onEvent || context.waitForUser
  ? fetch(`${endpoint()}/events/${encodeURIComponent(sessionId)}`, { signal: eventController.signal })
      .then((resp) => readEventStream(resp, { ...context, sessionId }))
      .catch(() => null)
  : null
```

In `finally`:

```js
eventController.abort()
await eventsPromise?.catch(() => null)
```

- [ ] **Step 3: Pass callbacks through the desktop task tool**

In `electron/tools/desktopTask.js`, update the adapter call:

```js
const result = await execute(
  { type: 'desktop.task', payload },
  {
    signal: context.signal,
    sessionId: context.sessionId || context.convId,
    onEvent: context.onDesktopEvent,
    waitForUser: context.waitForDesktopUser,
  }
)
```

Add a test to `electron/__tests__/desktop-tools.test.js` that stubs the adapter and verifies `onDesktopEvent` and `waitForDesktopUser` are passed. If the existing test imports the real adapter before stubbing, use `vi.resetModules()` and `vi.doMock('../services/desktop/adapter', ...)` in that focused test.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm.cmd exec -- vitest run electron/__tests__/desktop-adapter.test.js electron/__tests__/desktop-tools.test.js
```

Expected: PASS.

Commit:

```powershell
git add electron/services/desktop/adapter.js electron/tools/desktopTask.js electron/__tests__/desktop-adapter.test.js electron/__tests__/desktop-tools.test.js
git commit -m "feat: forward live desktop events to electron"
```

## Task 6: Agent Loop And Chat IPC Desktop Interaction

**Files:**
- Modify: `electron/services/agentLoop.js`
- Modify: `electron/ipc/chat.js`
- Modify: `electron/__tests__/agent-loop.test.js`
- Modify: `electron/__tests__/chat.test.js`

- [ ] **Step 1: Write failing agent loop test for desktop events**

Add to `electron/__tests__/agent-loop.test.js`:

```js
test('desktop_task streams desktop events while tool is running', async () => {
  const streamEvents = []
  const desktopEvent = { type: 'observe', summary: 'Looking at desktop' }
  const tools = {
    getAgentLoopToolSchemas: () => [],
    execute: vi.fn(async (_name, _args, context) => {
      context.onDesktopEvent(desktopEvent)
      return { goal: 'open', metadata: { summary: 'done' } }
    })
  }

  await runTurn({
    messages: [{ role: 'user', content: 'open notepad' }],
    forceTool: 'desktop_task',
    convId: 'conv-desktop',
    onStreamEvent: event => streamEvents.push(event),
    requestApproval: async () => true
  }, { tools, policy: { evaluateToolCall: () => ({ risk: 'low', requiresApproval: false }) } })

  expect(streamEvents).toContainEqual(expect.objectContaining({
    type: 'desktop_event',
    summary: 'Looking at desktop',
    desktopEvent
  }))
})
```

Run:

```powershell
npm.cmd exec -- vitest run electron/__tests__/agent-loop.test.js -t "desktop events"
```

Expected: FAIL because desktop event callbacks are not passed to tools.

- [ ] **Step 2: Add desktop event callback support in agentLoop**

In `electron/services/agentLoop.js`, create:

```js
function summarizeDesktopEvent(event = {}) {
  if (event.summary) return String(event.summary)
  if (event.type === 'cursor_move') return 'Moving the Computer Use cursor.'
  if (event.type === 'action_start') return `Starting desktop ${event.action || 'action'}.`
  if (event.type === 'action_result') return `Finished desktop ${event.action || 'action'}.`
  if (event.type === 'ask_user') return event.question || 'Computer Use needs your input.'
  if (event.type === 'done') return event.summary || 'Computer Use finished.'
  if (event.type === 'fail') return event.summary || event.message || 'Computer Use failed.'
  return `Computer Use: ${event.type || 'event'}`
}
```

When calling `tools.execute()`:

```js
const result = await tools.execute(call.name, call.args, {
  signal: ctl.signal,
  skipInternalConfirm: true,
  convId,
  onDesktopEvent: event => {
    emitStream('desktop_event', {
      tool: call.name,
      summary: summarizeDesktopEvent(event),
      desktopEvent: event,
    })
    onEvent?.('desktop_event', { call, event })
  },
  waitForDesktopUser: deps.waitForDesktopUser,
})
```

Pass `waitForDesktopUser` through the `runTurn()` argument object:

```js
async function runTurn({ messages, model, signal, onEvent, onStreamEvent, requestApproval, forceTool, forcedSkill, convId, waitForDesktopUser }, deps = {}) {
  deps = { ...deps, waitForDesktopUser }
```

- [ ] **Step 3: Write failing chat IPC tests for pending desktop questions**

Add to `electron/__tests__/chat.test.js`:

```js
test('chat:send resolves pending desktop ask reply without starting a new run', async () => {
  const ipcMain = createIpcMain()
  const send = vi.fn()
  let desktopAnswer
  const runTurn = vi.fn(async ({ waitForDesktopUser }) => {
    desktopAnswer = await waitForDesktopUser({ requestId: 'ask-1', question: 'Please log in' })
    return { finalText: `answer:${desktopAnswer}`, history: [] }
  })
  const register = createRegister({
    storeRef: { getConfig: () => ({ permissionMode: 'default' }) },
    runTurn,
    userRules: { buildSystemPromptSection: () => '' },
    skillRegistry: { listSkills: () => [], buildSkillIndex: () => '', findSkill: () => null },
    desktopCursorOverlay: { getDesktopCursorOverlay: () => ({ handleEvent: vi.fn(), hide: vi.fn(), show: vi.fn() }) }
  })
  register(ipcMain)

  const pending = ipcMain.handlers.get('chat:send')({ sender: { send } }, { convId: 'conv-ask', messages: [{ role: 'user', content: 'send qq' }], pluginMode: 'desktop' })
  await Promise.resolve()
  expect(send).toHaveBeenCalledWith('chat:desktop-ask', { convId: 'conv-ask', request: expect.objectContaining({ requestId: 'ask-1', question: 'Please log in' }) })

  const reply = await ipcMain.handlers.get('chat:send')({ sender: { send } }, { convId: 'conv-ask', desktopAskReply: true, message: 'logged in' })

  expect(reply).toEqual({ ok: true, status: 'desktop-ask-replied' })
  await pending
  expect(desktopAnswer).toBe('logged in')
  expect(runTurn).toHaveBeenCalledTimes(1)
})
```

Run:

```powershell
npm.cmd exec -- vitest run electron/__tests__/chat.test.js -t "desktop ask"
```

Expected: FAIL because chat IPC has no desktop ask map.

- [ ] **Step 4: Implement pending desktop question handling in chat IPC**

In `electron/ipc/chat.js`, add:

```js
const pendingDesktopQuestions = new Map()

function clearPendingDesktopQuestion(convId, reason = 'cleared') {
  const pending = pendingDesktopQuestions.get(convId)
  if (!pending) return false
  pendingDesktopQuestions.delete(convId)
  pending.send?.('chat:desktop-ask-cleared', { reason })
  pending.resolve('')
  return true
}

function settlePendingDesktopQuestion(convId, answer) {
  const pending = pendingDesktopQuestions.get(convId)
  if (!pending) return false
  pendingDesktopQuestions.delete(convId)
  pending.send?.('chat:desktop-ask-cleared', { reason: 'answered' })
  pending.resolve(String(answer || ''))
  return true
}
```

Before confirmation handling in `handleChatSend()`:

```js
if (payload.desktopAskReply) {
  const ok = settlePendingDesktopQuestion(convId, payload.message || '')
  return ok
    ? { ok: true, status: 'desktop-ask-replied' }
    : { ok: true, status: 'missing-desktop-ask' }
}
```

Pass into `deps.runTurn()`:

```js
waitForDesktopUser: async (request) => {
  send('chat:desktop-ask', { request })
  sendDelta(`\n${request.question || 'Computer Use needs your input.'}\n`)
  return await new Promise((resolve) => {
    pendingDesktopQuestions.set(convId, { request, resolve, send })
  })
},
```

Handle live desktop events:

```js
} else if (type === 'desktop_event') {
  send('chat:desktop-event', { event: data.event })
  getOverlay()?.handleEvent?.(data.event)
}
```

On abort and finally, clear pending desktop questions:

```js
clearPendingDesktopQuestion(convId, 'aborted')
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm.cmd exec -- vitest run electron/__tests__/agent-loop.test.js electron/__tests__/chat.test.js
```

Expected: PASS.

Commit:

```powershell
git add electron/services/agentLoop.js electron/ipc/chat.js electron/__tests__/agent-loop.test.js electron/__tests__/chat.test.js
git commit -m "feat: pause computer use for user input"
```

## Task 7: Renderer Progress And Virtual Cursor States

**Files:**
- Modify: `client/src/lib/api.js`
- Modify: `client/src/hooks/useChat.js`
- Modify: `client/src/lib/api.test.js`
- Modify: `electron/services/desktopCursorOverlay.js`
- Modify: `electron/__tests__/desktop-cursor-overlay.test.js`

- [ ] **Step 1: Write failing renderer API test for desktop events**

Add to `client/src/lib/api.test.js`:

```js
test('stream listens for desktop ask and desktop event channels', () => {
  const listeners = {}
  global.window = {
    electronAPI: {
      invoke: vi.fn(async () => ({ ok: true })),
      on: vi.fn((event, handler) => {
        listeners[event] = handler
        return () => {}
      })
    }
  }
  const onDesktopAsk = vi.fn()
  const onDesktopEvent = vi.fn()

  api.stream({
    channel: 'chat:send',
    payload: { convId: 'conv-desktop' },
    onDesktopAsk,
    onDesktopEvent,
  })
  listeners['chat:desktop-ask']({ convId: 'conv-desktop', request: { requestId: 'ask-1', question: 'Continue?' } })
  listeners['chat:desktop-event']({ convId: 'conv-desktop', event: { type: 'observe', summary: 'Looking' } })

  expect(onDesktopAsk).toHaveBeenCalledWith({ convId: 'conv-desktop', request: { requestId: 'ask-1', question: 'Continue?' } })
  expect(onDesktopEvent).toHaveBeenCalledWith({ type: 'observe', summary: 'Looking' })
})
```

Run:

```powershell
npm.cmd exec -- vitest run client/src/lib/api.test.js -t "desktop ask"
```

Expected: FAIL because `api.stream()` does not listen to these channels.

- [ ] **Step 2: Add desktop callbacks to the stream API**

In `client/src/lib/api.js`, destructure:

```js
onDesktopAsk,
onDesktopAskCleared,
onDesktopEvent
```

Add listeners:

```js
listen('chat:desktop-ask', (data) => onDesktopAsk?.(data))
listen('chat:desktop-ask-cleared', (data) => onDesktopAskCleared?.(data))
listen('chat:desktop-event', (data) => onDesktopEvent?.(data.event))
```

- [ ] **Step 3: Update useChat to route desktop ask replies without aborting**

In `client/src/hooks/useChat.js`, add state:

```js
const [pendingDesktopAsk, setPendingDesktopAsk] = useState(null)
```

Add a helper:

```js
function formatDesktopEvent(event = {}) {
  if (event.summary) return event.summary
  if (event.type === 'observe') return 'Looking at the desktop...'
  if (event.type === 'plan') return event.action?.userVisibleSummary || event.action?.reason || 'Planning the next desktop action.'
  if (event.type === 'cursor_move') return 'Moving the Computer Use cursor.'
  if (event.type === 'action_start') return `Starting desktop ${event.action || 'action'}.`
  if (event.type === 'action_result') return `Finished desktop ${event.action || 'action'}.`
  if (event.type === 'ask_user') return event.question || 'Computer Use needs your input.'
  if (event.type === 'done') return event.summary || 'Computer Use finished.'
  if (event.type === 'fail') return event.summary || event.message || 'Computer Use failed.'
  return ''
}
```

Before the existing `pendingConfirmation` branch in `sendUserMessage()`:

```js
if (pendingDesktopAsk) {
  const userMessage = { id: uid(), role: 'user', content: text }
  dispatch({ type: 'ADD', msg: userMessage })
  api.invoke('chat:send', { convId, desktopAskReply: true, message: text }).then((result) => {
    if (result.status === 'desktop-ask-replied' || result.status === 'missing-desktop-ask') setPendingDesktopAsk(null)
  }).catch((error) => {
    dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', content: `[Desktop ask error] ${error.message}` } })
  })
  return
}
```

Inside `api.stream()` options:

```js
onDesktopAsk: (event) => {
  setPendingDesktopAsk(event.request)
  dispatch({ type: 'ADD', msg: { id: `desktop-ask-${event.request.requestId}`, role: 'assistant', type: 'desktop_ask', content: event.request.question } })
},
onDesktopAskCleared: () => setPendingDesktopAsk(null),
onDesktopEvent: (event) => {
  const content = formatDesktopEvent(event)
  if (content) dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', type: 'desktop_event', stream: true, content } })
},
```

Reset `pendingDesktopAsk` on conversation change and abort.

- [ ] **Step 4: Write failing overlay state test**

Append to `electron/__tests__/desktop-cursor-overlay.test.js`:

```js
test('cursor overlay handles phase 2 desktop event names and states', () => {
  const sent = []
  const win = {
    isDestroyed: () => false,
    showInactive: vi.fn(),
    hide: vi.fn(),
    webContents: { send: (event, payload) => sent.push([event, payload]) }
  }
  const controller = createCursorOverlayController({ createWindow: () => win })

  controller.handleEvent({ type: 'cursor_move', x: 10, y: 20, state: 'moving' })
  controller.handleEvent({ type: 'action_start', action: 'click', target: { x: 10, y: 20 } })
  controller.handleEvent({ type: 'ask_user', question: 'Continue?' })
  controller.handleEvent({ type: 'done', summary: 'finished' })

  expect(sent).toContainEqual(['desktop-cursor:move', { x: 10, y: 20, state: 'moving' }])
  expect(sent).toContainEqual(['desktop-cursor:click', { x: 10, y: 20, state: 'clicking' }])
  expect(sent).toContainEqual(['desktop-cursor:state', { state: 'paused', label: 'Continue?' }])
  expect(sent).toContainEqual(['desktop-cursor:state', { state: 'done', label: 'finished' }])
})
```

Run:

```powershell
npm.cmd exec -- vitest run electron/__tests__/desktop-cursor-overlay.test.js
```

Expected: FAIL because the overlay only supports old cursor events.

- [ ] **Step 5: Implement overlay states**

In `electron/services/desktopCursorOverlay.js`, update overlay HTML to include a label:

```html
<div id="cursor"></div>
<div id="label"></div>
```

Add CSS:

```css
#label {
  position: absolute;
  left: 0;
  top: 0;
  transform: translate(14px, 14px);
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(12, 18, 28, 0.86);
  color: white;
  font: 12px/1.3 system-ui, sans-serif;
  opacity: 0;
  transition: opacity 120ms ease, left 160ms ease, top 160ms ease;
}
#label.visible { opacity: 1; }
#cursor.dragging { border-color: #f59e0b; }
#cursor.paused { border-color: #eab308; }
#cursor.failed { border-color: #ef4444; }
#cursor.done { border-color: #22c55e; }
```

Add renderer handlers:

```js
const label = document.getElementById('label')
function setState(_, payload = {}) {
  cursor.className = 'visible'
  if (payload.state) cursor.classList.add(payload.state)
  if (payload.label) {
    label.textContent = String(payload.label)
    label.classList.add('visible')
  } else {
    label.classList.remove('visible')
  }
}
ipcRenderer.on('desktop-cursor:state', setState)
```

Update controller methods:

```js
state(payload) {
  this.show()
  send('desktop-cursor:state', { state: payload.state || 'moving', label: payload.label || '' })
},
handleEvent(event) {
  if (event?.type === 'cursor.move' || event?.type === 'cursor_move') this.move(event)
  if (event?.type === 'cursor.click') this.click(event)
  if (event?.type === 'action_start' && event.action === 'click') this.click({ x: event.target?.x, y: event.target?.y, state: 'clicking' })
  if (event?.type === 'action_start' && event.action === 'drag') this.move({ x: event.target?.from?.x, y: event.target?.from?.y, state: 'dragging' })
  if (event?.type === 'action_start' && event.action === 'scroll') this.move({ x: event.target?.x, y: event.target?.y, state: 'scrolling' })
  if (event?.type === 'action_start' && event.action === 'type') this.state({ state: 'typing', label: 'Typing' })
  if (event?.type === 'ask_user' || event?.type === 'paused') this.state({ state: 'paused', label: event.question || event.summary || 'Paused' })
  if (event?.type === 'fail') this.state({ state: 'failed', label: event.summary || event.message || 'Failed' })
  if (event?.type === 'done') this.state({ state: 'done', label: event.summary || 'Done' })
}
```

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm.cmd exec -- vitest run client/src/lib/api.test.js electron/__tests__/desktop-cursor-overlay.test.js
```

Expected: PASS.

Commit:

```powershell
git add client/src/lib/api.js client/src/hooks/useChat.js client/src/lib/api.test.js electron/services/desktopCursorOverlay.js electron/__tests__/desktop-cursor-overlay.test.js
git commit -m "feat: show live computer use progress"
```

## Task 8: End-To-End Verification And Polish

**Files:**
- Modify only files needed to fix failures discovered by the checks below.
- Do not change `output/` unless the user explicitly asks to keep screenshots.

- [ ] **Step 1: Run focused server tests**

Run:

```powershell
npm.cmd exec -- vitest run server/desktop-use-bridge/__tests__/planner.test.js server/desktop-use-bridge/__tests__/agentRunner.test.js server/desktop-use-bridge/__tests__/driver.test.js server/desktop-use-bridge/__tests__/execute.test.js server/desktop-use-bridge/__tests__/translator.test.js
```

Expected: PASS.

- [ ] **Step 2: Run focused Electron and client tests**

Run:

```powershell
npm.cmd exec -- vitest run electron/__tests__/desktop-adapter.test.js electron/__tests__/desktop-tools.test.js electron/__tests__/agent-loop.test.js electron/__tests__/chat.test.js electron/__tests__/desktop-cursor-overlay.test.js client/src/lib/api.test.js client/src/components/chat/unified-chat-ui.test.js
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run:

```powershell
npm.cmd test
```

Expected: all Vitest suites pass. If `better-sqlite3` reports an Electron ABI mismatch, stop stale Electron/Node project processes and run:

```powershell
npm.cmd rebuild better-sqlite3
```

Then rerun `npm.cmd test`.

- [ ] **Step 4: Manual smoke test with Notepad**

Start the app:

```powershell
npm.cmd run electron:dev
```

Manual expected behavior:

1. Select `Computer Use` from the plugin menu.
2. Ask it to type a short sentence into Notepad.
3. Confirm the high-risk desktop task if prompted.
4. Watch for live chat progress lines.
5. Watch the virtual cursor move before real click/type actions.
6. Verify Computer Use exits after the task and the next normal chat message is not routed to `desktop_task`.

- [ ] **Step 5: Manual blocked-state test with QQ**

With QQ in a known blocked or logged-out state, ask Computer Use to interact with QQ.

Expected behavior:

1. The task reports what it sees.
2. If QQ shows login, offline, security, or ambiguity, the task emits `ask_user`.
3. The chat input reply resumes the same task without starting a new desktop task.
4. The task does not repeat blind clicks until max steps.
5. The cursor remains visible and shows paused state.

- [ ] **Step 6: Final commit for verification fixes**

If Step 1 through Step 5 required small fixes, commit them:

```powershell
git add server/desktop-use-bridge electron client
git commit -m "fix: polish computer use phase 2"
```

If no fixes were needed, leave the prior task commits as the final implementation state.

## Self-Review Notes

- Spec coverage: screenshot planning is Task 1; live events are Tasks 4 through 7; `ask_user` pause/resume is Tasks 2, 4, 5, 6, and 7; scroll/drag are Tasks 2 and 3; virtual cursor states are Task 7; failure and safety behavior are Task 2 plus Task 8 manual checks.
- Placeholder scan: the plan contains concrete files, test code, commands, expected results, and commit boundaries.
- Type consistency: event names use snake case for new events (`cursor_move`, `action_start`, `ask_user`) while Task 2 preserves old dotted cursor events for compatibility until Task 7 supports both.
