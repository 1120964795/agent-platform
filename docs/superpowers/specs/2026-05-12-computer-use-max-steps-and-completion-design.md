# Computer Use Max Steps and Completion Design

Date: 2026-05-12

## Problem

Computer Use can now open QQ and reach the requested contact, but a message-send task stops with:

```text
MAX_STEPS_REACHED: Desktop task reached max steps (12).
```

The latest reproduced flow reached the correct QQ contact UI, then exhausted the default 12 desktop steps before typing and sending the message.

Root cause evidence:

- `electron/services/agentLoop.js` creates forced `desktop_task` calls with only `{ goal }`.
- `electron/tools/desktopTask.js` defaults missing `max_steps` / `maxSteps` to `12`.
- `server/desktop-use-bridge/agentRunner.js` also defaults `maxSteps` to `12`.
- The saved conversation confirmation payload contained only `goal`, so the runtime used the 12-step default.

This is no longer primarily an unsupported planner action issue. It is a task-budget and completion-priority issue.

## Goals

- Make forced Computer Use desktop tasks use a 30-step default budget.
- Make the `desktop_task` tool default to 30 steps when callers omit a value.
- Preserve user control for explicit `max_steps` values.
- Improve planner behavior near completion so it prioritizes entering and sending requested content once the target conversation/input area is visible.
- Keep the change generic, not QQ-specific.
- Add automated coverage so the regression is visible in tests.

## Non-Goals

- Do not add QQ-specific contact or message APIs.
- Do not bypass normal desktop confirmation or tool policy.
- Do not change browser task defaults.
- Do not redesign the Computer Use runtime loop.
- Do not implement dynamic step budgeting or UI controls in this pass.

## Design

### Default Desktop Budget

Introduce a shared default of 30 steps for desktop tasks.

The forced desktop path should create:

```json
{
  "goal": "<latest user message>",
  "max_steps": 30
}
```

This makes the confirmation prompt honest: users see the same budget that will be executed.

`desktopTask()` should also parse missing `max_steps` / `maxSteps` as 30. Explicit user-provided values still win and are clamped to at least 1.

The bridge runner fallback must also move to 30, so all desktop task entry points behave the same when no explicit budget is provided.

### Planner Completion Bias

Update the low-level desktop planner prompt with a generic completion rule:

- If the target app, contact, conversation, form, or input field is already visible and the goal includes text to send or submit, prioritize focusing the input, typing the requested text, and submitting it.
- Avoid repeating search/navigation actions once the destination is visible.
- Use `done` only after the requested final action appears completed.

This stays domain-neutral. It applies to QQ, mail, chat apps, forms, and similar desktop tasks.

### Data Flow

1. User selects Computer Use desktop mode and sends a goal.
2. `chat.js` sets `forceTool = "desktop_task"`.
3. `agentLoop.createForcedToolCall()` creates a forced `desktop_task` call with `goal` and `max_steps: 30`.
4. Tool policy and confirmation operate on that full payload.
5. `desktopTask()` forwards `maxSteps: 30` to the desktop bridge.
6. `agentRunner.runTask()` loops up to 30 steps, streaming events as before.
7. Planner prompt encourages finishing the visible destination instead of continuing navigation.

## Error Handling

- `MAX_STEPS_REACHED` remains the final error when a task genuinely exceeds its configured budget.
- The error message should continue to include the actual configured step count.
- Explicit lower budgets should still be honored, even if they fail sooner.
- Existing unsupported-action correction behavior remains unchanged.

## Testing

Add focused tests for:

- Forced `desktop_task` calls include `max_steps: 30`.
- `desktopTask()` forwards 30 when no max step argument is provided.
- Explicit `max_steps` overrides the default.
- Desktop bridge task translation / runner defaults align with the new 30-step budget.
- Planner prompt includes the completion-priority instruction.

Run focused tests first, then the full test suite.

## Rollout

This change is backwards compatible for callers that pass explicit `max_steps`. The only behavior change is that omitted desktop task budgets allow 30 steps instead of 12, reducing false failures for multi-stage desktop tasks such as "open app, find contact, send message."
