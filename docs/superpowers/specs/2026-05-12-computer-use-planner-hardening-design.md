# Computer Use Planner Hardening Design

- Date: 2026-05-12
- Status: Draft for user review
- Scope: Harden the existing Computer Use planner so it reliably returns low-level desktop actions instead of unsupported high-level actions.

## Outcome

When the user selects Computer Use and asks for a desktop task such as "open QQ and send Gao Shengbo a message saying hello", AionUi should run the existing desktop task loop without failing immediately with `UNSUPPORTED_PLANNER_ACTION: unknown`.

The system should behave like a Codex-style computer-use loop:

1. Observe the current desktop with a screenshot.
2. Ask the planner for one safe low-level UI action.
3. Validate the action against a strict allowlist.
4. Execute the action through the desktop driver.
5. Observe again and continue until `done`, `fail`, user intervention, cancellation, or max steps.

The fix is general. It must not add QQ-specific automation, contact-specific shortcuts, shell launch commands, or app-specific privileged APIs.

## Current Problem

The current flow is:

```text
Chat input
  -> pluginMode = desktop
  -> forced desktop_task tool call
  -> electron/services/desktop/adapter.js
  -> server/desktop-use-bridge
  -> agentRunner observe-plan-act loop
```

`server/desktop-use-bridge/planner.js` normalizes planner output into these supported action types:

- `click`
- `type`
- `hotkey`
- `wait`
- `scroll`
- `drag`
- `ask_user`
- `done`
- `fail`

If the model returns no recognizable `action` or `type`, or returns a high-level action such as `open_app`, `search_contact`, or `send_message`, `normalizeAction()` produces `type: "unsupported"`. `agentRunner.js` then returns `UNSUPPORTED_PLANNER_ACTION`, which is the failure seen in testing.

The root cause is not that QQ cannot be automated at all. The bridge has a strict low-level driver, but the planner is not sufficiently constrained or corrected when it returns an action outside that driver contract.

## References

This design follows the shape of OpenAI/Codex Computer Use without replacing the current bridge:

- OpenAI API Computer Use guide: https://developers.openai.com/api/docs/guides/tools-computer-use
- Codex App Computer Use: https://developers.openai.com/codex/app/computer-use

Relevant ideas to mirror:

- A user explicitly authorizes desktop/app access.
- The model reasons from screenshots.
- The model produces low-level UI actions.
- The host application executes the actions and returns updated screenshots.
- The user can intervene for ambiguous, blocked, or sensitive states.

## Non-Goals

- Do not migrate this phase to the OpenAI Responses API `computer` tool.
- Do not add QQ-specific action types or hard-coded QQ workflows.
- Do not accept high-level planner actions as executable driver actions.
- Do not bypass existing high-risk confirmation or desktop safety policy.
- Do not add hidden background execution, shell commands, or app launch privileges.
- Do not redesign the chat UI or plugin picker.

## Approaches Considered

### Approach 1: Harden the existing low-level planner loop

Keep the current `desktop-use-bridge`, but strengthen the planner prompt, output contract, validation, retry, and diagnostics.

This is the chosen approach. It is the smallest change that directly addresses `UNSUPPORTED_PLANNER_ACTION` while preserving the existing bridge, policy, approvals, event stream, and driver.

### Approach 2: Replace the planner with OpenAI Responses Computer Use

Use the official `computer` tool API shape directly, handling model-produced computer calls and returning screenshots after each call.

This is closer to the official API surface, but it would require broader model/provider migration work. The current project uses ZenMux-compatible chat completions for Desktop Use, so this is better left as a later adapter behind a stable planner interface.

### Approach 3: Add app-specific workflows

Recognize tasks such as "send QQ message" and route them through custom app automation.

This may improve one demo, but it weakens the general Computer Use abstraction and creates a maintenance path for every desktop app. It is explicitly out of scope for this fix.

## Chosen Design

Use Approach 1. The design has four parts:

1. Make planner instructions strict and action-schema driven.
2. Add one invalid-action correction retry inside the agent runner.
3. Return useful diagnostics if correction fails.
4. Preserve existing safety checks for confidence, confirmation, cancellation, and user intervention.

## Planner Contract

Each planner call must return exactly one JSON object. The object must contain `action` or `type`, plus action-specific fields.

Allowed actions:

```text
click, type, hotkey, wait, scroll, drag, ask_user, done, fail
```

The prompt should explicitly forbid high-level actions:

```text
Do not return open_app, launch_app, focus_window, search_contact,
send_message, locate, inspect, or any other high-level action.
Break those intentions into click, type, hotkey, wait, scroll, drag,
ask_user, done, or fail.
```

Example valid outputs:

```json
{"action":"hotkey","keys":["Win"],"confidence":0.8,"reason":"Open Windows search to find QQ.","userVisibleSummary":"Opening Windows search."}
```

```json
{"action":"type","text":"QQ","confidence":0.9,"reason":"Search for QQ in Windows search.","userVisibleSummary":"Typing QQ into search."}
```

```json
{"action":"click","x":420,"y":315,"button":"left","confidence":0.82,"reason":"Click the QQ result visible in search.","userVisibleSummary":"Opening QQ."}
```

```json
{"action":"ask_user","question":"QQ is asking for login. Please finish login, then reply continue.","confidence":1,"reason":"Login blocks safe automation.","userVisibleSummary":"QQ login is required."}
```

```json
{"action":"done","summary":"The QQ message was sent."}
```

## Invalid Action Retry

`agentRunner.js` should not fail on the first invalid planner output. Instead:

1. Observe as usual.
2. Request a planner action.
3. Normalize and validate the action.
4. If the action is unsupported, call the planner one more time for the same step with correction context.
5. The correction context includes:
   - the original goal
   - current step and max steps
   - latest observation
   - recent action history
   - invalid action reason
   - raw invalid planner output
   - allowed action list
6. If the retry returns a valid action, continue normally.
7. If the retry is still invalid, fail with an enhanced `UNSUPPORTED_PLANNER_ACTION`.

The retry should be local to a single step. It should not consume an additional user-visible desktop step, because no desktop action happened.

## Diagnostics

When invalid planner output occurs, the event stream should include a planner correction event that is safe for logs and UI summaries.

Suggested internal event shape:

```json
{
  "type": "planner_correction",
  "step": 3,
  "code": "UNSUPPORTED_PLANNER_ACTION",
  "message": "Planner returned unsupported action: open_app",
  "allowedActions": ["click","type","hotkey","wait","scroll","drag","ask_user","done","fail"],
  "rawAction": {"action":"open_app","app":"QQ"}
}
```

If correction fails, the final error should include:

```json
{
  "code": "UNSUPPORTED_PLANNER_ACTION",
  "message": "Unsupported planner action: open_app",
  "allowedActions": ["click","type","hotkey","wait","scroll","drag","ask_user","done","fail"],
  "rawAction": {"action":"open_app","app":"QQ"},
  "retryAttempted": true
}
```

The chat summary can remain compact, but bridge logs and metadata should preserve enough detail to debug model behavior.

## Safety Behavior

Existing safety behavior stays intact:

- `desktop_task` remains high risk and requires user approval before execution.
- Low-confidence pointer actions still do not execute blindly.
- Login, permission prompts, ambiguous contacts, missing apps, or uncertain screen state should produce `ask_user`.
- User cancellation still stops the active desktop task.
- The runner must never convert unsupported high-level actions into privileged OS operations.

For pointer actions, the current low-confidence threshold remains valid. The prompt should tell the planner to return `ask_user` when it cannot identify a target confidently from the screenshot.

## Component Changes

### `server/desktop-use-bridge/planner.js`

- Export a shared allowed action list or helper so prompts, validation, and tests use the same set.
- Add a stricter action schema section to `buildPlannerMessages()`.
- Include examples of decomposing high-level goals into low-level actions.
- Add optional correction context support for invalid action retries.
- Preserve `normalizeAction()` as the single normalization boundary.
- Preserve raw planner output on unsupported actions.

### `server/desktop-use-bridge/agentRunner.js`

- Detect unsupported actions before failing.
- Emit a planner correction event.
- Retry the planner once with correction context.
- Continue if the retry returns a valid supported action.
- Fail with enhanced diagnostics if the retry is still unsupported.

### `electron/tools/desktopTask.js`

- Continue to forward bridge errors.
- Ensure enhanced bridge error fields are not stripped when returned to the agent loop.

### `electron/services/agentLoop.js`

- No major behavioral change required.
- Existing tool failure formatting should surface the enhanced error message.
- Desktop event summaries may map `planner_correction` to a compact message such as "Computer Use corrected an invalid planner action."

## Data Flow

```text
desktop_task(goal)
  -> bridge /execute desktop.task
  -> runner.observe()
  -> planner.nextAction({ goal, step, observation, steps })
  -> normalizeAction()
  -> if unsupported:
       emit planner_correction
       planner.nextAction({ ..., correction })
       normalizeAction()
  -> validate confidence and required fields
  -> driver action
  -> observe verification
  -> repeat
```

No driver action runs until the normalized action passes validation.

## Testing

### Planner tests

- `buildPlannerMessages()` includes the allowed action list.
- `buildPlannerMessages()` explicitly forbids high-level actions.
- `buildPlannerMessages()` can include correction context.
- `normalizeAction()` maps missing or unknown action names to `unsupported` and preserves `raw`.
- Valid actions continue to normalize as before.

### Agent runner tests

- First invalid planner action triggers exactly one retry.
- Invalid then valid action continues execution.
- Invalid then invalid action fails with `UNSUPPORTED_PLANNER_ACTION`.
- Final unsupported error includes `allowedActions`, `rawAction`, and `retryAttempted`.
- Correction retry does not execute any driver action before a valid action is returned.
- Existing low-confidence pointer action protection still works.

### Tool and IPC tests

- `desktop_task` preserves enhanced bridge errors.
- Desktop event streaming tolerates `planner_correction`.
- Forced Computer Use mode still creates one `desktop_task` tool call and does not call the text model after forced completion.

### Manual acceptance

With QQ installed and visible or launchable through normal desktop UI:

1. Select Computer Use.
2. Ask: "open QQ and send Gao Shengbo a message saying hello".
3. Approve the high-risk desktop task.
4. The task should not fail immediately with `Unsupported planner action: unknown`.
5. If QQ is not logged in, the task should ask the user to log in.
6. If the contact cannot be identified safely, the task should ask the user for help.
7. If the planner initially emits a high-level action, the correction retry should steer it back to low-level actions.

## Acceptance Criteria

- Unsupported planner output is corrected once before task failure.
- Second failure returns useful diagnostics instead of only `unknown`.
- No new app-specific automation is introduced.
- Existing Computer Use approval and cancellation behavior remains unchanged.
- Existing desktop actions still pass their tests.
- The implementation remains compatible with the current ZenMux-compatible Desktop Use settings.

