# Computer Use Phase 2 Design

- Date: 2026-05-12
- Status: Draft for user review
- Scope: Make the existing Computer Use plugin vision-grounded, observable, interruptible, and recoverable while preserving the current chat-first flow.

## Outcome

Computer Use should feel like a visible desktop operator, not a hidden blocking tool call.

When the user selects Computer Use from the plugin menu, the next user message starts one desktop task. During that task, the app should:

1. Send real screenshots to the planner so it can reason from the actual screen.
2. Stream progress into the chat as the task runs.
3. Show a virtual Computer Use cursor before and during real click, drag, scroll, and type actions.
4. Pause and ask the user when the screen is blocked by login, permissions, ambiguous targets, or low confidence.
5. Stop with a useful explanation instead of only reporting `MAX_STEPS_REACHED`.

The design keeps Computer Use integrated with the current plugin menu and chat confirmation flow. It does not create a separate Computer Use page.

## Current Problems

The first phase made Computer Use selectable, one-shot, confirmable, executable, and visible through a basic cursor overlay. Real testing exposed the next set of problems:

- The planner receives screen metadata, but not the screenshot image, so it cannot reliably understand the desktop.
- Long-running desktop tasks do not stream useful live state back to the chat.
- The user cannot tell what the model sees, what it is about to do, or why it is stuck.
- Login, offline, permission, and ambiguous-contact states are treated like normal automation states until max steps are exhausted.
- The action set is too narrow for normal desktop work: `scroll`, `drag`, and explicit user intervention are missing from the planner loop.
- Failures collapse into generic status instead of explaining the last observed screen and the action history.

## Non-Goals

- Do not replace Browser Use.
- Do not replace the whole desktop bridge with a new framework in this phase.
- Do not build a separate card-first Computer Use workflow.
- Do not attempt unattended high-risk external actions.
- Do not require a VM or sandbox before improving the existing local workflow.

## Approaches Considered

### Approach 1: Vision-first incremental architecture

Add screenshot-based planning, live task events, `ask_user` pauses, richer action support, and a stronger virtual cursor to the existing bridge.

This is the recommended approach because it directly fixes the current failures while preserving the existing project shape. It also creates clean interfaces for later UIAutomation or external grounding providers.

### Approach 2: Windows UIAutomation first

Use Windows accessibility and UIAutomation APIs to read controls, buttons, titles, and text fields before planning actions.

This can improve reliability in native Windows apps, but it is not enough for every target app and would make this phase Windows-specific. It is better as a later grounding provider behind the same observation interface.

### Approach 3: Adopt a heavier open-source Computer Use stack

Integrate an Agent-S, OmniParser, UI-TARS, or similar visual grounding architecture.

This has the highest long-term ceiling, but it is too heavy for the immediate project need. The phase 2 design should leave room for this without depending on it.

## Chosen Design

Use Approach 1 now. Treat Phase 2 as a runtime upgrade with five coordinated parts:

1. Multimodal planner input.
2. Structured plan/action output.
3. Live event streaming.
4. Pause/resume user intervention.
5. Persistent virtual cursor overlay.

## Component Design

### Vision Planner

`server/desktop-use-bridge/planner.js` should receive each observation as both structured text and an image payload.

The planner prompt should include:

- user goal
- step number and max steps
- recent action history
- screenshot dimensions
- current screenshot image
- available action schema
- safety and ask-user rules

The planner output should be strict JSON with fields similar to:

```json
{
  "thought": "Short private plan summary for logging.",
  "userVisibleSummary": "I can see a login dialog, so I need your help.",
  "action": "ask_user",
  "target": null,
  "confidence": 0.92,
  "risk": "medium",
  "reason": "The QQ account is offline on this device.",
  "question": "Please finish QQ login, then reply continue."
}
```

Supported actions for this phase:

- `click`
- `type`
- `hotkey`
- `wait`
- `scroll`
- `drag`
- `ask_user`
- `done`
- `fail`

Optional later actions such as `launch_app` and `focus_window` can be added after the event loop is stable.

### Agent Runner

`server/desktop-use-bridge/agentRunner.js` should become an observe-plan-act-verify loop:

1. Observe the screen and capture a screenshot.
2. Emit an `observe` event with lightweight metadata and a short user-visible summary.
3. Ask the planner for the next structured action.
4. Validate action type, target coordinates, confidence, and risk.
5. Emit `plan` and virtual cursor events before any real input.
6. Execute the action through the driver.
7. Observe again and verify whether the screen changed or the intended state was reached.
8. Stop on `done`, `fail`, user cancellation, repeated no-change loops, or max steps.

Low-confidence click/drag/type actions should not execute. The runner should either re-observe or emit `ask_user`.

### Driver

`server/desktop-use-bridge/driver.js` should expose all actions accepted by the runner:

- click at physical coordinates
- type text
- hotkey
- wait
- scroll
- drag from one coordinate to another

The driver should return normalized action results, including whether the OS action was attempted and any thrown error. It should not decide task strategy.

### Live Event Stream

The current task call returns too late for a good user experience. Phase 2 should add a live stream from the desktop bridge to Electron.

Event types:

- `task_started`
- `observe`
- `plan`
- `cursor_move`
- `action_start`
- `action_result`
- `verify`
- `ask_user`
- `paused`
- `resumed`
- `done`
- `fail`
- `cancelled`

The preferred transport is an event channel keyed by `taskId`. The implementation can use SSE, WebSocket, or a bridge-local event emitter plus Electron IPC, depending on the current bridge boundary. The public shape should stay transport-neutral so the UI is not tied to a specific server mechanism.

### Chat UI

The chat should remain the primary interaction surface.

During a Computer Use task, the assistant message should update with compact progress lines such as:

- "Looking at the desktop..."
- "I see QQ is showing an offline login notice."
- "Moving to the OK button."
- "Clicked OK."
- "I need your help: QQ is not logged in on this device."

For `ask_user`, the task pauses and the next user reply resumes the same task instead of starting a new one. This is separate from high-risk approval:

- high-risk approval asks whether a tool may run
- `ask_user` asks for task-specific help after the task is already running

### Virtual Cursor

The existing overlay should become a persistent Computer Use cursor surface for active desktop tasks.

Requirements:

- It is transparent, always-on-top, and click-through.
- It shows an artificial cursor independent of whether the OS screenshot captures the real pointer.
- It moves before real mouse actions so the user can see intent before input happens.
- It shows distinct states for moving, clicking, dragging, scrolling, typing, paused, failed, and done.
- It hides when there is no active Computer Use task.
- It never blocks the actual target window.

Coordinate handling must be explicit because Windows may report screenshots in physical pixels while some APIs use logical coordinates. The bridge should include scale information in observation metadata, and overlay rendering should use the same coordinate space as the captured screenshot whenever possible.

## Data Flow

```text
User selects Computer Use in plugin menu
  -> next chat message creates one desktop task
  -> Electron starts desktop_task with taskId
  -> desktop bridge emits task_started
  -> agentRunner observes screenshot
  -> planner receives screenshot + task state
  -> planner returns structured action
  -> agentRunner emits plan and cursor events
  -> overlay shows virtual cursor motion
  -> driver performs real OS action
  -> agentRunner verifies with a fresh observation
  -> chat receives live progress events
  -> ask_user pauses or done/fail/cancelled ends task
  -> plugin mode remains consumed after task end
```

## Pause And Resume

`ask_user` is required for real desktop compatibility. The task should pause when:

- a login or offline state blocks progress
- the app requires a permission or security decision
- a target is ambiguous, such as multiple contacts matching a name
- the planner confidence is below the execution threshold
- the screen did not change after repeated actions
- the next action would be high impact and was not covered by the initial approval

When paused, the bridge should preserve task state and wait for the chat reply. The user can reply naturally, for example:

- "I logged in, continue"
- "Choose the first result"
- "Cancel"

The UI should also provide clear stop/cancel handling so closing or stopping the task aborts the bridge loop and hides the virtual cursor.

## Failure UX

Computer Use failures should be diagnostic and actionable.

Every failure should include:

- last observed screen summary
- final action attempted or skipped
- reason for stopping
- whether the task can continue after user help
- short action history

Examples:

- If QQ shows an offline notice, stop or pause with: "QQ says this account is logged in on another device. I need you to restore login on this machine before I can send the message."
- If the planner repeats a click and the screen does not change, pause with: "The same target did not respond after two attempts. Please check whether this window is active."
- If screenshot capture fails, fail with the capture error and do not click.

## Safety Rules

- Do not click, type, drag, or scroll when target coordinates are missing or confidence is too low.
- Do not silently continue through login, payment, account, destructive, or external-send ambiguity.
- Keep high-risk approval in the existing chat confirmation path.
- Medium and low risk actions may run without extra approval after the user has selected Computer Use and approved any high-risk tool request.
- User cancellation immediately stops the runner and hides the cursor.

## Files Likely Touched Later

This spec is design-only. The later implementation plan will decide exact edits, but likely areas are:

- `server/desktop-use-bridge/planner.js`
- `server/desktop-use-bridge/agentRunner.js`
- `server/desktop-use-bridge/driver.js`
- `server/desktop-use-bridge/index.js`
- `server/desktop-use-bridge/translator.js`
- `electron/tools/desktopTask.js`
- `electron/services/desktop/adapter.js`
- `electron/services/desktopCursorOverlay.js`
- `electron/ipc/chat.js`
- chat state/hooks/components under `client/src`
- related tests under `server`, `electron`, and `client`

## Verification Plan

Automated checks:

- Planner builds multimodal messages that include the screenshot image.
- Planner parser rejects malformed JSON and unsupported actions.
- Agent runner emits observe, plan, cursor, action, verify, and terminal events in order.
- Low-confidence actions pause or fail without calling the driver.
- `ask_user` pauses the task and resumes from the next chat reply.
- Scroll and drag planner actions call the corresponding driver functions.
- Max-steps failure includes last observation and action history.
- Stop/cancel aborts the active task and hides the cursor.
- Existing Browser Use and one-shot Computer Use selection behavior still pass.

Manual checks:

- Notepad: select Computer Use, ask it to type a short sentence, and confirm the virtual cursor and live chat progress are visible.
- QQ blocked state: if QQ shows login/offline/security UI, Computer Use pauses with a clear reason instead of exhausting max steps.
- QQ normal state: after explicit user approval and with a safe test contact, Computer Use searches, asks if contact ambiguity exists, then sends the requested message.
- Focus/DPI: verify cursor coordinates line up with real click targets on the current Windows scaling setting.

## Acceptance Criteria

- Computer Use planner reasons from real screenshots, not only screen dimensions.
- The user sees live task progress in the chat while the task is running.
- A virtual cursor shows intended and executed desktop actions.
- Blocked states pause with `ask_user` instead of blind repetition.
- Low-confidence actions do not execute.
- Failures include enough context for the user to understand what happened.
- Existing plugin menu activation, one-shot behavior, and Browser Use behavior remain intact.
