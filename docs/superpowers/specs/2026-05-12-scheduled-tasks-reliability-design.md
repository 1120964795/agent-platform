# Scheduled Tasks Reliability Design

## Problem

The first scheduled-task implementation has two user-visible failures:

1. A Windows Task Scheduler trigger can launch Electron with only `--run-scheduled-task <id>`. In development, Electron requires an app path before app arguments. Without that path, Electron treats the task id as the app path and shows an error such as `Unable to find Electron app at C:\Windows\system32\sch-...`.
2. Schedule parsing only handles a small set of repeated schedules. Natural one-time reminders such as `今天晚上8点提醒我` should be accepted, but currently are not modeled as a valid task schedule.

## Goals

- Scheduled tasks launched by Windows Task Scheduler must work in both development and packaged builds.
- Natural one-time reminder phrases must create a task draft.
- One-time tasks must run once, then automatically disable while keeping task history and the task-owned conversation.
- Existing repeated schedules must continue to work.
- Blocked policy decisions must remain blocked; full-trust preauthorization still only bypasses repeated high-risk prompts.

## Non-Goals

- No broad natural-language calendar engine.
- No recurring custom RRULE editor.
- No UI redesign beyond labels/status needed to explain one-time completed tasks.
- No cloud sync or cross-device scheduling.

## Chosen Approach

Add a first-class `once` schedule kind and fix Windows launch command construction.

For Windows launch commands:

- Packaged app: launch the executable directly with `--run-scheduled-task <task-id>`.
- Development app: launch Electron with the project root/app path first, then `--run-scheduled-task <task-id>`.
- The task service will pass an explicit app path when registering tasks from development. The Windows scheduler adapter remains responsible for command construction and tests.

For one-time schedules:

- Add schedule shape:

```js
{
  kind: 'once',
  runAt: '2026-05-12T12:00:00.000Z',
  timezone: 'Asia/Shanghai',
  human: '今天 20:00'
}
```

- `nextRunFromSchedule()` returns `runAt` for future one-time tasks and `null` after the time has passed.
- The scheduler disables `once` tasks after a completed run, whether the run succeeds or fails, and records `lastStatus`, `lastRun`, and history as it does today.
- Manual `Run now` remains available for disabled one-time tasks from Settings.

## Supported One-Time Phrases

The parser will support these concrete patterns:

- `今天晚上8点提醒我`
- `今晚8点提醒我`
- `明天上午9点提醒我`
- `明天下午3:30提醒我`
- `2026-05-13 20:00 提醒我`
- `5月13日20点提醒我`

Time-of-day words map as:

- `早上` / `上午`: keep hour as written, except `12点` remains 12.
- `中午`: `11点` and `12点` remain as written; smaller hours add 12.
- `下午` / `晚上` / `今晚`: hours `1-11` add 12, so `晚上8点` becomes 20:00.

If the user says `今天 8点` and that time has already passed, the draft will fail with a clear parse error instead of silently scheduling tomorrow. Users can say `明天8点` for tomorrow.

## Data Flow

1. User selects `定时任务` from the plugin menu.
2. The next chat message goes to `scheduledTasks:draft`.
3. `scheduleUtils.parseScheduleText()` returns a repeated schedule or `once`.
4. User confirms the draft.
5. `taskService.createTask()` persists the task, creates the task-owned conversation, and registers Windows Task Scheduler.
6. When Windows fires, it launches AionUi with a valid app path and `--run-scheduled-task <id>`.
7. `main.js` parses the id, opens the task conversation, and calls `scheduler.runNow(id, 'windows-task-scheduler')`.
8. If the task is `once`, the scheduler disables it after the run and leaves history visible.

## Failure Handling

- If Windows registration fails, task creation returns the existing structured create error and no broken task is silently registered.
- If a one-time phrase resolves to a past time, drafting returns `SCHEDULE_PARSE_FAILED` with examples.
- If Electron is running from development and the app path cannot be resolved, registration returns a clear error rather than creating a bad Windows task.
- Existing bad scheduled tasks can be deleted or recreated from Settings.

## Tests

- Add Windows scheduler adapter tests for packaged and development launch commands.
- Add schedule utility tests for the supported one-time phrases and past-time rejection.
- Add scheduler runner tests that verify a `once` task is disabled after success and after error.
- Keep existing tests for daily, weekly, monthly, interval, IPC, startup, preauthorization, and renderer flow passing.

## Compatibility

Existing task records keep their current repeated schedule shapes. The new `once` kind is additive. Existing history and task ownership fields remain unchanged.
