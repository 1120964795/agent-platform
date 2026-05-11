# Computer Use One-Shot Cursor Design

- Date: 2026-05-12
- Status: Draft for user review
- Scope: Improve the current Computer Use chat experience without changing Browser Use.

## Outcome

Computer Use should behave like a deliberate, observable one-shot desktop task:

1. The user selects Computer Use from the chat plugin menu.
2. Only the next executable desktop task is routed to `desktop_task`.
3. High-risk confirmation is shown as two immediate options: `确定` and `取消`.
4. After confirmation, `desktop_task` actually performs a desktop observe-act loop instead of only returning `Desktop task accepted`.
5. During execution, the user sees an agent cursor overlay similar to Codex App, so clicks and movement are visible.
6. When the task completes, fails, or is cancelled, Computer Use automatically exits and later messages return to normal chat.

## Current Problems

The current implementation exposes three separate issues:

- `server/desktop-use-bridge/agentRunner.js` only observes once and returns `Desktop task accepted: <goal>`. It does not plan or execute multi-step actions.
- `pluginMode: desktop` stays selected, so follow-up messages like “为啥不执行” are forced into a new `desktop_task`.
- The desktop task path uses real OS mouse actions through `nut-js`, but there is no transparent overlay or streamed cursor event. Screenshots may not show the system pointer, so the user cannot see an agent cursor.

## Non-Goals

- Do not change Browser Use behavior.
- Do not migrate the app to a new desktop automation framework in this step.
- Do not create a separate Computer Use page.
- Do not use card-first confirmation UI.
- Do not attempt multi-session desktop automation; one active desktop task is enough.

## Chosen Approach

Use a staged but cohesive design:

### 1. One-Shot Computer Use Mode

Computer Use is an explicit next-turn mode, not a sticky conversation mode.

- Selecting Computer Use sets `pluginMode = 'desktop'`.
- Sending the next message consumes that mode.
- The renderer clears `pluginMode` after the task reaches done, error, cancellation, or user denial.
- If the user later asks “为什么不执行”, that message goes to normal chat unless they select Computer Use again.

This avoids accidental routing of debugging questions or feedback into `desktop_task`.

### 2. Confirmation Options

High-risk confirmation remains in the chat flow, but the user no longer types natural-language confirmation.

The assistant confirmation message includes:

- tool name
- risk reason
- JSON arguments
- two circular choices: `确定` and `取消`

Clicking either choice immediately calls the existing confirmation IPC path:

- `确定` resolves the pending approval as true.
- `取消` resolves it as false and finishes the turn with a cancellation result.

### 3. Real Desktop Task Loop

`desktop_task` should move from a stub to a minimum viable agent loop:

1. Observe the screen.
2. Ask the configured GPT-compatible desktop planner for the next action.
3. Validate the action against supported action types.
4. Emit cursor/progress events.
5. Execute through the existing driver.
6. Observe again.
7. Stop when the planner reports done, the task fails, the user aborts, or `maxSteps` is reached.

Initial supported planner actions:

- `click`
- `type`
- `hotkey`
- `wait`
- `done`
- `fail`

Scroll and drag can follow after this core path is reliable.

### 4. Visible Agent Cursor

Add a transparent, always-on-top Electron overlay window for Computer Use execution.

Overlay requirements:

- click-through, so it never blocks the real desktop target
- transparent background
- visible cursor marker rendered above the desktop
- cursor move animation when a target coordinate is selected
- click pulse when the agent clicks
- hidden when no desktop task is active

The overlay does not replace real mouse input. It mirrors the agent action stream so the user can observe what the agent intends to do.

## Data Flow

```text
InputBar selects Computer Use
  -> ChatArea sends next message with pluginMode = desktop
  -> renderer consumes/clears pluginMode for future messages
  -> electron/ipc/chat.js forces desktop_task for this turn
  -> agentLoop requests high-risk approval
  -> renderer shows two-option confirmation
  -> user clicks 确定
  -> desktop_task calls desktop-use bridge
  -> bridge agentRunner observe/plan/execute loop
  -> bridge emits progress/cursor metadata
  -> electron forwards stream events to renderer and overlay
  -> overlay shows cursor movement/clicks
  -> final result returns to chat
```

## Text Rules

- Desktop forced-tool reasoning must say: `准备交给 Computer Use 执行桌面任务。`
- Browser forced-tool reasoning must say: `准备交给 Browser Use 执行浏览器任务。`
- Confirmation copy must be clear Chinese and must not mention typing confirmation words.
- Normal follow-up chat after a one-shot task must not show `desktop_task` unless Computer Use is selected again.

## Failure Cases

- User clicks `取消`: clear pending confirmation, finish the turn, clear Computer Use mode.
- User closes or stops the turn: abort the active bridge task and hide the overlay cursor.
- Planner returns unsupported JSON: emit a readable failure and stop without clicking.
- Planner cannot identify a target: ask for clarification or fail safely; do not click.
- Bridge is unavailable: show runtime error, clear Computer Use mode.
- Overlay fails to create: continue task execution but stream text progress; report overlay failure in diagnostics.
- `maxSteps` reached: stop and report incomplete task.

## Files Likely Touched

- `client/src/components/chat/InputBar.jsx`
- `client/src/components/chat/ChatArea.jsx`
- `client/src/components/chat/MessageBubble.jsx` or a new confirmation component
- `client/src/hooks/useChat.js`
- `client/src/lib/api.js`
- `electron/ipc/chat.js`
- `electron/ipc/chatConfirmation.js`
- `electron/services/agentLoop.js`
- `electron/main.js` or a new overlay window service
- `electron/preload.js`
- `server/desktop-use-bridge/agentRunner.js`
- `server/desktop-use-bridge/driver.js`
- related tests under `client/src`, `electron/__tests__`, and `server/desktop-use-bridge/__tests__`

## Verification

- Unit test: Computer Use selection is consumed after one send.
- Unit test: after a Computer Use task, “为啥不执行” routes to normal chat, not `desktop_task`.
- Unit test: confirmation request renders `确定` and `取消`, and both choices resolve immediately.
- Unit test: Desktop forced-tool reasoning does not contain “浏览器”.
- Unit test: `agentRunner.runTask()` executes at least one planned action instead of only returning accepted.
- Unit test: cursor events are emitted before click actions.
- Manual test: select Computer Use, send “帮我打开 qq”, click `确定`, see visible cursor/progress, and observe a real desktop action attempt.
- Manual test: after task finishes, send “为啥不执行” and verify it is treated as normal chat.

## Acceptance Criteria

- Computer Use is one-shot by default.
- Confirmation is performed by option clicks, not typed replies.
- `desktop_task` performs at least a minimal observe-plan-act loop.
- A visible overlay cursor appears during active Computer Use tasks.
- User feedback messages are not accidentally converted into desktop automation tasks.
- Existing Browser Use plugin flow still works.
