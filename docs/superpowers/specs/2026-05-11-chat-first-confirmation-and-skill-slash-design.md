# Chat-First Confirmation And Skill Slash Design

## Goal

Move high-risk confirmation and tool progress into the normal chat flow instead of rendering approval/tool/action cards, while keeping lightweight file/document/PPT result entries. Add a Claude/Codex-style slash command path where `/` only lists installed skills and sending `/skill-name task` forces that skill to load before the turn continues.

## Scope

In scope:

- Replace approval, tool, and action cards with chat messages for high-risk confirmation, tool progress, tool results, and action progress.
- Add a lightweight pending-confirmation status bar above the input while a high-risk tool is waiting for user approval.
- Make medium- and low-risk tools execute directly without explicit user approval.
- Keep high-risk operations serial: no pending high-risk tool should continue until the user confirms or rejects it.
- Allow clarification questions while waiting for high-risk confirmation without cancelling the pending operation.
- Cancel pending high-risk confirmations when the user switches conversations, refreshes, restarts the app, or aborts the run.
- Add `/` skill invocation where the menu lists installed skills only.

Out of scope:

- Removing file/document/PPT result entries.
- Exposing low-level tools directly in the slash menu.
- Persisting pending high-risk confirmations across app restarts.
- Adding plugin marketplace or skill installation UX.

## Current State

The app already has:

- A unified chat flow in `client/src/hooks/useChat.js`.
- Tool and action cards in `MessageList`, `ToolCard`, `ApprovalCard`, and action components.
- `chat:approve-tool` IPC for approval decisions.
- Streamed progress events through `chat:stream`.
- A skill registry and `load_skill` tool in Electron.
- A partial slash command implementation for legacy card helpers (`/paper`, `/plan`, `/schedule`), not installed skills.

## Chosen Approach

Use a chat-first interaction model with one lightweight UI affordance:

- Chat transcript is the source of truth for confirmation prompts, tool progress, tool results, and user follow-up questions.
- A small status bar above the input shows the current blocking high-risk operation, for example `Waiting for confirmation: run_shell_command`.
- The user confirms by typing natural confirmation words such as `确认`, `可以`, `同意`, or `继续`.
- The user rejects by typing words such as `取消`, `拒绝`, `不行`, or `不要`.
- If the user asks a question while confirmation is pending, the assistant explains the pending operation and remains paused.

This matches the Claude/Codex mental model: the conversation stays linear, but the app still makes blocked authorization state visible.

## Alternatives Considered

### Pure Chat Confirmation

Everything is represented as messages with no extra UI. This is simple and natural, but a pending authorization can be easy to miss after several messages.

### Chat Confirmation With Status Bar

The selected design. The status bar is not an approval card; it is a compact state indicator that prevents the user from losing track of a blocked high-risk operation.

### Command-Only Confirmation

Require `/confirm` and `/cancel`. This is precise, but less natural and less aligned with the user's preference for typing normal confirmation replies.

## Chat Confirmation Behavior

When a high-risk tool call is requested:

1. The agent loop emits a normal assistant message explaining:
   - tool name,
   - action summary,
   - risk reason,
   - accepted confirmation and rejection replies.
2. The input status bar shows the pending tool.
3. The tool call is stored as pending in memory for the current conversation/run.
4. The next user message is classified as one of:
   - confirm,
   - reject,
   - clarification,
   - unrelated.
5. Confirm continues the pending tool.
6. Reject cancels the pending tool and feeds `USER_DENIED` back into the agent loop.
7. Clarification triggers a normal assistant explanation without executing the tool.
8. Unrelated messages are treated as clarification by default: the assistant says the pending operation must be confirmed or cancelled first.

Medium- and low-risk tools skip this confirmation flow and execute directly.

## Pending Confirmation Lifetime

Pending high-risk confirmations are volatile.

They are cancelled when:

- the user switches conversation,
- the user aborts/stops the run,
- the renderer reloads,
- the Electron app restarts,
- the chat run fails or completes without approval.

They are not written to conversation history or persistent storage as executable state. The transcript can record that a confirmation was requested, but it cannot be resumed as a live authorization after restart.

## Slash Skill Invocation

The `/` menu lists installed skills only.

Behavior:

1. Typing `/` opens a searchable list built from `skills:list`.
2. Selecting a skill inserts `/<skill-name> ` into the input.
3. Sending `/<skill-name> user task` sends a normal user message plus metadata:
   - `forcedSkill: "<skill-name>"`,
   - `message: "user task"`.
4. Electron prepends a forced `load_skill` step for that turn before continuing the agent loop.
5. The loaded skill is shown as normal streamed chat progress, not as a card.
6. If the skill name is missing or not installed, the assistant replies in chat with a clear error and suggestions from the installed list.

Natural-language skill use remains supported. In full mode, the model may still call `load_skill` when the skill index matches the user's task.

## Data Flow

### High-Risk Confirmation

Renderer:

- `useChat` stores a `pendingConfirmation` object in local state.
- `InputBar` displays the pending status bar.
- `sendUserMessage` routes replies through pending-confirmation handling before starting a new agent turn.

Electron:

- `agentLoop` evaluates risk through `toolPolicy`.
- Low/medium risk runs directly.
- High risk emits a confirmation prompt and suspends the tool call.
- `chat:send` accepts confirmation/rejection/clarification replies and resumes or explains accordingly.

### Slash Skill

Renderer:

- Slash menu loads installed skills via `skills:list`.
- Input parsing recognizes only installed skill names.
- The sent payload includes `forcedSkill`.

Electron:

- `chat:send` validates `forcedSkill`.
- `agentLoop` forces `load_skill` before the user task.
- The normal agent loop then continues with the skill content in context.

## UI Changes

Remove or stop using:

- approval cards as the primary confirmation surface,
- expanded tool result cards,
- action cards as normal execution progress.

Keep:

- lightweight file/document/PPT result entries,
- compact status markers where needed,
- streamed assistant/tool progress as chat messages.

Add:

- pending confirmation status bar above `InputBar`,
- `/` skill picker that lists installed skills only.

## Error Handling

- If a user confirms after the pending operation was cancelled, reply that there is no active operation to confirm.
- If the tool fails after confirmation, stream the failure as a normal assistant/tool message.
- If skill loading fails, reply in chat and do not execute the user task under a missing skill.
- If the app reloads during pending confirmation, the next conversation load should not resume the pending tool.
- If a high-risk operation times out waiting for confirmation, cancel it and tell the user in chat.

## Testing Strategy

Unit/static tests:

- High-risk tool calls create pending chat confirmation instead of approval card state.
- Low- and medium-risk tools execute without confirmation.
- Confirmation words resume pending tool calls.
- Rejection words cancel pending tool calls.
- Clarification replies do not execute pending tools.
- Conversation switch/reload clears pending confirmation state.
- Slash menu source is `skills:list`, not legacy card commands.
- `/skill-name task` sends `forcedSkill` and strips the slash prefix from the task text.
- Missing skill returns a chat error.

Integration tests:

- Agent loop forced skill path calls `load_skill` before continuing.
- Existing Browser plugin `pluginMode=browser` still forces `browser_task`.
- Streamed reasoning/tool progress still renders as chat messages.
- File/document/PPT result entries remain accessible.

## Migration Plan

1. Add tests for chat-first confirmation and slash skill invocation.
2. Introduce pending confirmation state in `useChat`.
3. Update Electron chat/agent loop to suspend high-risk tool calls through chat confirmation.
4. Replace tool/action approval card rendering with streamed chat entries.
5. Replace legacy slash command data with installed skill data.
6. Keep file/document/PPT entries as lightweight result rows.
7. Remove unused card-only code after tests prove no references remain.

## Open Decisions

No open design decisions remain for this spec.
