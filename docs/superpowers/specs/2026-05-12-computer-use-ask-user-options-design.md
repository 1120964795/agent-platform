# Computer Use Ask-User Options Design

- Date: 2026-05-12
- Status: Draft for user review
- Scope: Fix the Computer Use pause-for-user-input interaction discovered during real QQ testing.

## Outcome

When Computer Use is already running and the desktop planner asks the user a question, the user should be able to answer inside the same chat turn without fighting the disabled input bar.

The chosen approach is Option 2: render answer choices directly under the Computer Use question bubble. The bottom input can remain disabled while the task is running. The user clicks one of the choices, and the existing paused desktop task resumes or cancels.

## Current Problem

Real testing showed that Computer Use can reach QQ, pause, and ask a useful question such as whether the visible contact is the intended recipient. However, the task is still marked as running, so the chat input remains disabled and the user cannot answer.

The backend path already supports this concept:

- `electron/ipc/chat.js` tracks pending desktop questions and accepts `desktopAskReply`.
- `client/src/hooks/useChat.js` stores `pendingDesktopAsk` and dispatches a `desktop_ask` assistant message.
- `client/src/hooks/useChat.js` can send a reply with `api.invoke('chat:send', { convId, desktopAskReply: true, message: text })`.

The missing part is the chat UI affordance. `pendingDesktopAsk` is not passed through `ChatArea`, `MessageList`, and `MessageBubble`, so the visible question has no clickable response controls.

## Non-Goals

- Do not redesign the whole chat input.
- Do not create a modal dialog for desktop questions.
- Do not turn Computer Use questions into high-risk confirmation prompts.
- Do not make the user type natural-language replies while the bottom input is disabled.
- Do not change Browser Use behavior.

## Chosen Interaction

For a `desktop_ask` message with an active pending question:

1. Show the question text in the assistant bubble.
2. Render two or three circular option buttons below the question.
3. Clicking an answer sends it through the existing `desktopAskReply` IPC path.
4. Clicking cancel aborts the active task through the existing chat abort path.
5. After any answer is accepted, disable the choices for that question.

This keeps the task and user feedback serialized: Computer Use pauses, asks, waits for one explicit user choice, then resumes from the same desktop task state.

## Option Generation

The UI should derive conservative default options from the question text:

- If the question contains a confirmation shape such as `是否`, `是不是`, `确认`, or `吗`: show `是的`, `不是`, and `取消任务`.
- If the question contains a continuation shape such as `继续`, `登录后`, or `完成后`: show `继续` and `取消任务`.
- Otherwise: show `继续` and `取消任务`.

These labels are intentionally simple. They cover the current QQ ambiguity and login-blocked cases without requiring the planner to produce custom option metadata. A later phase can let the planner send explicit choices such as `选择第一个` or `选择第二个`.

## State Rules

- Only the currently pending desktop question should have enabled buttons.
- Older `desktop_ask` messages should remain visible but disabled after the user responds or the task is cleared.
- A new conversation or abort clears `pendingDesktopAsk`.
- The bottom input stays disabled while `agentRunning` is true, except for existing high-risk confirmation behavior.
- The stop button remains available so the user can still cancel the running task.

## Data Flow

```text
Desktop planner returns ask_user
  -> desktop bridge emits ask_user event
  -> Electron sends chat:desktop-ask / stream desktop ask event
  -> useChat stores pendingDesktopAsk and adds a desktop_ask message
  -> ChatArea passes pendingDesktopAsk and reply handlers to MessageList
  -> MessageList passes reply handlers to MessageBubble
  -> MessageBubble renders option buttons under the active desktop_ask bubble
  -> user clicks an answer
  -> useChat calls chat:send with desktopAskReply true
  -> electron/ipc/chat.js resolves waitForDesktopUser
  -> Computer Use resumes the same task
```

## Error Handling

- If sending the answer fails, re-enable the pending question and show a compact assistant error message.
- If the backend reports `missing-desktop-ask`, clear the pending state and disable the question options.
- If the user clicks `取消任务`, call the existing abort path and mark the question as cancelled.
- Duplicate clicks should not send multiple replies; the UI disables the buttons immediately while the reply is in flight.

## Files Likely Touched

- `client/src/hooks/useChat.js`: add a `respondToDesktopAsk(answer)` helper and track in-flight or answered desktop ask state.
- `client/src/components/chat/ChatArea.jsx`: destructure `pendingDesktopAsk` and pass desktop ask handlers down.
- `client/src/components/chat/MessageList.jsx`: pass desktop ask props into `MessageBubble`.
- `client/src/components/chat/MessageBubble.jsx`: render option buttons for active `desktop_ask` messages.
- `client/src/components/chat/InputBar.jsx`: keep current disabled behavior, but preserve the stop/cancel affordance while a desktop ask is pending.
- Client tests covering the visible button flow.

## Verification Plan

Automated checks:

- A `desktop_ask` message renders option buttons when it matches the active `pendingDesktopAsk`.
- Confirmation-shaped questions render `是的`, `不是`, and `取消任务`.
- Continuation-shaped questions render `继续` and `取消任务`.
- Clicking an answer calls the desktop ask reply path and disables the buttons.
- Clicking cancel calls the abort path.
- Normal assistant messages and high-risk confirmation messages keep their current behavior.

Manual checks:

- Start Computer Use from the plugin menu and trigger an ambiguous desktop question.
- Verify the user can answer by clicking a bubble option while the task is running.
- Verify the desktop task resumes after the click.
- Verify `取消任务` stops the task and hides the active Computer Use cursor.

## Acceptance Criteria

- A running Computer Use task can pause for user input without leaving the user unable to respond.
- The response interaction happens under the question bubble, not through a modal or the disabled bottom input.
- The implementation reuses the existing `desktopAskReply` backend path.
- The task remains serialized: one active question receives one user choice before the task resumes.
- Existing Browser Use, normal chat, and high-risk confirmation flows continue to work.
