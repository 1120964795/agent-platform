# Scheduled Tasks Reliability Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix scheduled-task Windows relaunch in development and support one-time natural-language reminders such as `今天晚上8点提醒我`.

**Implementation status:** Completed on 2026-05-12 in commits `7940ac3`, `ab8d562`, and `eb94272`, with final docs and verification in the follow-up documentation commit.

**Architecture:** Add a first-class `once` schedule kind in the schedule utility layer, keep Windows command construction isolated in the Task Scheduler adapter, and keep task lifecycle behavior in the scheduler runner. Development Windows tasks launch Electron with the repo root as the app path; packaged tasks continue launching the packaged executable directly.

**Tech Stack:** Electron main process, Node CommonJS services, Windows `schtasks.exe`, Vitest.

---

## Scope Check

This is a focused reliability repair for the scheduled-task feature. It touches the existing scheduled-task services and tests only; it does not redesign the renderer flow or add a calendar UI.

## File Structure

- Modify `electron/services/scheduledTasks/windowsTaskScheduler.js`
  - Add optional `appPath` support to Windows launch command construction.
  - Add `/SC ONCE` argument construction for one-time schedules.

- Modify `electron/services/scheduledTasks/taskService.js`
  - Pass `appPath` into Windows registration when supplied by the main process.
  - Use detailed parse errors when a one-time reminder resolves to the past.

- Modify `electron/ipc/scheduledTasks.js`
  - Pass scheduled-task service dependencies through explicitly.

- Modify `electron/main.js`
  - Provide `appPath: rootDir` for development registrations.
  - Provide no `appPath` for packaged app registrations.

- Modify `electron/services/scheduledTasks/scheduleUtils.js`
  - Add `kind: 'once'`.
  - Add parsing for today, tonight, tomorrow, explicit date, and Chinese month/day phrases.
  - Use ASCII-safe Unicode escapes for new Chinese matching terms to avoid mojibake edits.

- Modify `electron/services/scheduledTasks/scheduler.js`
  - Disable one-time tasks after success or failure.

- Modify tests:
  - `electron/__tests__/windows-task-scheduler.test.js`
  - `electron/__tests__/scheduled-task-utils.test.js`
  - `electron/__tests__/scheduled-task-runner.test.js`
  - `electron/__tests__/scheduled-tasks-ipc.test.js` if dependency pass-through needs explicit coverage.

---

### Task 1: Fix Windows Task Scheduler Launch Command

**Files:**
- Modify: `electron/services/scheduledTasks/windowsTaskScheduler.js`
- Modify: `electron/services/scheduledTasks/taskService.js`
- Modify: `electron/ipc/scheduledTasks.js`
- Modify: `electron/main.js`
- Test: `electron/__tests__/windows-task-scheduler.test.js`

- [ ] **Step 1: Add failing adapter tests for dev and packaged launch commands**

Append these tests to `electron/__tests__/windows-task-scheduler.test.js`:

```javascript
test('builds development launch command with explicit Electron app path', () => {
  expect(buildTaskRunCommand({
    executablePath: 'C:\\Users\\g\\Desktop\\5.12\\node_modules\\electron\\dist\\electron.exe',
    appPath: 'C:\\Users\\g\\Desktop\\5.12',
    taskId: 'sch-123'
  })).toBe('"C:\\Users\\g\\Desktop\\5.12\\node_modules\\electron\\dist\\electron.exe" "C:\\Users\\g\\Desktop\\5.12" --run-scheduled-task sch-123')
})

test('builds packaged launch command without app path', () => {
  expect(buildTaskRunCommand({
    executablePath: 'C:\\Program Files\\AionUi\\AionUi.exe',
    taskId: 'sch-123'
  })).toBe('"C:\\Program Files\\AionUi\\AionUi.exe" --run-scheduled-task sch-123')
})

test('builds one-time schtasks create args', () => {
  const args = buildCreateArgs({
    id: 'sch-once',
    schedule: {
      kind: 'once',
      runAt: '2026-05-12T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      human: '今天 20:00'
    }
  }, {
    executablePath: 'C:\\Program Files\\AionUi\\AionUi.exe'
  })

  expect(args).toEqual([
    '/Create',
    '/F',
    '/TN',
    '\\AionUi\\ScheduledTasks\\sch-once',
    '/TR',
    '"C:\\Program Files\\AionUi\\AionUi.exe" --run-scheduled-task sch-once',
    '/SC',
    'ONCE',
    '/ST',
    '20:00',
    '/SD',
    '05/12/2026'
  ])
})
```

- [ ] **Step 2: Run the adapter test and verify failure**

Run:

```powershell
npm.cmd test -- electron/__tests__/windows-task-scheduler.test.js
```

Expected:

```text
FAIL electron/__tests__/windows-task-scheduler.test.js
Unsupported scheduled task schedule kind: once
```

- [ ] **Step 3: Implement launch command and once args**

In `electron/services/scheduledTasks/windowsTaskScheduler.js`, replace `buildTaskRunCommand`, add `toTaskDateParts`, and update `scheduleArgs`:

```javascript
function buildTaskRunCommand({ executablePath, appPath = '', taskId }) {
  assertTaskId(taskId)
  if (!executablePath) throw new Error('Missing executablePath for scheduled task command')
  const appSegment = appPath ? ` ${quote(appPath)}` : ''
  return `${quote(executablePath)}${appSegment} --run-scheduled-task ${taskId}`
}

function toTaskDateParts(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid one-time scheduled task runAt: ${value}`)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  )
  return {
    date: `${parts.month}/${parts.day}/${parts.year}`,
    time: `${parts.hour}:${parts.minute}`
  }
}

function scheduleArgs(schedule = {}) {
  if (schedule.kind === 'once') {
    const parts = toTaskDateParts(schedule.runAt)
    return ['/SC', 'ONCE', '/ST', parts.time, '/SD', parts.date]
  }
  if (schedule.kind === 'daily') {
    return ['/SC', 'DAILY', '/ST', `${pad(schedule.hour)}:${pad(schedule.minute)}`]
  }
  if (schedule.kind === 'weekly') {
    return ['/SC', 'WEEKLY', '/D', WEEKDAY_NAMES[schedule.dayOfWeek], '/ST', `${pad(schedule.hour)}:${pad(schedule.minute)}`]
  }
  if (schedule.kind === 'monthly') {
    return ['/SC', 'MONTHLY', '/D', String(schedule.dayOfMonth), '/ST', `${pad(schedule.hour)}:${pad(schedule.minute)}`]
  }
  if (schedule.kind === 'interval-minutes') {
    return ['/SC', 'MINUTE', '/MO', String(schedule.everyMinutes)]
  }
  throw new Error(`Unsupported scheduled task schedule kind: ${schedule.kind}`)
}
```

Update `buildCreateArgs` to pass the app path:

```javascript
function buildCreateArgs(task, options = {}) {
  const taskName = buildTaskName(task.id)
  const runCommand = buildTaskRunCommand({
    executablePath: options.executablePath,
    appPath: options.appPath,
    taskId: task.id
  })
  return ['/Create', '/F', '/TN', taskName, '/TR', runCommand, ...scheduleArgs(task.schedule)]
}
```

Update `registerTask`:

```javascript
async function registerTask(task, options = {}) {
  const executablePath = options.executablePath || process.execPath
  const result = await execFilePromise('schtasks.exe', buildCreateArgs(task, { executablePath, appPath: options.appPath }), options.execFile)
  return { registered: true, taskName: buildTaskName(task.id), ...result }
}
```

- [ ] **Step 4: Pass development app path from Electron main to task service**

In `electron/main.js`, change the scheduled task IPC registration inside `app.whenReady()` from:

```javascript
registerAll(ipcMain, { scheduler: scheduledTaskScheduler })
```

to:

```javascript
registerAll(ipcMain, {
  scheduler: scheduledTaskScheduler,
  scheduledTaskExecutablePath: process.execPath,
  scheduledTaskAppPath: isDev ? rootDir : ''
})
```

In `electron/ipc/scheduledTasks.js`, change service creation:

```javascript
const service = overrides.service || createTaskService({
  ...overrides,
  executablePath: overrides.scheduledTaskExecutablePath || overrides.executablePath,
  appPath: overrides.scheduledTaskAppPath || overrides.appPath || ''
})
```

In `electron/services/scheduledTasks/taskService.js`, update every `registerTask` call to pass `appPath`:

```javascript
const schedulerOptions = {
  executablePath: deps.executablePath || process.execPath,
  appPath: deps.appPath || ''
}
const registration = await windowsScheduler.registerTask(task, schedulerOptions)
```

Use the same `schedulerOptions` object for re-enable registration in `updateTask()`.

- [ ] **Step 5: Run tests and verify pass**

Run:

```powershell
npm.cmd test -- electron/__tests__/windows-task-scheduler.test.js electron/__tests__/scheduled-tasks-ipc.test.js
```

Expected:

```text
PASS electron/__tests__/windows-task-scheduler.test.js
PASS electron/__tests__/scheduled-tasks-ipc.test.js
```

- [ ] **Step 6: Commit**

```powershell
git -c safe.directory=C:/Users/g/Desktop/5.12 add electron/services/scheduledTasks/windowsTaskScheduler.js electron/services/scheduledTasks/taskService.js electron/ipc/scheduledTasks.js electron/main.js electron/__tests__/windows-task-scheduler.test.js
git -c safe.directory=C:/Users/g/Desktop/5.12 commit -m "fix: launch scheduled tasks with app path"
```

---

### Task 2: Add One-Time Reminder Schedule Parsing

**Files:**
- Modify: `electron/services/scheduledTasks/scheduleUtils.js`
- Test: `electron/__tests__/scheduled-task-utils.test.js`

- [ ] **Step 1: Add failing tests for one-time reminders**

Append these tests to `electron/__tests__/scheduled-task-utils.test.js`:

```javascript
test('parses one-time Chinese reminder for tonight', () => {
  const schedule = parseScheduleText('今天晚上8点提醒我', new Date('2026-05-12T10:00:00+08:00'))

  expect(schedule).toEqual({
    kind: 'once',
    runAt: '2026-05-12T12:00:00.000Z',
    timezone: 'Asia/Shanghai',
    human: '今天 20:00'
  })
})

test('parses one-time Chinese reminder for tomorrow morning', () => {
  const schedule = parseScheduleText('明天上午9点提醒我', new Date('2026-05-12T10:00:00+08:00'))

  expect(schedule).toEqual({
    kind: 'once',
    runAt: '2026-05-13T01:00:00.000Z',
    timezone: 'Asia/Shanghai',
    human: '明天 09:00'
  })
})

test('parses one-time explicit date reminder', () => {
  const schedule = parseScheduleText('2026-05-13 20:30 提醒我', new Date('2026-05-12T10:00:00+08:00'))

  expect(schedule).toEqual({
    kind: 'once',
    runAt: '2026-05-13T12:30:00.000Z',
    timezone: 'Asia/Shanghai',
    human: '2026-05-13 20:30'
  })
})

test('returns detailed error for one-time reminder in the past', () => {
  const parsed = parseScheduleTextDetailed('今天上午8点提醒我', new Date('2026-05-12T10:00:00+08:00'))

  expect(parsed).toEqual({
    schedule: null,
    error: {
      code: 'PAST_ONCE',
      message: '这个一次性提醒时间已经过去，请换成未来时间，例如 明天上午8点。'
    }
  })
})

test('calculates next run for future and past one-time schedules', () => {
  const schedule = {
    kind: 'once',
    runAt: '2026-05-12T12:00:00.000Z',
    timezone: 'Asia/Shanghai',
    human: '今天 20:00'
  }

  expect(nextRunFromSchedule(schedule, new Date('2026-05-12T10:00:00+08:00'))).toBe('2026-05-12T12:00:00.000Z')
  expect(nextRunFromSchedule(schedule, new Date('2026-05-12T21:00:00+08:00'))).toBeNull()
})
```

Also update the import in the test:

```javascript
const {
  parseScheduleText,
  parseScheduleTextDetailed,
  nextRunFromSchedule,
  normalizeScheduledTask,
  makeTaskHistoryEntry
} = require('../services/scheduledTasks/scheduleUtils')
```

- [ ] **Step 2: Run the schedule utility test and verify failure**

Run:

```powershell
npm.cmd test -- electron/__tests__/scheduled-task-utils.test.js
```

Expected:

```text
FAIL electron/__tests__/scheduled-task-utils.test.js
parseScheduleTextDetailed is not a function
```

- [ ] **Step 3: Implement ASCII-safe one-time parsing helpers**

In `electron/services/scheduledTasks/scheduleUtils.js`, add these constants and helpers near the top:

```javascript
const CN = {
  today: '\u4eca\u5929',
  tonight: '\u4eca\u665a',
  tomorrow: '\u660e\u5929',
  morning: '\u65e9\u4e0a|\u4e0a\u5348',
  noon: '\u4e2d\u5348',
  afternoon: '\u4e0b\u5348',
  evening: '\u665a\u4e0a',
  remind: '\u63d0\u9192',
  month: '\u6708',
  day: '\u65e5|\u53f7|\u865f',
  hour: '\u70b9|\u6642|\u65f6',
  minute: '\u5206|\u5206\u949f'
}

function shanghaiParts(date) {
  return toShanghaiDateParts(date)
}

function normalizeHourByPeriod(hour, period = '') {
  if (!period) return hour
  if (new RegExp(CN.afternoon).test(period) || new RegExp(CN.evening).test(period) || period === '\u4eca\u665a') {
    return hour >= 1 && hour <= 11 ? hour + 12 : hour
  }
  if (new RegExp(CN.noon).test(period)) {
    return hour >= 1 && hour <= 10 ? hour + 12 : hour
  }
  return hour
}

function parseReadableClock(source) {
  const text = String(source || '')
  const periodPattern = `${CN.tonight}|${CN.morning}|${CN.noon}|${CN.afternoon}|${CN.evening}`
  const half = text.match(new RegExp(`(${periodPattern})?\\s*(\\d{1,2})\\s*(?:${CN.hour})\\s*\\u534a`))
  if (half) {
    return { hour: normalizeHourByPeriod(clampInt(half[2], 0, 23), half[1] || ''), minute: 30 }
  }
  const chinese = text.match(new RegExp(`(${periodPattern})?\\s*(\\d{1,2})\\s*(?:${CN.hour})(?:\\s*(\\d{1,2})\\s*(?:${CN.minute})?)?`))
  if (chinese) {
    return {
      hour: normalizeHourByPeriod(clampInt(chinese[2], 0, 23), chinese[1] || ''),
      minute: chinese[3] ? clampInt(chinese[3], 0, 59) : 0
    }
  }
  const colon = text.match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/)
  if (colon) return { hour: clampInt(colon[1], 0, 23), minute: clampInt(colon[2], 0, 59) }
  return null
}

function makeOnceSchedule(year, month, day, hour, minute, humanPrefix, now) {
  const runAtDate = shanghaiWallTimeToUtc(year, month, day, hour, minute)
  if (runAtDate <= now) {
    return {
      schedule: null,
      error: {
        code: 'PAST_ONCE',
        message: '\u8fd9\u4e2a\u4e00\u6b21\u6027\u63d0\u9192\u65f6\u95f4\u5df2\u7ecf\u8fc7\u53bb\uff0c\u8bf7\u6362\u6210\u672a\u6765\u65f6\u95f4\uff0c\u4f8b\u5982 \u660e\u5929\u4e0a\u53488\u70b9\u3002'
      }
    }
  }
  return {
    schedule: {
      kind: 'once',
      runAt: runAtDate.toISOString(),
      timezone: DEFAULT_TIMEZONE,
      human: `${humanPrefix} ${pad(hour)}:${pad(minute)}`
    },
    error: null
  }
}

function parseOnceSchedule(source, now = new Date()) {
  const text = String(source || '')
  const explicit = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2})(?::|：)(\d{1,2})/)
  if (explicit) {
    const year = clampInt(explicit[1], 1970, 9999)
    const month = clampInt(explicit[2], 1, 12)
    const day = clampInt(explicit[3], 1, 31)
    const hour = clampInt(explicit[4], 0, 23)
    const minute = clampInt(explicit[5], 0, 59)
    return makeOnceSchedule(year, month, day, hour, minute, `${year}-${pad(month)}-${pad(day)}`, now)
  }

  const local = shanghaiParts(now)
  const monthDay = text.match(new RegExp(`(\\d{1,2})\\s*(?:${CN.month})\\s*(\\d{1,2})\\s*(?:${CN.day})`))
  if (monthDay) {
    const clock = parseReadableClock(text)
    if (!clock) return null
    const month = clampInt(monthDay[1], 1, 12)
    const day = clampInt(monthDay[2], 1, 31)
    const year = month < local.month || (month === local.month && day < local.day) ? local.year + 1 : local.year
    return makeOnceSchedule(year, month, day, clock.hour, clock.minute, `${month}\u6708${day}\u65e5`, now)
  }

  const hasToday = text.includes('\u4eca\u5929') || text.includes('\u4eca\u665a')
  const hasTomorrow = text.includes('\u660e\u5929')
  if (!hasToday && !hasTomorrow) return null
  const clock = parseReadableClock(text)
  if (!clock) return null
  const base = shanghaiWallTimeToUtc(local.year, local.month, local.day, 0, 0)
  const target = addDays(base, hasTomorrow ? 1 : 0)
  const targetLocal = shanghaiParts(target)
  return makeOnceSchedule(
    targetLocal.year,
    targetLocal.month,
    targetLocal.day,
    clock.hour,
    clock.minute,
    hasTomorrow ? '\u660e\u5929' : '\u4eca\u5929',
    now
  )
}
```

- [ ] **Step 4: Add detailed parser export and integrate it**

In `scheduleUtils.js`, change `parseScheduleText` to delegate through a detailed parser:

```javascript
function parseScheduleTextDetailed(text, now = new Date()) {
  const source = String(text || '').trim()
  if (!source) return { schedule: null, error: null }

  const once = parseOnceSchedule(source, now)
  if (once?.schedule || once?.error) return once

  const schedule = parseScheduleTextInternal(source, now)
  return { schedule, error: null }
}

function parseScheduleText(text, now = new Date()) {
  return parseScheduleTextDetailed(text, now).schedule
}
```

Move the current repeated parsing body into:

```javascript
function parseScheduleTextInternal(text, now = new Date()) {
  const source = String(text || '').trim()
  if (!source) return null
  // existing interval/monthly/weekly/daily parsing body stays here
}
```

Update the module exports:

```javascript
module.exports = {
  DEFAULT_TIMEZONE,
  MAX_HISTORY,
  parseScheduleText,
  parseScheduleTextDetailed,
  nextRunFromSchedule,
  normalizeScheduledTask,
  makeTaskHistoryEntry
}
```

Update `nextRunFromSchedule()` near the top:

```javascript
if (schedule.kind === 'once') {
  if (!schedule.runAt) return null
  const runAt = new Date(schedule.runAt)
  if (Number.isNaN(runAt.getTime()) || runAt <= from) return null
  return runAt.toISOString()
}
```

- [ ] **Step 5: Use detailed parse errors in task service**

In `electron/services/scheduledTasks/taskService.js`, update the import:

```javascript
const { normalizeScheduledTask, parseScheduleTextDetailed, nextRunFromSchedule } = require('./scheduleUtils')
```

In `draftTask(message)`, replace schedule parsing with:

```javascript
const parsed = parseScheduleTextDetailed(prompt, now())
const schedule = parsed.schedule
if (!schedule) {
  return {
    ok: false,
    error: {
      code: parsed.error?.code || 'SCHEDULE_PARSE_FAILED',
      message: parsed.error?.message || '无法识别定时规则。可以这样说：今天晚上8点提醒我、明天上午9点提醒我、每天8点检查、每周一9:30汇总、每月1号8点生成报告、每隔15分钟检查。'
    }
  }
}
```

- [ ] **Step 6: Run tests and verify pass**

Run:

```powershell
npm.cmd test -- electron/__tests__/scheduled-task-utils.test.js electron/__tests__/scheduled-tasks-ipc.test.js
```

Expected:

```text
PASS electron/__tests__/scheduled-task-utils.test.js
PASS electron/__tests__/scheduled-tasks-ipc.test.js
```

- [ ] **Step 7: Commit**

```powershell
git -c safe.directory=C:/Users/g/Desktop/5.12 add electron/services/scheduledTasks/scheduleUtils.js electron/services/scheduledTasks/taskService.js electron/__tests__/scheduled-task-utils.test.js
git -c safe.directory=C:/Users/g/Desktop/5.12 commit -m "feat: parse one-time scheduled reminders"
```

---

### Task 3: Disable One-Time Tasks After They Run

**Files:**
- Modify: `electron/services/scheduledTasks/scheduler.js`
- Test: `electron/__tests__/scheduled-task-runner.test.js`

- [ ] **Step 1: Add failing runner tests for one-time task lifecycle**

Append to `electron/__tests__/scheduled-task-runner.test.js`:

```javascript
test('one-time tasks are disabled after successful run', async () => {
  const tasks = new Map()
  const conversations = new Map()
  const task = {
    id: 'sch-once',
    name: 'One time reminder',
    prompt: '今天晚上8点提醒我',
    enabled: true,
    preauthorized: true,
    conversationId: 'conv-once',
    schedule: {
      kind: 'once',
      runAt: '2026-05-12T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      human: '今天 20:00'
    },
    nextRunAt: '2026-05-12T12:00:00.000Z',
    history: []
  }
  tasks.set(task.id, task)

  const store = {
    listScheduledTasks: () => Array.from(tasks.values()),
    getConversation: (id) => conversations.get(id),
    upsertConversation: (conversation) => conversations.set(conversation.id, conversation),
    appendTaskHistory: (id, entry) => {
      const current = tasks.get(id)
      tasks.set(id, { ...current, history: [entry, ...(current.history || [])] })
    },
    upsertScheduledTask: (next) => tasks.set(next.id, { ...tasks.get(next.id), ...next })
  }

  const scheduler = createScheduler({
    store,
    now: () => new Date('2026-05-12T12:01:00.000Z'),
    runTurn: async () => ({ finalText: 'Reminder complete.' })
  })

  const result = await scheduler.runNow('sch-once', 'manual')
  const saved = tasks.get('sch-once')

  expect(result.ok).toBe(true)
  expect(saved.enabled).toBe(false)
  expect(saved.nextRunAt).toBeNull()
  expect(saved.lastStatus).toBe('success')
})

test('one-time tasks are disabled after failed run', async () => {
  const tasks = new Map()
  const conversations = new Map()
  const task = {
    id: 'sch-once-error',
    name: 'One time reminder',
    prompt: '今天晚上8点提醒我',
    enabled: true,
    preauthorized: true,
    conversationId: 'conv-once-error',
    schedule: {
      kind: 'once',
      runAt: '2026-05-12T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      human: '今天 20:00'
    },
    nextRunAt: '2026-05-12T12:00:00.000Z',
    history: []
  }
  tasks.set(task.id, task)

  const store = {
    listScheduledTasks: () => Array.from(tasks.values()),
    getConversation: (id) => conversations.get(id),
    upsertConversation: (conversation) => conversations.set(conversation.id, conversation),
    appendTaskHistory: (id, entry) => {
      const current = tasks.get(id)
      tasks.set(id, { ...current, history: [entry, ...(current.history || [])] })
    },
    upsertScheduledTask: (next) => tasks.set(next.id, { ...tasks.get(next.id), ...next })
  }

  const scheduler = createScheduler({
    store,
    now: () => new Date('2026-05-12T12:01:00.000Z'),
    runTurn: async () => { throw new Error('boom') }
  })

  const result = await scheduler.runNow('sch-once-error', 'manual')
  const saved = tasks.get('sch-once-error')

  expect(result.ok).toBe(false)
  expect(saved.enabled).toBe(false)
  expect(saved.nextRunAt).toBeNull()
  expect(saved.lastStatus).toBe('error')
})
```

- [ ] **Step 2: Run the runner test and verify failure**

Run:

```powershell
npm.cmd test -- electron/__tests__/scheduled-task-runner.test.js
```

Expected:

```text
FAIL electron/__tests__/scheduled-task-runner.test.js
expected true to be false
```

- [ ] **Step 3: Implement one-time completion state**

In `electron/services/scheduledTasks/scheduler.js`, add this helper inside `createScheduler()`:

```javascript
function applyPostRunSchedule(task, status, runAt) {
  const once = task.schedule?.kind === 'once'
  return {
    ...task,
    enabled: once ? false : task.enabled,
    lastStatus: status,
    lastRun: runAt,
    nextRunAt: once ? null : nextRunFromSchedule(task.schedule, now())
  }
}
```

Replace the success branch `next` object with:

```javascript
const next = applyPostRunSchedule(task, 'success', runAt)
store.upsertScheduledTask(next)
if (next.enabled !== false && next.nextRunAt) scheduleTask(next)
else clearTimer(taskId)
return { ok: true, task: next, entry }
```

Replace the error branch `next` object with:

```javascript
const next = applyPostRunSchedule(task, 'error', runAt)
store.upsertScheduledTask(next)
if (next.enabled !== false && next.nextRunAt) scheduleTask(next)
else clearTimer(taskId)
return { ok: false, error: { code: 'RUN_FAILED', message: error.message }, entry }
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```powershell
npm.cmd test -- electron/__tests__/scheduled-task-runner.test.js electron/__tests__/scheduled-task-utils.test.js
```

Expected:

```text
PASS electron/__tests__/scheduled-task-runner.test.js
PASS electron/__tests__/scheduled-task-utils.test.js
```

- [ ] **Step 5: Commit**

```powershell
git -c safe.directory=C:/Users/g/Desktop/5.12 add electron/services/scheduledTasks/scheduler.js electron/__tests__/scheduled-task-runner.test.js
git -c safe.directory=C:/Users/g/Desktop/5.12 commit -m "fix: complete one-time scheduled tasks"
```

---

### Task 4: Docs And Full Verification

**Files:**
- Modify: `docs/USER_MANUAL.md`
- Modify: `docs/runtime-setup.md`
- Modify: `docs/superpowers/plans/2026-05-12-scheduled-tasks-reliability-fixes.md`

- [ ] **Step 1: Update user docs with one-time reminder examples**

In `docs/USER_MANUAL.md`, update the Scheduled Tasks section to include:

```markdown
One-time reminders are supported. Examples:

- `今天晚上8点提醒我`
- `明天上午9点提醒我`
- `2026-05-13 20:30 提醒我`

One-time tasks automatically disable after they run. They remain visible in Settings and keep their conversation history.
```

In `docs/runtime-setup.md`, update Windows Scheduled Tasks with:

```markdown
In development, Windows tasks launch Electron with the project root path before `--run-scheduled-task <task-id>`. In packaged builds, they launch `AionUi.exe` directly. This avoids Electron treating the task id as the app path when Task Scheduler starts from `C:\Windows\System32`.
```

- [ ] **Step 2: Run focused reliability suite**

Run:

```powershell
npm.cmd test -- electron/__tests__/scheduled-task-utils.test.js electron/__tests__/windows-task-scheduler.test.js electron/__tests__/scheduled-task-runner.test.js electron/__tests__/scheduled-tasks-ipc.test.js electron/__tests__/scheduled-task-startup.test.js
```

Expected:

```text
PASS electron/__tests__/scheduled-task-utils.test.js
PASS electron/__tests__/windows-task-scheduler.test.js
PASS electron/__tests__/scheduled-task-runner.test.js
PASS electron/__tests__/scheduled-tasks-ipc.test.js
PASS electron/__tests__/scheduled-task-startup.test.js
```

- [ ] **Step 3: Run full test suite**

Run:

```powershell
npm.cmd test
```

Expected:

```text
Test Files  all passed
Tests       all passed
```

- [ ] **Step 4: Run client build**

Run:

```powershell
npm.cmd run build:client
```

Expected:

```text
vite v...
built in ...
```

- [ ] **Step 5: Optional manual smoke**

Run the app against a clean dev port:

```powershell
npm.cmd --prefix client run dev -- --host 127.0.0.1 --port 5188 --strictPort
$env:AGENTDEV_DEV_SERVER_URL='http://127.0.0.1:5188'
.\node_modules\.bin\electron.cmd .
```

Smoke checklist:

- Open `+ -> 插件`.
- Select `定时任务`.
- Send `今天晚上8点提醒我`.
- Confirm the draft.
- Verify Settings -> Scheduled Tasks shows a one-time task with the expected next run.
- Create a near-future one-time task and verify it does not produce the Electron `Unable to find Electron app at C:\Windows\system32\sch-...` error when Task Scheduler fires.

- [ ] **Step 6: Commit docs and plan updates**

```powershell
git -c safe.directory=C:/Users/g/Desktop/5.12 add docs/USER_MANUAL.md docs/runtime-setup.md docs/superpowers/plans/2026-05-12-scheduled-tasks-reliability-fixes.md
git -c safe.directory=C:/Users/g/Desktop/5.12 commit -m "docs: document scheduled task reliability fixes"
```

---

## Plan Self-Review

Spec coverage:

- Development Windows launch error: Task 1 adds explicit Electron app path support and tests it.
- Packaged launch compatibility: Task 1 preserves app-path-free packaged command and tests it.
- One-time reminders: Task 2 adds `kind: 'once'`, `runAt`, human labels, and examples.
- Past one-time reminders: Task 2 adds detailed parse error handling.
- Disable after run: Task 3 covers success and error completion.
- Existing schedules: Task 2 keeps repeated parsing in an internal function and focused tests continue running.
- Documentation and verification: Task 4 updates docs and runs focused/full test suites and build.

Placeholder scan:

- No `TBD`, `TODO`, "fill in details", or "write tests for the above" placeholders remain.
- Each code-changing step names exact files and includes concrete snippets.

Type consistency:

- Schedule kind is consistently `once`.
- One-time schedule field is consistently `runAt`.
- Service dependency fields are consistently `scheduledTaskExecutablePath`, `scheduledTaskAppPath`, `executablePath`, and `appPath`.
- Detailed parser is consistently named `parseScheduleTextDetailed`.
