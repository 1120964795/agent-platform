# Computer Use Planner Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Computer Use recover once from invalid or high-level planner actions and steer the model back to strict low-level desktop actions.

**Architecture:** Keep the current `desktop-use-bridge` observe-plan-act loop. Strengthen the planner contract in `planner.js`, add one correction retry in `agentRunner.js`, and preserve enhanced diagnostics through the existing desktop tool path.

**Tech Stack:** Node.js, Electron main process modules, Express sidecar bridge, Vitest.

---

## File Map

- Modify: `server/desktop-use-bridge/planner.js`
  - Owns the allowed action list, planner prompt, optional correction context, JSON extraction, and action normalization.
- Modify: `server/desktop-use-bridge/agentRunner.js`
  - Owns observe-plan-act loop, unsupported action correction retry, event emission, confidence checks, and final bridge errors.
- Modify: `server/desktop-use-bridge/__tests__/planner.test.js`
  - Verifies prompt contract, correction context, allowed action export, and unsupported raw preservation.
- Modify: `server/desktop-use-bridge/__tests__/agentRunner.test.js`
  - Verifies one invalid-action retry, invalid-then-valid execution, invalid-then-invalid failure diagnostics, and unchanged confidence behavior.
- Modify: `electron/__tests__/desktop-tools.test.js`
  - Verifies `desktop_task` preserves enhanced bridge errors.
- Optional modify: `electron/services/agentLoop.js`
  - Adds a compact desktop event summary for `planner_correction`.

## Task 1: Planner Contract and Correction Prompt

**Files:**
- Modify: `server/desktop-use-bridge/planner.js`
- Modify: `server/desktop-use-bridge/__tests__/planner.test.js`

- [ ] **Step 1: Write failing planner contract tests**

Update the import at the top of `server/desktop-use-bridge/__tests__/planner.test.js`:

```js
import { buildPlannerMessages, createPlanner, normalizeAction, ALLOWED_ACTION_TYPES } from '../planner'
```

Add these tests inside the existing `describe('desktop planner', () => { ... })` block:

```js
  test('builds strict low-level action contract into the prompt', () => {
    const messages = buildPlannerMessages({ goal: 'open QQ', step: 1, maxSteps: 6, observation, steps: [] })
    const text = messages[1].content.find(part => part.type === 'text').text

    expect(ALLOWED_ACTION_TYPES).toEqual(['click', 'type', 'hotkey', 'wait', 'scroll', 'drag', 'ask_user', 'done', 'fail'])
    expect(text).toContain('Allowed actions: click, type, hotkey, wait, scroll, drag, ask_user, done, fail')
    expect(text).toContain('Do not return open_app')
    expect(text).toContain('Do not return search_contact')
    expect(text).toContain('Do not return send_message')
    expect(text).toContain('Break high-level intentions into low-level desktop actions')
  })

  test('includes correction context after unsupported planner output', () => {
    const correction = {
      code: 'UNSUPPORTED_PLANNER_ACTION',
      message: 'Unsupported planner action: open_app',
      allowedActions: ALLOWED_ACTION_TYPES,
      rawAction: { action: 'open_app', app: 'QQ' },
      invalidActionName: 'open_app'
    }
    const messages = buildPlannerMessages({ goal: 'open QQ', step: 1, maxSteps: 6, observation, steps: [], correction })
    const text = messages[1].content.find(part => part.type === 'text').text

    expect(text).toContain('Previous planner output was invalid')
    expect(text).toContain('Unsupported planner action: open_app')
    expect(text).toContain('"action":"open_app"')
    expect(text).toContain('Return a replacement action using only the allowed actions')
  })

  test('normalizes unsupported actions with raw output preserved', () => {
    const raw = { action: 'open_app', app: 'QQ', reason: 'Need to launch QQ' }
    const action = normalizeAction(raw)

    expect(action.type).toBe('unsupported')
    expect(action.raw).toBe(raw)
    expect(action.unsupportedAction).toBe('open_app')
  })
```

- [ ] **Step 2: Run planner tests and confirm failure**

Run:

```powershell
npx vitest run server/desktop-use-bridge/__tests__/planner.test.js
```

Expected: FAIL because `ALLOWED_ACTION_TYPES`, correction prompt text, and `unsupportedAction` are not implemented yet.

- [ ] **Step 3: Implement planner contract**

In `server/desktop-use-bridge/planner.js`, replace the existing `ACTION_TYPES` declaration with:

```js
const ALLOWED_ACTION_TYPES = Object.freeze(['click', 'type', 'hotkey', 'wait', 'scroll', 'drag', 'ask_user', 'done', 'fail'])
const ACTION_TYPES = new Set(ALLOWED_ACTION_TYPES)
```

Add these helpers after `actionType()`:

```js
function rawActionName(action) {
  return String(action?.action || action?.type || '').trim().toLowerCase()
}

function stringifyCompact(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function buildActionContractText() {
  return [
    `Allowed actions: ${ALLOWED_ACTION_TYPES.join(', ')}`,
    'Return exactly one JSON object for one next desktop action.',
    'Use only action/type plus action-specific fields; do not wrap the JSON in prose.',
    'Do not return open_app, launch_app, focus_window, search_contact, send_message, locate, inspect, or any other high-level action.',
    'Break high-level intentions into low-level desktop actions: click, type, hotkey, wait, scroll, drag, ask_user, done, or fail.',
    'Use ask_user when login, permission, ambiguity, missing app state, or low confidence blocks safe execution.',
    'For pointer actions, include screenshot coordinates and confidence from 0 to 1.'
  ].join('\n')
}

function buildCorrectionText(correction) {
  if (!correction) return ''
  return [
    'Previous planner output was invalid.',
    `Invalid reason: ${correction.message || correction.code || 'unsupported action'}`,
    `Invalid action name: ${correction.invalidActionName || 'unknown'}`,
    `Raw invalid action: ${stringifyCompact(correction.rawAction)}`,
    `Allowed actions: ${(correction.allowedActions || ALLOWED_ACTION_TYPES).join(', ')}`,
    'Return a replacement action using only the allowed actions. Do not repeat the invalid action.'
  ].join('\n')
}
```

Update `normalizeAction()` so the base object preserves the unsupported name:

```js
function normalizeAction(action) {
  const type = actionType(action)
  const base = {
    type: ACTION_TYPES.has(type) ? type : 'unsupported',
    confidence: normalizeConfidence(action?.confidence),
    reason: String(action?.reason || ''),
    userVisibleSummary: String(action?.userVisibleSummary || action?.summary || action?.reason || ''),
    raw: action,
    unsupportedAction: ACTION_TYPES.has(type) ? '' : (rawActionName(action) || 'unknown')
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
  return base
}
```

Update `buildPlannerMessages()` signature and prompt assembly:

```js
function buildPlannerMessages({ goal, step, maxSteps, observation = {}, steps = [], correction = null }) {
  const screen = observation.screen || {}
  const history = steps.slice(-8).map((item) => ({
    type: item.type,
    action: item.action,
    summary: item.summary,
    ok: item.ok
  }))
  const correctionText = buildCorrectionText(correction)
  const text = [
    `Goal: ${goal}`,
    `Step: ${step} of ${maxSteps}`,
    `Screen: ${JSON.stringify(screen)}`,
    `Recent history: ${JSON.stringify(history)}`,
    buildActionContractText(),
    correctionText
  ].filter(Boolean).join('\n\n')
```

Update `createPlanner().nextAction()` signature and message call:

```js
    async nextAction({ goal, step, maxSteps = 12, observation, steps = [], correction = null }) {
      if (!apiKey) return { type: 'fail', summary: 'Desktop Use API key is not configured.' }
      const response = await fetchImpl(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: buildPlannerMessages({ goal, step, maxSteps, observation, steps, correction })
        })
      })
```

Update the module export:

```js
module.exports = { createPlanner, normalizeAction, extractJson, buildPlannerMessages, ALLOWED_ACTION_TYPES }
```

- [ ] **Step 4: Run planner tests and confirm pass**

Run:

```powershell
npx vitest run server/desktop-use-bridge/__tests__/planner.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit planner contract changes**

Run:

```powershell
git add server/desktop-use-bridge/planner.js server/desktop-use-bridge/__tests__/planner.test.js
git commit -m "fix: tighten desktop planner action contract"
```

## Task 2: Agent Runner Invalid Action Retry

**Files:**
- Modify: `server/desktop-use-bridge/agentRunner.js`
- Modify: `server/desktop-use-bridge/__tests__/agentRunner.test.js`

- [ ] **Step 1: Write failing agent runner retry tests**

In `server/desktop-use-bridge/__tests__/agentRunner.test.js`, replace the existing `fails safely for unsupported planner action` test with:

```js
  test('fails safely after retrying unsupported planner actions once', async () => {
    const driver = createDriver()
    const planner = { nextAction: vi.fn(async () => ({ action: 'deleteEverything' })) }
    const events = []
    const runner = createAgentRunner({ driver, planner })

    const result = await runner.runTask({ goal: 'bad action', maxSteps: 1, onEvent: event => events.push(event) })

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('UNSUPPORTED_PLANNER_ACTION')
    expect(result.error.allowedActions).toContain('click')
    expect(result.error.rawAction).toEqual({ action: 'deleteEverything' })
    expect(result.error.retryAttempted).toBe(true)
    expect(planner.nextAction).toHaveBeenCalledTimes(2)
    expect(planner.nextAction.mock.calls[1][0].correction).toEqual(expect.objectContaining({
      code: 'UNSUPPORTED_PLANNER_ACTION',
      invalidActionName: 'deleteeverything',
      rawAction: { action: 'deleteEverything' }
    }))
    expect(events.some(event => event.type === 'planner_correction')).toBe(true)
    expect(driver.click).not.toHaveBeenCalled()
  })
```

Add this test after it:

```js
  test('retries unsupported planner action and executes valid replacement', async () => {
    const driver = createDriver()
    const planner = {
      nextAction: vi.fn()
        .mockResolvedValueOnce({ action: 'open_app', app: 'QQ', reason: 'Need QQ' })
        .mockResolvedValueOnce({ action: 'click', x: 10, y: 20, confidence: 0.9, reason: 'Click visible QQ result' })
        .mockResolvedValueOnce({ action: 'done', summary: 'opened QQ' })
    }
    const events = []
    const runner = createAgentRunner({ driver, planner })

    const result = await runner.runTask({ goal: 'open QQ', maxSteps: 4, onEvent: event => events.push(event) })

    expect(result.ok).toBe(true)
    expect(result.summary).toBe('opened QQ')
    expect(driver.click).toHaveBeenCalledWith({ x: 10, y: 20, button: 'left' })
    expect(planner.nextAction.mock.calls[1][0].correction).toEqual(expect.objectContaining({
      invalidActionName: 'open_app',
      rawAction: { action: 'open_app', app: 'QQ', reason: 'Need QQ' }
    }))
    expect(events.find(event => event.type === 'planner_correction')).toEqual(expect.objectContaining({
      code: 'UNSUPPORTED_PLANNER_ACTION',
      rawAction: { action: 'open_app', app: 'QQ', reason: 'Need QQ' }
    }))
  })
```

- [ ] **Step 2: Run agent runner tests and confirm failure**

Run:

```powershell
npx vitest run server/desktop-use-bridge/__tests__/agentRunner.test.js
```

Expected: FAIL because unsupported actions still fail immediately without correction context.

- [ ] **Step 3: Implement one correction retry**

In `server/desktop-use-bridge/agentRunner.js`, update the import:

```js
const { createPlanner, normalizeAction, ALLOWED_ACTION_TYPES } = require('./planner')
```

Add these helpers after `emit()`:

```js
function unsupportedActionName(action) {
  const raw = action?.raw || action
  const name = action?.unsupportedAction || raw?.action || raw?.type || action?.type || 'unknown'
  return String(name || 'unknown')
}

function buildUnsupportedError(action, options = {}) {
  const name = unsupportedActionName(action)
  return {
    code: 'UNSUPPORTED_PLANNER_ACTION',
    message: `Unsupported planner action: ${name}`,
    allowedActions: ALLOWED_ACTION_TYPES,
    rawAction: action?.raw || action,
    retryAttempted: Boolean(options.retryAttempted)
  }
}
```

Replace `unsupportedAction(action)` with:

```js
function unsupportedAction(action, options = {}) {
  return {
    ok: false,
    summary: 'Desktop planner returned an unsupported action.',
    steps: [],
    error: buildUnsupportedError(action, options)
  }
}
```

Add this helper before `createAgentRunner()`:

```js
function normalizePlannerResult(plannedRaw) {
  return plannedRaw?.type === 'unsupported' ? plannedRaw : normalizeAction(plannedRaw)
}
```

Inside `runTask()`, replace the current planner call and unsupported block with this structure:

```js
        const planInput = { goal, step, maxSteps, observation: observation || {}, steps, userReplies }
        let action = normalizePlannerResult(await planner.nextAction(planInput))
        steps.push({ type: 'plan', action })
        emit(onEvent, { type: 'plan', step, action, summary: action.userVisibleSummary || action.reason || action.summary || action.type })
        emit(onEvent, { type: 'task.plan', step, action })

        if (action.type === 'unsupported') {
          const correction = buildUnsupportedError(action, { retryAttempted: false })
          emit(onEvent, {
            type: 'planner_correction',
            step,
            code: correction.code,
            message: correction.message,
            allowedActions: correction.allowedActions,
            rawAction: correction.rawAction
          })
          steps.push({ type: 'planner_correction', ok: false, error: correction })

          action = normalizePlannerResult(await planner.nextAction({ ...planInput, correction }))
          steps.push({ type: 'plan', action, correction: true })
          emit(onEvent, { type: 'plan', step, action, correction: true, summary: action.userVisibleSummary || action.reason || action.summary || action.type })
          emit(onEvent, { type: 'task.plan', step, action, correction: true })
        }
```

Then replace the existing unsupported terminal block with:

```js
        if (action.type === 'unsupported') {
          const result = { ...unsupportedAction(action, { retryAttempted: true }), steps }
          emit(onEvent, { type: 'fail', code: result.error.code, summary: result.summary })
          return result
        }
```

- [ ] **Step 4: Run agent runner tests and confirm pass**

Run:

```powershell
npx vitest run server/desktop-use-bridge/__tests__/agentRunner.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit agent runner changes**

Run:

```powershell
git add server/desktop-use-bridge/agentRunner.js server/desktop-use-bridge/__tests__/agentRunner.test.js
git commit -m "fix: retry invalid desktop planner actions"
```

## Task 3: Error Propagation and Desktop Event Summary

**Files:**
- Modify: `electron/__tests__/desktop-tools.test.js`
- Modify: `electron/services/agentLoop.js`

- [ ] **Step 1: Write failing enhanced error propagation test**

Add this test to `electron/__tests__/desktop-tools.test.js` after the live desktop events test:

```js
test('desktop_task preserves enhanced unsupported planner errors', async () => {
  fetchMock
    .mockResolvedValueOnce({ json: async () => ({ ok: true, runtime: 'desktop-use' }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: false,
        error: {
          code: 'UNSUPPORTED_PLANNER_ACTION',
          message: 'Unsupported planner action: open_app',
          allowedActions: ['click', 'type'],
          rawAction: { action: 'open_app', app: 'QQ' },
          retryAttempted: true
        }
      }),
    })

  const { desktopTask } = require('../tools/desktopTask')
  const result = await desktopTask({ goal: 'Open QQ' }, { skipInternalConfirm: true })

  expect(result.error).toEqual(expect.objectContaining({
    code: 'UNSUPPORTED_PLANNER_ACTION',
    allowedActions: ['click', 'type'],
    rawAction: { action: 'open_app', app: 'QQ' },
    retryAttempted: true
  }))
})
```

- [ ] **Step 2: Run desktop tool test**

Run:

```powershell
npx vitest run electron/__tests__/desktop-tools.test.js
```

Expected: PASS if `desktopTask()` already preserves bridge error objects. If it fails because fields are stripped, update `electron/tools/desktopTask.js` to return `result.error` unchanged.

- [ ] **Step 3: Add planner correction event summary**

In `electron/services/agentLoop.js`, update `summarizeDesktopEvent(event = {})` by adding this branch before the final fallback:

```js
  if (event.type === 'planner_correction') return 'Computer Use corrected an invalid planner action.'
```

- [ ] **Step 4: Run focused Electron tests**

Run:

```powershell
npx vitest run electron/__tests__/desktop-tools.test.js electron/__tests__/agent-loop.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit propagation and event summary changes**

Run:

```powershell
git add electron/__tests__/desktop-tools.test.js electron/services/agentLoop.js
git commit -m "fix: surface desktop planner correction diagnostics"
```

## Task 4: Final Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run focused bridge and Electron tests**

Run:

```powershell
npx vitest run server/desktop-use-bridge/__tests__/planner.test.js server/desktop-use-bridge/__tests__/agentRunner.test.js electron/__tests__/desktop-tools.test.js electron/__tests__/agent-loop.test.js
```

Expected: PASS.

- [ ] **Step 2: Run broader test command if native rebuild is available**

Run:

```powershell
npm test
```

Expected: PASS. If it fails because native rebuild tooling or existing dirty dependency state is unavailable, record the exact failure and keep the focused Vitest result as the main verification.

- [ ] **Step 3: Inspect git status**

Run:

```powershell
git status --short
```

Expected: only known pre-existing unrelated changes remain outside this task. Modified implementation files should be committed.

- [ ] **Step 4: Manual acceptance checklist**

Use this as the manual QA script after rebuilding/running the app:

```text
1. Select Computer Use from the chat plugin menu.
2. Ask: open QQ and send Gao Shengbo a message saying hello.
3. Approve the high-risk desktop task.
4. Confirm the task does not immediately fail with Unsupported planner action: unknown.
5. If QQ login or contact ambiguity appears, confirm the task asks the user instead of clicking blindly.
6. If diagnostics show an invalid planner output, confirm one correction retry happens before any final unsupported-action failure.
```

