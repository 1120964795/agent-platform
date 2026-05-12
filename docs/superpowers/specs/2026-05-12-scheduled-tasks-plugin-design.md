# Scheduled Tasks Plugin Design

## Goal

Add a Codex-style scheduled task feature to AionUi on the `reconcile-main-merge-dev` branch.

The user can select a "定时任务" plugin from the existing input plugin menu, then send one natural-language instruction to create a scheduled task. The task is confirmed once at creation time, treated as fully pre-authorized after confirmation, and can run later even if AionUi has fully exited.

## Confirmed Decisions

- Plugin menu behavior: the plugin menu only starts scheduled-task creation mode. It does not contain task lists or task management UI.
- Creation flow: selecting the plugin makes the next user message a scheduled-task creation request.
- Execution engine: scheduled runs reuse the full AionUi Agent Loop and may call Browser Use, Desktop Use, file, document, shell, and other registered tools.
- Authorization: the creation confirmation is the only authorization gate. After the user confirms the task, scheduled runs do not ask again for high-risk operations.
- Confirmation: AionUi shows a parsed task summary before saving the task.
- Lifetime: scheduled tasks must run even when AionUi has completely exited.
- Wake behavior: when a task fires after exit, Windows starts AionUi and opens the main UI.
- Conversation model: each scheduled task owns one dedicated conversation; every run appends progress and result messages to that conversation.
- Management: the sidebar shows scheduled tasks and opens their dedicated conversations; Settings has a full scheduled-tasks management tab.

## Scope

In scope:

- Add a scheduled-task plugin item to `InputBar.jsx`.
- Add a `schedule` plugin mode alongside the existing `browser` and `desktop` plugin modes.
- Parse a natural-language schedule request into a task draft.
- Require user confirmation before saving the task.
- Persist task records in Electron's existing `scheduledTasks` store shape.
- Register, update, and delete matching Windows Task Scheduler entries.
- Run due tasks through the existing Agent Loop.
- Append scheduled-run progress and final results to each task's dedicated conversation.
- Add sidebar and Settings management surfaces.
- Record task history, authorization state, run status, and errors.
- Add tests for store, IPC, scheduler, Windows command construction, renderer routing, and static UI wiring.

Out of scope:

- Showing scheduled task lists inside the plugin menu.
- Building a separate always-on Windows service.
- Adding a plugin marketplace or install flow.
- Supporting non-Windows background scheduling in this phase.
- Silently running tasks without opening AionUi when the app was fully exited.

## Current Project Context

The current app already has useful foundations:

- `client/src/components/chat/InputBar.jsx` has a Codex-style plugin menu.
- `client/src/components/chat/ChatArea.jsx` owns `pluginMode` and routes `browser` mode to the `browser_task` tool path.
- `electron/services/agentLoop.js` supports forced tools and streamed progress.
- `electron/ipc/chat.js` forwards Agent Loop progress to the renderer.
- `electron/store.js` already includes `scheduledTasks`, `listScheduledTasks`, `upsertScheduledTask`, `removeScheduledTask`, and `appendTaskHistory`.

Missing pieces:

- No scheduled-task IPC module.
- No Electron scheduler service.
- No Windows Task Scheduler integration.
- No renderer route for `schedule` plugin mode.
- No sidebar or Settings management UI for scheduled tasks.

## Architecture

Add scheduled tasks as an Electron-owned feature, not as a legacy `server/` route.

Main modules:

- `electron/services/scheduledTasks/parser.js`: turns a natural-language request into a structured task draft.
- `electron/services/scheduledTasks/scheduler.js`: owns in-app scheduling, due-task execution, and startup recovery.
- `electron/services/scheduledTasks/windowsTaskScheduler.js`: creates, updates, deletes, and validates Windows Task Scheduler entries.
- `electron/ipc/scheduledTasks.js`: exposes draft, confirm/save, list, get, update, delete, run-now, and history actions to the renderer.
- Renderer scheduled-task UI:
  - plugin entry in `InputBar.jsx`,
  - routing in `ChatArea.jsx` / `useChat.js`,
  - sidebar task section,
  - Settings tab for full management.

The Windows Task Scheduler entry starts AionUi with a task identifier argument, for example:

```text
AionUi.exe --run-scheduled-task <task-id>
```

In development, the command can target Electron's dev entrypoint. In packaged builds, it targets the installed executable.

## Data Model

Each task record is persisted in `store.getData().scheduledTasks`:

```json
{
  "id": "sch-...",
  "name": "每天检查竞品网页",
  "prompt": "每天早上 8 点打开指定网页并总结变化",
  "schedule": {
    "kind": "cron",
    "cron": "0 8 * * *",
    "timezone": "Asia/Shanghai",
    "human": "每天 08:00"
  },
  "enabled": true,
  "preauthorized": true,
  "authorization": {
    "mode": "full-trust",
    "confirmedAt": "2026-05-12T08:00:00.000Z",
    "confirmedBy": "local-user",
    "summary": "用户确认后，后续触发不再二次请求高风险确认。"
  },
  "conversationId": "conv-...",
  "systemTaskName": "AionUi Scheduled sch-...",
  "createdAt": "2026-05-12T08:00:00.000Z",
  "updatedAt": "2026-05-12T08:00:00.000Z",
  "nextRunAt": "2026-05-13T00:00:00.000Z",
  "lastRun": null,
  "lastStatus": "never-run",
  "history": []
}
```

History entries include:

- `runId`
- `runAt`
- `completedAt`
- `status`: `success`, `error`, `cancelled`, or `skipped`
- `trigger`: `in-app`, `windows-task-scheduler`, or `manual`
- `conversationId`
- `summary`
- `error`
- `toolCalls`

The existing `appendTaskHistory` behavior should keep only recent entries, while full conversation history remains in the dedicated conversation.

## Creation Flow

1. User clicks `+ -> 插件 -> 定时任务`.
2. `pluginMode` becomes `schedule`.
3. The model chip displays a scheduled-task mode indicator, similar to Browser Use and Desktop Use chips.
4. The user sends a natural-language request.
5. Renderer routes that send to scheduled-task creation instead of a normal chat turn.
6. Electron parses the request into a draft with:
   - task name,
   - original prompt,
   - parsed schedule,
   - timezone,
   - next run time,
   - dedicated conversation title,
   - full-trust preauthorization warning.
7. The chat shows the draft and asks for confirmation.
8. User confirms.
9. Electron saves the task, creates the dedicated conversation, registers the Windows Task Scheduler entry, and appends a creation summary to the dedicated conversation.
10. `pluginMode` clears after save or cancel.

If parsing is ambiguous, AionUi asks a clarification question instead of saving an incomplete task.

## Execution Flow

When a task fires while AionUi is already open:

1. `scheduler` receives the due task.
2. It marks a run as started in task history.
3. It appends a "scheduled run started" message to the task conversation.
4. It invokes the Agent Loop with the task prompt and task metadata.
5. It disables confirmation blocking for this preauthorized scheduled run.
6. It forwards streamed reasoning summaries, tool progress, and final output into the dedicated conversation.
7. It records success or failure in task history and updates `lastRun`, `lastStatus`, and `nextRunAt`.

When AionUi has fully exited:

1. Windows Task Scheduler starts AionUi with `--run-scheduled-task <task-id>`.
2. Electron initializes store, IPC, bridges, and the main window.
3. The scheduler runs the requested task after runtime readiness checks.
4. The UI opens or focuses the task's dedicated conversation.
5. Progress appears in that conversation.

## Authorization And Safety

Scheduled tasks use explicit full-trust preauthorization.

Behavior:

- Creation confirmation must clearly state that future runs will not ask again, including high-risk operations.
- The saved task must carry `preauthorized: true` and `authorization.mode: "full-trust"`.
- During scheduled execution, the Agent Loop receives a scheduled-run context that bypasses per-tool confirmation prompts.
- Policy still blocks explicitly forbidden operations that are never allowed by AionUi policy, such as credential exfiltration or destructive unbounded operations.
- Every run records tool call summaries and error outcomes for auditability.

This keeps the user's requested full trust while preserving an audit trail and non-bypassable hard blocks.

## UI Design

Plugin menu:

- Add `定时任务` as a plugin item.
- Selecting it only switches the input to scheduled-task creation mode.
- It does not show task lists, history, pause, delete, or run controls.

Input state:

- The model chip shows a scheduled-task label while `pluginMode === "schedule"`.
- The input hint text explains that the next message creates a scheduled task.
- Cancelling or changing models exits schedule mode.

Chat:

- Drafts and confirmation prompts appear as normal chat messages or compact confirmation UI.
- Created tasks append a summary message to the dedicated conversation.
- Each scheduled run appends progress and results to the same dedicated conversation.

Sidebar:

- Add a `定时任务` section below normal chat controls.
- Show task name, enabled/paused state, and last status.
- Clicking a task opens its dedicated conversation.
- Keep the list compact to avoid crowding the existing chat history.

Settings:

- Add a `定时任务` tab.
- Show all tasks with enabled state, schedule, next run, last status, Windows registration status, and history count.
- Actions: enable/pause, run now, delete, re-register Windows task, open dedicated conversation.
- Display a clear `已预授权` marker on each task.

## Windows Task Scheduler Integration

The integration should be isolated behind `windowsTaskScheduler.js` so tests can validate command construction without requiring actual system registration.

Required operations:

- `registerTask(task)`
- `updateTask(task)`
- `deleteTask(task)`
- `getTaskStatus(task)`
- `buildCreateCommand(task, executablePath)`

Implementation can start with `schtasks.exe` because it is available on supported Windows versions. Commands must avoid shell-string injection by using controlled arguments and validated task names.

Task names should be generated from trusted IDs only:

```text
\AionUi\ScheduledTasks\sch-<uuid>
```

The Windows entry should not store secrets. It only stores the task ID and launches AionUi, which reads local app data.

## Error Handling

- Parse failure: ask for a clearer schedule or task description.
- User rejects draft: discard draft and clear schedule mode.
- Windows registration failure: save failure details and show a retry path; do not claim the task can run after app exit until registration succeeds.
- Missing API key: append failure to task conversation and task history.
- Browser Use or Desktop Use unavailable: append runtime failure and suggest Settings diagnostics.
- App launched with unknown task ID: open AionUi normally and record a startup warning.
- Task deleted while due: skip and do not recreate the Windows entry.
- Duplicate trigger while a prior run is active: skip the new run and record `skipped` unless future requirements ask for queued runs.

## Testing Strategy

Electron unit tests:

- Store preserves scheduled task shape and history.
- IPC registers scheduled-task channels.
- Creating a confirmed task persists `preauthorized: true`.
- Deleting a task removes it from store and calls Windows unregister.
- Manual run appends history and conversation messages.
- Scheduler skips disabled tasks.
- Scheduler prevents overlapping runs for the same task.
- Windows Task Scheduler command builder uses safe task names and expected arguments.

Renderer/static tests:

- `InputBar.jsx` exposes the `定时任务` plugin item.
- `ChatArea.jsx` routes `schedule` mode differently from `browser` and `desktop`.
- `ModelSelector.jsx` displays a scheduled-task chip.
- Sidebar exposes a scheduled-task section without putting task lists in the plugin menu.
- Settings exposes a scheduled-tasks tab with enabled, run now, delete, and authorization markers.

Integration checks:

- Create draft from natural language.
- Confirm draft and verify dedicated conversation creation.
- Trigger run now and verify streamed progress appears in the dedicated conversation.
- Simulate `--run-scheduled-task <id>` startup and verify the app opens the task conversation.

## Open Implementation Notes

- The first implementation should support common daily, weekly, monthly, and cron-like schedules. More advanced recurrence editing can come later.
- The parser should preserve the original user text even when schedule parsing succeeds, so future runs execute the user's intent exactly.
- The UI should avoid adding another large drawer. The sidebar and Settings surfaces are enough for this phase.
- Generated visual companion files under `.superpowers/` are local brainstorming artifacts and should remain ignored by git.
