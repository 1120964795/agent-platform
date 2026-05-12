# Computer Use Max Steps and Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Computer Use desktop tasks default to 30 steps and bias the desktop planner toward completing visible send/submit tasks.

**Architecture:** Keep the change small and generic. The Electron forced-tool layer will pass `max_steps: 30`, the Electron `desktop_task` tool and desktop-use bridge will use the same 30-step fallback, and the planner prompt will include generic completion guidance. Existing policy, confirmation, event streaming, and unsupported-action correction remain unchanged.

**Tech Stack:** Electron main process, Node.js CommonJS modules, Vitest, Express desktop-use bridge.

---

### Task 1: Forced Desktop Tool Call Budget

**Files:**
- Modify: `electron/__tests__/agent-loop.test.js`
- Modify: `electron/services/agentLoop.js`

- [ ] **Step 1: Write the failing forced desktop budget assertion**

In `electron/__tests__/agent-loop.test.js`, update the existing test named `desktop plugin mode creates a desktop_task tool call`.

Replace the final `expect(tools.execute)` block with:

```js
  expect(tools.execute).toHaveBeenCalledWith('desktop_task', expect.objectContaining({
    goal: 'Open Notepad and type hello',
    max_steps: 30
  }), expect.objectContaining({ skipInternalConfirm: true }))
```

Also add this assertion immediately after the `requestApproval` expectation:

```js
  expect(requestApproval).toHaveBeenCalledWith(expect.objectContaining({
    call: expect.objectContaining({
      name: 'desktop_task',
      args: expect.objectContaining({ max_steps: 30 })
    })
  }))
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
npx vitest run electron/__tests__/agent-loop.test.js -t "desktop plugin mode creates a desktop_task tool call"
```

Expected: FAIL because the forced desktop args contain only `goal` and do not include `max_steps`.

- [ ] **Step 3: Implement the forced desktop default**

In `electron/services/agentLoop.js`, add this constant near `MAX_STEPS`:

```js
const MAX_STEPS = 30
const DEFAULT_DESKTOP_TASK_MAX_STEPS = 30
```

Update `createForcedToolCall()` so it creates desktop args with the default budget:

```js
function createForcedToolCall(forceTool, messages = []) {
  const supported = new Set(['browser_task', 'desktop_task'])
  if (!supported.has(forceTool)) return null
  const args = { goal: latestUserContent(messages) }
  if (forceTool === 'desktop_task') args.max_steps = DEFAULT_DESKTOP_TASK_MAX_STEPS
  const id = `forced-${forceTool.replace(/_/g, '-')}-${Date.now()}`
  return {
    id,
    name: forceTool,
    args,
    raw: {
      id,
      type: 'function',
      function: {
        name: forceTool,
        arguments: JSON.stringify(args)
      }
    }
  }
}
```

- [ ] **Step 4: Run the focused test to verify GREEN**

Run:

```bash
npx vitest run electron/__tests__/agent-loop.test.js -t "desktop plugin mode creates a desktop_task tool call"
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add electron/services/agentLoop.js electron/__tests__/agent-loop.test.js
git commit -m "fix: pass desktop task max steps from forced mode"
```

### Task 2: Electron `desktop_task` Default and Schema

**Files:**
- Modify: `electron/__tests__/desktop-tools.test.js`
- Modify: `electron/tools/desktopTask.js`

- [ ] **Step 1: Add failing tests for omitted and explicit desktop max steps**

In `electron/__tests__/desktop-tools.test.js`, add these tests after `desktop_task rejects empty goal`:

```js
test('desktop_task defaults to 30 max steps when omitted', async () => {
  fetchMock
    .mockResolvedValueOnce({ json: async () => ({ ok: true, runtime: 'desktop-use' }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, exitCode: 0, metadata: { summary: 'done' }, durationMs: 40 }),
    })

  const { desktopTask } = require('../tools/desktopTask')
  const result = await desktopTask({ goal: 'Open Notepad' }, { skipInternalConfirm: true })

  expect(result.max_steps).toBe(30)
  const body = JSON.parse(fetchMock.mock.calls[1][1].body)
  expect(body.payload).toMatchObject({ goal: 'Open Notepad', maxSteps: 30 })
})

test('desktop_task honors explicit max_steps', async () => {
  fetchMock
    .mockResolvedValueOnce({ json: async () => ({ ok: true, runtime: 'desktop-use' }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, exitCode: 0, metadata: { summary: 'done' }, durationMs: 40 }),
    })

  const { desktopTask } = require('../tools/desktopTask')
  const result = await desktopTask({ goal: 'Open Notepad', max_steps: 7 }, { skipInternalConfirm: true })

  expect(result.max_steps).toBe(7)
  const body = JSON.parse(fetchMock.mock.calls[1][1].body)
  expect(body.payload).toMatchObject({ goal: 'Open Notepad', maxSteps: 7 })
})
```

- [ ] **Step 2: Run the focused tests to verify RED**

Run:

```bash
npx vitest run electron/__tests__/desktop-tools.test.js -t "desktop_task"
```

Expected: FAIL for `desktop_task defaults to 30 max steps when omitted` because the current default is 12.

- [ ] **Step 3: Implement the Electron tool default**

In `electron/tools/desktopTask.js`, add this constant above `parseMaxSteps()`:

```js
const DEFAULT_DESKTOP_TASK_MAX_STEPS = 30
```

Replace `parseMaxSteps()` with:

```js
function parseMaxSteps(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, parsed) : DEFAULT_DESKTOP_TASK_MAX_STEPS
}
```

Update the schema description to:

```js
  description: 'Run a self-contained desktop automation task using the desktop-use runtime. Args: goal (required), max_steps (optional).',
  parameters: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'Natural-language desktop task description.' },
      max_steps: { type: 'number', description: 'Maximum desktop interaction steps. Default: 30.' },
    },
    required: ['goal'],
  },
```

- [ ] **Step 4: Run the focused tests to verify GREEN**

Run:

```bash
npx vitest run electron/__tests__/desktop-tools.test.js -t "desktop_task"
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add electron/tools/desktopTask.js electron/__tests__/desktop-tools.test.js
git commit -m "fix: default desktop task max steps to thirty"
```

### Task 3: Desktop-Use Bridge Default Budget

**Files:**
- Modify: `server/desktop-use-bridge/__tests__/translator.test.js`
- Modify: `server/desktop-use-bridge/__tests__/execute.test.js`
- Modify: `server/desktop-use-bridge/__tests__/agentRunner.test.js`
- Modify: `server/desktop-use-bridge/translator.js`
- Modify: `server/desktop-use-bridge/agentRunner.js`

- [ ] **Step 1: Update and add bridge default tests**

In `server/desktop-use-bridge/__tests__/translator.test.js`, change the desktop task expectation inside `classifies supported desktop actions` to:

```js
    expect(classify({ type: 'desktop.task', payload: { goal: 'Open Notepad' } })).toEqual({ backend: 'task', goal: 'Open Notepad', maxSteps: 30 })
```

Add this test after `classifies supported desktop actions`:

```js
  test('classifies explicit desktop task max steps from camel or snake case', () => {
    expect(classify({ type: 'desktop.task', payload: { goal: 'Open Notepad', maxSteps: 8 } })).toEqual({ backend: 'task', goal: 'Open Notepad', maxSteps: 8 })
    expect(classify({ type: 'desktop.task', payload: { goal: 'Open Notepad', max_steps: 9 } })).toEqual({ backend: 'task', goal: 'Open Notepad', maxSteps: 9 })
  })
```

In `server/desktop-use-bridge/__tests__/execute.test.js`, update the `desktop task and cancel dispatch to agent runner` expectation to:

```js
    expect(agentRunner.runTask).toHaveBeenCalledWith(expect.objectContaining({ goal: 'Open Notepad', maxSteps: 30 }))
```

In `server/desktop-use-bridge/__tests__/agentRunner.test.js`, add this test after `executes planned actions until done`:

```js
  test('uses 30 max steps by default', async () => {
    const driver = createDriver()
    const planner = { nextAction: vi.fn(async () => ({ type: 'done', summary: 'done' })) }
    const events = []
    const runner = createAgentRunner({ driver, planner })

    const result = await runner.runTask({ goal: 'default budget', onEvent: event => events.push(event) })

    expect(result.ok).toBe(true)
    expect(planner.nextAction).toHaveBeenCalledWith(expect.objectContaining({ maxSteps: 30 }))
    expect(events[0]).toEqual(expect.objectContaining({ type: 'task_started', maxSteps: 30 }))
  })
```

- [ ] **Step 2: Run the bridge tests to verify RED**

Run:

```bash
npx vitest run server/desktop-use-bridge/__tests__/translator.test.js server/desktop-use-bridge/__tests__/execute.test.js server/desktop-use-bridge/__tests__/agentRunner.test.js
```

Expected: FAIL because translator and runner defaults are still 12, and snake-case `max_steps` is ignored by the bridge translator.

- [ ] **Step 3: Implement bridge default and snake-case override**

In `server/desktop-use-bridge/translator.js`, add this constant at the top:

```js
const DEFAULT_DESKTOP_TASK_MAX_STEPS = 30
```

Replace the `desktop.task` return block with:

```js
    return {
      backend: 'task',
      goal,
      maxSteps: Math.max(1, num(payload.maxSteps ?? payload.max_steps, DEFAULT_DESKTOP_TASK_MAX_STEPS))
    }
```

In `server/desktop-use-bridge/agentRunner.js`, add this constant near the existing constants:

```js
const DEFAULT_DESKTOP_TASK_MAX_STEPS = 30
```

Update `runTask()` signature to:

```js
    async runTask({ goal, maxSteps = DEFAULT_DESKTOP_TASK_MAX_STEPS, onEvent, waitForUser } = {}) {
```

- [ ] **Step 4: Run the bridge tests to verify GREEN**

Run:

```bash
npx vitest run server/desktop-use-bridge/__tests__/translator.test.js server/desktop-use-bridge/__tests__/execute.test.js server/desktop-use-bridge/__tests__/agentRunner.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add server/desktop-use-bridge/translator.js server/desktop-use-bridge/agentRunner.js server/desktop-use-bridge/__tests__/translator.test.js server/desktop-use-bridge/__tests__/execute.test.js server/desktop-use-bridge/__tests__/agentRunner.test.js
git commit -m "fix: align desktop bridge max step defaults"
```

### Task 4: Planner Completion Guidance

**Files:**
- Modify: `server/desktop-use-bridge/__tests__/planner.test.js`
- Modify: `server/desktop-use-bridge/planner.js`

- [ ] **Step 1: Add failing planner prompt test**

In `server/desktop-use-bridge/__tests__/planner.test.js`, add this test after `builds strict low-level action contract into the prompt`:

```js
  test('includes completion-priority guidance in the prompt', () => {
    const messages = buildPlannerMessages({ goal: 'send hello in QQ', step: 10, maxSteps: 30, observation, steps: [] })
    const text = messages[1].content.find(part => part.type === 'text').text

    expect(text).toContain('If the target app, contact, conversation, form, or input field is already visible')
    expect(text).toContain('prioritize focusing the input, typing the requested text, and submitting it')
    expect(text).toContain('Avoid repeating search/navigation actions once the destination is visible')
    expect(text).toContain('Use done only after the requested final action appears completed')
  })
```

- [ ] **Step 2: Run the planner test to verify RED**

Run:

```bash
npx vitest run server/desktop-use-bridge/__tests__/planner.test.js -t "includes completion-priority guidance in the prompt"
```

Expected: FAIL because the prompt does not include the completion guidance yet.

- [ ] **Step 3: Implement prompt guidance**

In `server/desktop-use-bridge/planner.js`, add these lines inside `buildActionContractText()` before `Use ask_user when login...`:

```js
    'If the target app, contact, conversation, form, or input field is already visible and the goal includes text to send or submit, prioritize focusing the input, typing the requested text, and submitting it.',
    'Avoid repeating search/navigation actions once the destination is visible.',
    'Use done only after the requested final action appears completed.',
```

- [ ] **Step 4: Run the planner tests to verify GREEN**

Run:

```bash
npx vitest run server/desktop-use-bridge/__tests__/planner.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add server/desktop-use-bridge/planner.js server/desktop-use-bridge/__tests__/planner.test.js
git commit -m "fix: prioritize completing visible desktop tasks"
```

### Task 5: Final Verification

**Files:**
- No code changes.

- [ ] **Step 1: Run focused regression suite**

Run:

```bash
npx vitest run electron/__tests__/agent-loop.test.js electron/__tests__/desktop-tools.test.js server/desktop-use-bridge/__tests__/translator.test.js server/desktop-use-bridge/__tests__/execute.test.js server/desktop-use-bridge/__tests__/agentRunner.test.js server/desktop-use-bridge/__tests__/planner.test.js
```

Expected: PASS for all listed files.

- [ ] **Step 2: Run full suite**

Run:

```bash
npm test
```

Expected: PASS for the full project suite.

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected: only unrelated pre-existing dirty files remain outside the committed task changes, or no relevant uncommitted changes remain.
