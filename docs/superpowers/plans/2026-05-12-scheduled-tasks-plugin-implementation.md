# Scheduled Tasks Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Codex-style scheduled-task plugin where the plugin menu starts natural-language task creation, confirmed tasks are fully preauthorized, Windows can relaunch AionUi when due, and every run appends progress to a task-owned conversation.

**Architecture:** Keep scheduled tasks inside Electron, not the legacy `server/` tree. Add focused services for schedule parsing, Windows Task Scheduler command construction, task persistence orchestration, and Agent Loop execution; expose them through a new IPC module. The renderer adds a schedule plugin mode, a draft confirmation flow in chat, a compact sidebar task section, and a Settings management tab.

**Tech Stack:** Electron main process, React/Vite, Vitest, Node `child_process.execFile`, Windows `schtasks.exe`, existing DeepSeek/Agent Loop/tool policy/conversation store.

---

## Scope Check

The feature spans several layers, but the pieces are tightly coupled by one vertical user flow: create a scheduled task from the plugin menu, persist/register it, run it, and manage it. This plan keeps it as one deliverable because each task produces a testable slice and no independent subsystem is useful without the others.

## File Structure

- Create `electron/services/scheduledTasks/scheduleUtils.js`
  - Parse common schedule text into structured schedules.
  - Calculate `nextRunAt`.
  - Normalize task records and history entries.

- Create `electron/services/scheduledTasks/windowsTaskScheduler.js`
  - Build safe `schtasks.exe` arguments.
  - Register/delete/query Windows Task Scheduler entries through `execFile`.
  - Keep all Windows command construction isolated and unit-testable.

- Create `electron/services/scheduledTasks/taskService.js`
  - Draft tasks from user text.
  - Confirm/create tasks.
  - Update/delete/list tasks.
  - Create and append task-owned conversations.
  - Delegate Windows registration to `windowsTaskScheduler.js`.

- Create `electron/services/scheduledTasks/scheduler.js`
  - Maintain in-app timers.
  - Prevent overlapping runs per task.
  - Execute due/manual/startup-triggered tasks through the Agent Loop.

- Create `electron/services/scheduledTasks/startup.js`
  - Parse `--run-scheduled-task <task-id>`.
  - Build a safe conversation opener callback for `main.js`.
  - Keep startup helpers testable without importing Electron's main entrypoint.

- Create `electron/ipc/scheduledTasks.js`
  - Register IPC channels for draft, create, list, update, delete, run-now, and status.

- Modify `electron/ipc/index.js`
  - Register the scheduled-tasks IPC module.

- Modify `electron/services/agentLoop.js`
  - Add a `preauthorized` option that bypasses high-risk confirmation prompts while preserving blocked-policy decisions.

- Modify `electron/main.js`
  - Initialize the scheduler.
  - Parse `--run-scheduled-task <task-id>`.
  - Open/focus the task conversation when a scheduled run starts.

- Modify `electron/preload.js`
  - Expose `onOpenConversation` and scheduled-task IPC convenience methods.

- Modify `client/src/lib/api.js`
  - Add scheduled-task API wrappers.

- Create `client/src/hooks/useScheduledTasks.js`
  - Load, refresh, update, delete, and run tasks from renderer state.

- Modify `client/src/hooks/useChat.js`
  - Add scheduled-task draft confirmation state.
  - Route schedule plugin sends to IPC instead of normal chat.

- Modify `client/src/components/chat/InputBar.jsx`
  - Add the schedule plugin item.
  - Keep plugin menu as a launcher only; do not render task lists in the plugin menu.

- Modify `client/src/components/chat/ModelSelector.jsx`
  - Show a scheduled-task mode chip.

- Modify `client/src/components/chat/ChatArea.jsx`
  - Route `pluginMode === "schedule"` to the scheduled-task creation flow.

- Modify `client/src/components/chat/MessageBubble.jsx`
  - Render schedule draft confirmation controls.

- Modify `client/src/components/layout/Layout.jsx`
  - Load scheduled tasks.
  - Listen for `app:open-conversation`.
  - Pass task state and callbacks to `Sidebar`.

- Modify `client/src/components/layout/Sidebar.jsx`
  - Render a compact scheduled-task section below normal chat controls.

- Modify `client/src/pages/SettingsPage.jsx`
  - Add a Scheduled Tasks tab with management controls.

- Tests:
  - Create `electron/__tests__/scheduled-task-utils.test.js`
  - Create `electron/__tests__/windows-task-scheduler.test.js`
  - Create `electron/__tests__/scheduled-tasks-ipc.test.js`
  - Modify `electron/__tests__/agent-loop.test.js`
  - Modify `electron/__tests__/ipc.test.js`
  - Modify `client/src/components/chat/unified-chat-ui.test.js`
  - Modify `client/src/lib/api.test.js`

---

### Task 1: Schedule Utilities And Task Shape

**Files:**
- Create: `electron/services/scheduledTasks/scheduleUtils.js`
- Create: `electron/__tests__/scheduled-task-utils.test.js`
- Modify: `electron/__tests__/store.test.js`

- [ ] **Step 1: Write failing tests for schedule parsing and task normalization**

Create `electron/__tests__/scheduled-task-utils.test.js`:

```javascript
import { describe, expect, test } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const {
  parseScheduleText,
  nextRunFromSchedule,
  normalizeScheduledTask,
  makeTaskHistoryEntry
} = require('../services/scheduledTasks/scheduleUtils')

describe('scheduled task schedule utilities', () => {
  test('parses daily Chinese schedule text', () => {
    const schedule = parseScheduleText('每天早上 8 点检查 https://example.com', new Date('2026-05-12T01:00:00+08:00'))

    expect(schedule).toEqual({
      kind: 'daily',
      hour: 8,
      minute: 0,
      timezone: 'Asia/Shanghai',
      human: '每天 08:00'
    })
  })

  test('parses weekly Chinese schedule text', () => {
    const schedule = parseScheduleText('每周一 9:30 生成报告', new Date('2026-05-12T01:00:00+08:00'))

    expect(schedule).toEqual({
      kind: 'weekly',
      dayOfWeek: 1,
      hour: 9,
      minute: 30,
      timezone: 'Asia/Shanghai',
      human: '每周一 09:30'
    })
  })

  test('parses monthly Chinese schedule text', () => {
    const schedule = parseScheduleText('每月 1 号 8 点生成月报', new Date('2026-05-12T01:00:00+08:00'))

    expect(schedule).toEqual({
      kind: 'monthly',
      dayOfMonth: 1,
      hour: 8,
      minute: 0,
      timezone: 'Asia/Shanghai',
      human: '每月 1 号 08:00'
    })
  })

  test('parses minute interval schedule text', () => {
    const schedule = parseScheduleText('每隔 15 分钟检查一次状态', new Date('2026-05-12T01:00:00+08:00'))

    expect(schedule).toEqual({
      kind: 'interval-minutes',
      everyMinutes: 15,
      timezone: 'Asia/Shanghai',
      human: '每隔 15 分钟'
    })
  })

  test('returns null when no schedule is clear', () => {
    expect(parseScheduleText('有空的时候检查网页')).toBeNull()
  })

  test('calculates next daily run after current time', () => {
    const next = nextRunFromSchedule(
      { kind: 'daily', hour: 8, minute: 0, timezone: 'Asia/Shanghai', human: '每天 08:00' },
      new Date('2026-05-12T09:00:00+08:00')
    )

    expect(next).toBe('2026-05-13T00:00:00.000Z')
  })

  test('normalizes scheduled task records with preauthorization fields', () => {
    const task = normalizeScheduledTask({
      id: 'sch-test',
      name: '检查网页',
      prompt: '每天 8 点检查网页',
      schedule: { kind: 'daily', hour: 8, minute: 0, timezone: 'Asia/Shanghai', human: '每天 08:00' },
      conversationId: 'conv-test',
      createdAt: '2026-05-12T00:00:00.000Z',
      updatedAt: '2026-05-12T00:00:00.000Z'
    })

    expect(task).toMatchObject({
      id: 'sch-test',
      enabled: true,
      preauthorized: true,
      authorization: { mode: 'full-trust', confirmedBy: 'local-user' },
      lastStatus: 'never-run',
      history: []
    })
  })

  test('history entries keep recent structured run data', () => {
    expect(makeTaskHistoryEntry({
      taskId: 'sch-test',
      trigger: 'manual',
      status: 'success',
      summary: 'Ran task',
      toolCalls: [{ name: 'browser_task', status: 'success' }]
    })).toMatchObject({
      taskId: 'sch-test',
      trigger: 'manual',
      status: 'success',
      summary: 'Ran task',
      toolCalls: [{ name: 'browser_task', status: 'success' }]
    })
  })
})
```

Append this test to `electron/__tests__/store.test.js`:

```javascript
test('scheduled task history remains capped at 20 entries', () => {
  const task = {
    id: 'sch-history',
    name: 'History task',
    prompt: 'run',
    schedule: { kind: 'daily', hour: 8, minute: 0, timezone: 'Asia/Shanghai', human: '每天 08:00' },
    enabled: true,
    preauthorized: true,
    conversationId: 'conv-history',
    history: []
  }
  store.upsertScheduledTask(task)

  for (let i = 0; i < 25; i += 1) {
    store.appendTaskHistory('sch-history', {
      runId: `run-${i}`,
      runAt: `2026-05-12T00:${String(i).padStart(2, '0')}:00.000Z`,
      status: 'success'
    })
  }

  const saved = store.listScheduledTasks().find((item) => item.id === 'sch-history')
  expect(saved.history).toHaveLength(20)
  expect(saved.history[0].runId).toBe('run-24')
  expect(saved.lastRun).toBe('2026-05-12T00:24:00.000Z')
})
```

- [ ] **Step 2: Run tests and verify they fail for missing module**

Run:

```powershell
npm test -- electron/__tests__/scheduled-task-utils.test.js electron/__tests__/store.test.js
```

Expected:

```text
FAIL electron/__tests__/scheduled-task-utils.test.js
Cannot find module '../services/scheduledTasks/scheduleUtils'
```

- [ ] **Step 3: Implement schedule utility module**

Create `electron/services/scheduledTasks/scheduleUtils.js`:

```javascript
const DEFAULT_TIMEZONE = 'Asia/Shanghai'
const MAX_HISTORY = 20

const WEEKDAY_MAP = new Map([
  ['一', 1], ['二', 2], ['三', 3], ['四', 4], ['五', 5], ['六', 6], ['日', 0], ['天', 0],
  ['1', 1], ['2', 2], ['3', 3], ['4', 4], ['5', 5], ['6', 6], ['7', 0], ['0', 0]
])

function pad(value) {
  return String(value).padStart(2, '0')
}

function clampInt(value, min, max) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return null
  return Math.min(max, Math.max(min, parsed))
}

function parseClock(text) {
  const source = String(text || '')
  const colon = source.match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/)
  if (colon) {
    return {
      hour: clampInt(colon[1], 0, 23),
      minute: clampInt(colon[2], 0, 59)
    }
  }
  const hourOnly = source.match(/(\d{1,2})\s*(点|點|时|時)/)
  if (hourOnly) {
    return {
      hour: clampInt(hourOnly[1], 0, 23),
      minute: 0
    }
  }
  return { hour: 8, minute: 0 }
}

function parseScheduleText(text, now = new Date()) {
  const source = String(text || '').trim()
  if (!source) return null

  const interval = source.match(/每\s*(隔)?\s*(\d{1,4})\s*分钟/)
  if (interval) {
    const everyMinutes = clampInt(interval[2], 1, 1440)
    return {
      kind: 'interval-minutes',
      everyMinutes,
      timezone: DEFAULT_TIMEZONE,
      human: `每隔 ${everyMinutes} 分钟`
    }
  }

  const monthly = source.match(/每月\s*(\d{1,2})\s*(号|日)?/)
  if (monthly) {
    const { hour, minute } = parseClock(source)
    const dayOfMonth = clampInt(monthly[1], 1, 31)
    return {
      kind: 'monthly',
      dayOfMonth,
      hour,
      minute,
      timezone: DEFAULT_TIMEZONE,
      human: `每月 ${dayOfMonth} 号 ${pad(hour)}:${pad(minute)}`
    }
  }

  const weekly = source.match(/每周\s*([一二三四五六日天0-7])/)
  if (weekly) {
    const { hour, minute } = parseClock(source)
    const dayOfWeek = WEEKDAY_MAP.get(weekly[1])
    return {
      kind: 'weekly',
      dayOfWeek,
      hour,
      minute,
      timezone: DEFAULT_TIMEZONE,
      human: `每周${weekly[1]} ${pad(hour)}:${pad(minute)}`
    }
  }

  if (/每天|每日/.test(source)) {
    const { hour, minute } = parseClock(source)
    return {
      kind: 'daily',
      hour,
      minute,
      timezone: DEFAULT_TIMEZONE,
      human: `每天 ${pad(hour)}:${pad(minute)}`
    }
  }

  return null
}

function toShanghaiDateParts(date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  const parts = Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  }
}

function shanghaiWallTimeToUtc(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0))
}

function addDays(date, days) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function nextRunFromSchedule(schedule = {}, from = new Date()) {
  if (schedule.kind === 'interval-minutes') {
    return new Date(from.getTime() + schedule.everyMinutes * 60 * 1000).toISOString()
  }

  const local = toShanghaiDateParts(from)
  let candidate = shanghaiWallTimeToUtc(local.year, local.month, local.day, schedule.hour || 0, schedule.minute || 0)

  if (schedule.kind === 'daily') {
    if (candidate <= from) candidate = addDays(candidate, 1)
    return candidate.toISOString()
  }

  if (schedule.kind === 'weekly') {
    const localDay = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay()
    let daysUntil = (schedule.dayOfWeek - localDay + 7) % 7
    if (daysUntil === 0 && candidate <= from) daysUntil = 7
    return addDays(candidate, daysUntil).toISOString()
  }

  if (schedule.kind === 'monthly') {
    const day = Math.min(schedule.dayOfMonth || 1, 28)
    candidate = shanghaiWallTimeToUtc(local.year, local.month, day, schedule.hour || 0, schedule.minute || 0)
    if (candidate <= from) {
      const month = local.month === 12 ? 1 : local.month + 1
      const year = local.month === 12 ? local.year + 1 : local.year
      candidate = shanghaiWallTimeToUtc(year, month, day, schedule.hour || 0, schedule.minute || 0)
    }
    return candidate.toISOString()
  }

  return null
}

function makeTaskHistoryEntry({ taskId, trigger, status, summary = '', error = null, toolCalls = [], runAt = new Date().toISOString(), completedAt = null }) {
  return {
    runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskId,
    trigger,
    status,
    runAt,
    completedAt,
    summary,
    error,
    toolCalls
  }
}

function normalizeScheduledTask(task = {}, now = new Date()) {
  const createdAt = task.createdAt || now.toISOString()
  const updatedAt = task.updatedAt || createdAt
  const schedule = task.schedule || parseScheduleText(task.prompt || '', now)
  return {
    id: task.id,
    name: task.name || 'Scheduled task',
    prompt: task.prompt || '',
    schedule,
    enabled: task.enabled !== false,
    preauthorized: true,
    authorization: {
      mode: 'full-trust',
      confirmedAt: task.authorization?.confirmedAt || createdAt,
      confirmedBy: task.authorization?.confirmedBy || 'local-user',
      summary: task.authorization?.summary || 'User confirmed that future scheduled runs do not ask again for high-risk confirmation.'
    },
    conversationId: task.conversationId,
    systemTaskName: task.systemTaskName || '',
    createdAt,
    updatedAt,
    nextRunAt: task.nextRunAt || (schedule ? nextRunFromSchedule(schedule, now) : null),
    lastRun: task.lastRun || null,
    lastStatus: task.lastStatus || 'never-run',
    history: Array.isArray(task.history) ? task.history.slice(0, MAX_HISTORY) : []
  }
}

module.exports = {
  DEFAULT_TIMEZONE,
  MAX_HISTORY,
  parseScheduleText,
  nextRunFromSchedule,
  normalizeScheduledTask,
  makeTaskHistoryEntry
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```powershell
npm test -- electron/__tests__/scheduled-task-utils.test.js electron/__tests__/store.test.js
```

Expected:

```text
PASS electron/__tests__/scheduled-task-utils.test.js
PASS electron/__tests__/store.test.js
```

- [ ] **Step 5: Commit**

```powershell
git add electron/services/scheduledTasks/scheduleUtils.js electron/__tests__/scheduled-task-utils.test.js electron/__tests__/store.test.js
git commit -m "feat: add scheduled task schedule utilities"
```

---

### Task 2: Windows Task Scheduler Adapter

**Files:**
- Create: `electron/services/scheduledTasks/windowsTaskScheduler.js`
- Create: `electron/__tests__/windows-task-scheduler.test.js`

- [ ] **Step 1: Write failing tests for safe command construction**

Create `electron/__tests__/windows-task-scheduler.test.js`:

```javascript
import { describe, expect, test, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const {
  buildTaskName,
  buildTaskRunCommand,
  buildCreateArgs,
  registerTask,
  deleteTask,
  getTaskStatus
} = require('../services/scheduledTasks/windowsTaskScheduler')

const dailyTask = {
  id: 'sch-123',
  schedule: { kind: 'daily', hour: 8, minute: 0, timezone: 'Asia/Shanghai', human: '每天 08:00' }
}

describe('windows task scheduler adapter', () => {
  test('builds trusted Windows task names from task ids only', () => {
    expect(buildTaskName('sch-123')).toBe('\\AionUi\\ScheduledTasks\\sch-123')
    expect(() => buildTaskName('../bad')).toThrow(/Invalid scheduled task id/)
  })

  test('builds launch command without storing secrets', () => {
    expect(buildTaskRunCommand({
      executablePath: 'C:\\Program Files\\AionUi\\AionUi.exe',
      taskId: 'sch-123'
    })).toBe('"C:\\Program Files\\AionUi\\AionUi.exe" --run-scheduled-task sch-123')
  })

  test('builds daily schtasks create args', () => {
    const args = buildCreateArgs(dailyTask, {
      executablePath: 'C:\\Program Files\\AionUi\\AionUi.exe'
    })

    expect(args).toEqual([
      '/Create',
      '/F',
      '/TN',
      '\\AionUi\\ScheduledTasks\\sch-123',
      '/TR',
      '"C:\\Program Files\\AionUi\\AionUi.exe" --run-scheduled-task sch-123',
      '/SC',
      'DAILY',
      '/ST',
      '08:00'
    ])
  })

  test('builds weekly schtasks create args', () => {
    const args = buildCreateArgs({
      id: 'sch-weekly',
      schedule: { kind: 'weekly', dayOfWeek: 5, hour: 17, minute: 30, timezone: 'Asia/Shanghai', human: '每周五 17:30' }
    }, { executablePath: 'C:\\AionUi.exe' })

    expect(args).toContain('/SC')
    expect(args).toContain('WEEKLY')
    expect(args).toContain('/D')
    expect(args).toContain('FRI')
    expect(args).toContain('17:30')
  })

  test('register delete and query use execFile with schtasks.exe', async () => {
    const execFile = vi.fn((_file, _args, cb) => cb(null, 'ok', ''))

    await registerTask(dailyTask, { executablePath: 'C:\\AionUi.exe', execFile })
    await deleteTask('sch-123', { execFile })
    const status = await getTaskStatus('sch-123', { execFile })

    expect(execFile.mock.calls[0][0]).toBe('schtasks.exe')
    expect(execFile.mock.calls[0][1][0]).toBe('/Create')
    expect(execFile.mock.calls[1][1]).toEqual(['/Delete', '/F', '/TN', '\\AionUi\\ScheduledTasks\\sch-123'])
    expect(execFile.mock.calls[2][1]).toEqual(['/Query', '/TN', '\\AionUi\\ScheduledTasks\\sch-123'])
    expect(status).toEqual({ registered: true, stdout: 'ok' })
  })
})
```

- [ ] **Step 2: Run test and verify it fails for missing module**

Run:

```powershell
npm test -- electron/__tests__/windows-task-scheduler.test.js
```

Expected:

```text
FAIL electron/__tests__/windows-task-scheduler.test.js
Cannot find module '../services/scheduledTasks/windowsTaskScheduler'
```

- [ ] **Step 3: Implement Windows adapter**

Create `electron/services/scheduledTasks/windowsTaskScheduler.js`:

```javascript
const { execFile: defaultExecFile } = require('child_process')

const TASK_ROOT = '\\AionUi\\ScheduledTasks\\'
const WEEKDAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function pad(value) {
  return String(value).padStart(2, '0')
}

function assertTaskId(taskId) {
  if (!/^sch-[a-zA-Z0-9_-]+$/.test(String(taskId || ''))) {
    throw new Error(`Invalid scheduled task id: ${taskId}`)
  }
}

function buildTaskName(taskId) {
  assertTaskId(taskId)
  return `${TASK_ROOT}${taskId}`
}

function quote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`
}

function buildTaskRunCommand({ executablePath, taskId }) {
  assertTaskId(taskId)
  if (!executablePath) throw new Error('Missing executablePath for scheduled task command')
  return `${quote(executablePath)} --run-scheduled-task ${taskId}`
}

function scheduleArgs(schedule = {}) {
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

function buildCreateArgs(task, options = {}) {
  const taskName = buildTaskName(task.id)
  const runCommand = buildTaskRunCommand({ executablePath: options.executablePath, taskId: task.id })
  return ['/Create', '/F', '/TN', taskName, '/TR', runCommand, ...scheduleArgs(task.schedule)]
}

function execFilePromise(file, args, execFile = defaultExecFile) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true }, (error, stdout = '', stderr = '') => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

async function registerTask(task, options = {}) {
  const executablePath = options.executablePath || process.execPath
  const result = await execFilePromise('schtasks.exe', buildCreateArgs(task, { executablePath }), options.execFile)
  return { registered: true, taskName: buildTaskName(task.id), ...result }
}

async function deleteTask(taskId, options = {}) {
  const result = await execFilePromise('schtasks.exe', ['/Delete', '/F', '/TN', buildTaskName(taskId)], options.execFile)
  return { registered: false, taskName: buildTaskName(taskId), ...result }
}

async function getTaskStatus(taskId, options = {}) {
  try {
    const result = await execFilePromise('schtasks.exe', ['/Query', '/TN', buildTaskName(taskId)], options.execFile)
    return { registered: true, ...result }
  } catch (error) {
    return { registered: false, error: error.message, stdout: error.stdout || '', stderr: error.stderr || '' }
  }
}

module.exports = {
  TASK_ROOT,
  buildTaskName,
  buildTaskRunCommand,
  buildCreateArgs,
  registerTask,
  deleteTask,
  getTaskStatus
}
```

- [ ] **Step 4: Run test and verify it passes**

Run:

```powershell
npm test -- electron/__tests__/windows-task-scheduler.test.js
```

Expected:

```text
PASS electron/__tests__/windows-task-scheduler.test.js
```

- [ ] **Step 5: Commit**

```powershell
git add electron/services/scheduledTasks/windowsTaskScheduler.js electron/__tests__/windows-task-scheduler.test.js
git commit -m "feat: add Windows scheduled task adapter"
```

---

### Task 3: Scheduled Task Service And IPC

**Files:**
- Create: `electron/services/scheduledTasks/taskService.js`
- Create: `electron/ipc/scheduledTasks.js`
- Create: `electron/__tests__/scheduled-tasks-ipc.test.js`
- Modify: `electron/ipc/index.js`
- Modify: `electron/__tests__/ipc.test.js`

- [ ] **Step 1: Write failing IPC tests**

Create `electron/__tests__/scheduled-tasks-ipc.test.js`:

```javascript
import { beforeEach, expect, test, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-scheduled-ipc-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')

const require = createRequire(import.meta.url)
const convDir = path.join(TMP, 'conversations')
require.cache[require.resolve('electron')] = {
  exports: {
    app: {
      getPath: () => {
        fs.mkdirSync(convDir, { recursive: true })
        return convDir
      }
    }
  }
}

const { store } = require('../store')
const scheduledTasks = require('../ipc/scheduledTasks')

function createIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler))
  }
}

beforeEach(() => {
  try { store.closeConversationStore() } catch {}
  fs.rmSync(TMP, { recursive: true, force: true })
})

test('scheduledTasks:draft returns parsed draft and full trust warning', async () => {
  const ipcMain = createIpcMain()
  scheduledTasks.register(ipcMain, {
    now: () => new Date('2026-05-12T01:00:00+08:00'),
    windowsScheduler: { registerTask: vi.fn() }
  })

  const result = await ipcMain.handlers.get('scheduledTasks:draft')({}, {
    message: '每天 8 点打开 https://example.com 检查更新'
  })

  expect(result.ok).toBe(true)
  expect(result.draft).toMatchObject({
    name: '每天 8 点打开 https://example.com 检查更新',
    prompt: '每天 8 点打开 https://example.com 检查更新',
    schedule: { kind: 'daily', hour: 8, minute: 0 },
    preauthorizationWarning: expect.stringContaining('不再二次确认')
  })
})

test('scheduledTasks:create persists preauthorized task and creates dedicated conversation', async () => {
  const registerTask = vi.fn(async (task) => ({ registered: true, taskName: `\\AionUi\\ScheduledTasks\\${task.id}` }))
  const ipcMain = createIpcMain()
  scheduledTasks.register(ipcMain, {
    now: () => new Date('2026-05-12T01:00:00+08:00'),
    windowsScheduler: { registerTask }
  })

  const draft = (await ipcMain.handlers.get('scheduledTasks:draft')({}, {
    message: '每天 8 点打开 https://example.com 检查更新'
  })).draft
  const created = await ipcMain.handlers.get('scheduledTasks:create')({}, { draft })

  expect(created.ok).toBe(true)
  expect(created.task.preauthorized).toBe(true)
  expect(created.task.conversationId).toMatch(/^conv_/)
  expect(registerTask).toHaveBeenCalledOnce()
  expect(store.listScheduledTasks()).toHaveLength(1)
  expect(store.getConversation(created.task.conversationId).title).toContain('定时任务')
})

test('scheduledTasks:update pauses task and re-registers when enabled', async () => {
  const registerTask = vi.fn(async () => ({ registered: true }))
  const deleteTask = vi.fn(async () => ({ registered: false }))
  const ipcMain = createIpcMain()
  scheduledTasks.register(ipcMain, {
    now: () => new Date('2026-05-12T01:00:00+08:00'),
    windowsScheduler: { registerTask, deleteTask }
  })

  const draft = (await ipcMain.handlers.get('scheduledTasks:draft')({}, { message: '每天 8 点检查网页' })).draft
  const task = (await ipcMain.handlers.get('scheduledTasks:create')({}, { draft })).task

  const paused = await ipcMain.handlers.get('scheduledTasks:update')({}, { id: task.id, patch: { enabled: false } })
  const resumed = await ipcMain.handlers.get('scheduledTasks:update')({}, { id: task.id, patch: { enabled: true } })

  expect(paused.task.enabled).toBe(false)
  expect(resumed.task.enabled).toBe(true)
      expect(deleteTask).toHaveBeenCalledWith(task.id, expect.any(Object))
  expect(registerTask).toHaveBeenCalledTimes(2)
})

test('scheduledTasks:delete removes task and Windows registration', async () => {
  const deleteTask = vi.fn(async () => ({ registered: false }))
  const ipcMain = createIpcMain()
  scheduledTasks.register(ipcMain, {
    now: () => new Date('2026-05-12T01:00:00+08:00'),
    windowsScheduler: { registerTask: vi.fn(async () => ({ registered: true })), deleteTask }
  })

  const draft = (await ipcMain.handlers.get('scheduledTasks:draft')({}, { message: '每天 8 点检查网页' })).draft
  const task = (await ipcMain.handlers.get('scheduledTasks:create')({}, { draft })).task

  const result = await ipcMain.handlers.get('scheduledTasks:delete')({}, { id: task.id })

  expect(result.ok).toBe(true)
  expect(store.listScheduledTasks()).toEqual([])
  expect(deleteTask).toHaveBeenCalledWith(task.id, expect.any(Object))
})
```

Append to `electron/__tests__/ipc.test.js` inside the core channel assertion array:

```javascript
'scheduledTasks:list',
'scheduledTasks:draft',
'scheduledTasks:create',
'scheduledTasks:update',
'scheduledTasks:delete',
'scheduledTasks:runNow'
```

- [ ] **Step 2: Run tests and verify missing IPC module failure**

Run:

```powershell
npm test -- electron/__tests__/scheduled-tasks-ipc.test.js electron/__tests__/ipc.test.js
```

Expected:

```text
FAIL electron/__tests__/scheduled-tasks-ipc.test.js
Cannot find module '../ipc/scheduledTasks'
```

- [ ] **Step 3: Implement task service**

Create `electron/services/scheduledTasks/taskService.js`:

```javascript
const { store } = require('../../store')
const { buildTaskName, registerTask, deleteTask, getTaskStatus } = require('./windowsTaskScheduler')
const { normalizeScheduledTask, parseScheduleText, nextRunFromSchedule } = require('./scheduleUtils')

function makeId(prefix) {
  return store.genId(prefix)
}

function titleFromPrompt(prompt) {
  return String(prompt || '定时任务').trim().slice(0, 40) || '定时任务'
}

function preauthorizationWarning() {
  return '确认后，这条定时任务后续触发将完全预授权，包括高风险操作，不再二次确认。AionUi 仍会阻止硬性禁止的操作并记录审计历史。'
}

function createTaskService(deps = {}) {
  const now = deps.now || (() => new Date())
  const windowsScheduler = deps.windowsScheduler || { registerTask, deleteTask, getTaskStatus }

  function listTasks() {
    return store.listScheduledTasks()
  }

  function findTask(id) {
    return listTasks().find((task) => task.id === id) || null
  }

  function draftTask(message) {
    const prompt = String(message || '').trim()
    if (!prompt) return { ok: false, error: { code: 'BAD_REQUEST', message: '需要提供定时任务描述。' } }
    const schedule = parseScheduleText(prompt, now())
    if (!schedule) {
      return {
        ok: false,
        error: {
          code: 'SCHEDULE_PARSE_FAILED',
          message: '没有识别到明确的执行频率。请使用“每天 8 点”“每周一 9:30”“每月 1 号 8 点”或“每隔 15 分钟”。'
        }
      }
    }
    return {
      ok: true,
      draft: {
        name: titleFromPrompt(prompt),
        prompt,
        schedule,
        nextRunAt: nextRunFromSchedule(schedule, now()),
        preauthorizationWarning: preauthorizationWarning()
      }
    }
  }

  async function createTask(draft) {
    const id = makeId('sch-')
    const conversationId = makeId('conv_')
    const timestamp = now().toISOString()
    const task = normalizeScheduledTask({
      id,
      name: titleFromPrompt(draft.name || draft.prompt),
      prompt: draft.prompt,
      schedule: draft.schedule,
      conversationId,
      createdAt: timestamp,
      updatedAt: timestamp,
      authorization: {
        confirmedAt: timestamp,
        confirmedBy: 'local-user',
        summary: preauthorizationWarning()
      }
    }, now())

    task.systemTaskName = buildTaskName(task.id)
    const registration = await windowsScheduler.registerTask(task, { executablePath: deps.executablePath || process.execPath })
    task.windows = {
      registered: Boolean(registration.registered),
      taskName: registration.taskName || task.systemTaskName,
      lastCheckedAt: timestamp,
      lastError: ''
    }

    store.upsertScheduledTask(task)
    store.upsertConversation({
      id: conversationId,
      title: `定时任务 · ${task.name}`,
      assistant: 'scheduled-task',
      messages: [
        { role: 'user', content: task.prompt },
        { role: 'assistant', content: `定时任务已创建：${task.schedule.human}\n${preauthorizationWarning()}` }
      ]
    })

    return task
  }

  async function updateTask(id, patch = {}) {
    const current = findTask(id)
    if (!current) return null
    const next = normalizeScheduledTask({
      ...current,
      ...patch,
      updatedAt: now().toISOString(),
      nextRunAt: patch.schedule ? nextRunFromSchedule(patch.schedule, now()) : current.nextRunAt
    }, now())
    if (patch.enabled === false) await windowsScheduler.deleteTask(id, { executablePath: deps.executablePath || process.execPath })
    if (patch.enabled === true) {
      const registration = await windowsScheduler.registerTask(next, { executablePath: deps.executablePath || process.execPath })
      next.windows = { registered: true, taskName: registration.taskName || buildTaskName(id), lastCheckedAt: now().toISOString(), lastError: '' }
    }
    store.upsertScheduledTask(next)
    return next
  }

  async function removeTask(id) {
    await windowsScheduler.deleteTask(id, { executablePath: deps.executablePath || process.execPath })
    store.removeScheduledTask(id)
  }

  async function statusTask(id) {
    return windowsScheduler.getTaskStatus(id, { executablePath: deps.executablePath || process.execPath })
  }

  return { listTasks, findTask, draftTask, createTask, updateTask, removeTask, statusTask }
}

module.exports = { createTaskService, preauthorizationWarning, titleFromPrompt }
```

- [ ] **Step 4: Implement IPC module and registration**

Create `electron/ipc/scheduledTasks.js`:

```javascript
const { createTaskService } = require('../services/scheduledTasks/taskService')

function createRegister(overrides = {}) {
  const service = overrides.service || createTaskService(overrides)
  return function register(ipcMain) {
    ipcMain.handle('scheduledTasks:list', async () => ({ ok: true, tasks: service.listTasks() }))
    ipcMain.handle('scheduledTasks:draft', async (_event, payload = {}) => service.draftTask(payload.message))
    ipcMain.handle('scheduledTasks:create', async (_event, payload = {}) => {
      if (!payload.draft) return { ok: false, error: { code: 'BAD_REQUEST', message: '需要提供定时任务草案。' } }
      try {
        const task = await service.createTask(payload.draft)
        return { ok: true, task }
      } catch (error) {
        return { ok: false, error: { code: error.code || 'SCHEDULE_CREATE_FAILED', message: error.message } }
      }
    })
    ipcMain.handle('scheduledTasks:update', async (_event, payload = {}) => {
      const task = await service.updateTask(payload.id, payload.patch || {})
      if (!task) return { ok: false, error: { code: 'NOT_FOUND', message: '定时任务不存在。' } }
      return { ok: true, task }
    })
    ipcMain.handle('scheduledTasks:delete', async (_event, payload = {}) => {
      await service.removeTask(payload.id)
      return { ok: true }
    })
    ipcMain.handle('scheduledTasks:status', async (_event, payload = {}) => ({ ok: true, status: await service.statusTask(payload.id) }))
    ipcMain.handle('scheduledTasks:runNow', async () => ({ ok: false, error: { code: 'NOT_READY', message: '手动运行将在 scheduler 接入后启用。' } }))
  }
}

const register = createRegister()

module.exports = { createRegister, register }
```

The default exported `register` must also accept dependency overrides from tests and from `registerAll`. Implement it as:

```javascript
function register(ipcMain, overrides = {}) {
  return createRegister(overrides)(ipcMain)
}

module.exports = { createRegister, register }
```

Modify `electron/ipc/index.js`:

```javascript
const scheduledTasks = require('./scheduledTasks')
```

and add it to `MODULES`:

```javascript
const MODULES = [config, conversations, artifacts, files, dialog, chat, skills, rules, runtime, audit, outputs, openExternal, setupStatus, agent, bridgeStatus, scheduledTasks]
```

- [ ] **Step 5: Run tests and verify they pass**

Run:

```powershell
npm test -- electron/__tests__/scheduled-tasks-ipc.test.js electron/__tests__/ipc.test.js
```

Expected:

```text
PASS electron/__tests__/scheduled-tasks-ipc.test.js
PASS electron/__tests__/ipc.test.js
```

- [ ] **Step 6: Commit**

```powershell
git add electron/services/scheduledTasks/taskService.js electron/ipc/scheduledTasks.js electron/ipc/index.js electron/__tests__/scheduled-tasks-ipc.test.js electron/__tests__/ipc.test.js
git commit -m "feat: add scheduled task IPC"
```

---

### Task 4: Agent Loop Preauthorization And Scheduled Runner

**Files:**
- Create: `electron/services/scheduledTasks/scheduler.js`
- Modify: `electron/services/agentLoop.js`
- Modify: `electron/ipc/scheduledTasks.js`
- Modify: `electron/__tests__/agent-loop.test.js`
- Create: `electron/__tests__/scheduled-task-runner.test.js`

- [ ] **Step 1: Add failing test for preauthorized high-risk tools**

Append to `electron/__tests__/agent-loop.test.js`:

```javascript
test('preauthorized scheduled run executes approval-required tools without prompting', async () => {
  const deepseek = mockDeepseek([
    {
      content: null,
      assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'run_shell_command', arguments: '{"command":"npm install left-pad"}' } }] },
      tool_calls: [{ id: 'c1', name: 'run_shell_command', args: { command: 'npm install left-pad' }, raw: {} }]
    },
    { content: 'Installed.', assistant_message: { role: 'assistant', content: 'Installed.' }, tool_calls: [] }
  ])
  const tools = mockTools({ run_shell_command: 'installed' })
  const policy = mockPolicy({ run_shell_command: { risk: 'high', reason: 'install', allowed: true, requiresApproval: true } })
  const requestApproval = vi.fn(async () => false)

  const result = await runTurn(
    {
      messages: [{ role: 'user', content: 'install package' }],
      preauthorized: true,
      requestApproval
    },
    { deepseek, tools, policy }
  )

  expect(requestApproval).not.toHaveBeenCalled()
  expect(tools.execute).toHaveBeenCalledWith('run_shell_command', { command: 'npm install left-pad' }, expect.objectContaining({ skipInternalConfirm: true }))
  expect(result.finalText).toBe('Installed.')
})
```

- [ ] **Step 2: Add failing scheduler runner tests**

Create `electron/__tests__/scheduled-task-runner.test.js`:

```javascript
import { expect, test, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { createScheduler } = require('../services/scheduledTasks/scheduler')

function makeStore(task) {
  const conversations = new Map()
  return {
    listScheduledTasks: vi.fn(() => [task]),
    upsertScheduledTask: vi.fn((next) => Object.assign(task, next)),
    appendTaskHistory: vi.fn((taskId, entry) => {
      task.history = [entry, ...(task.history || [])]
      task.lastRun = entry.runAt
    }),
    getConversation: vi.fn((id) => conversations.get(id) || { id, title: 'Task', messages: [] }),
    upsertConversation: vi.fn((conversation) => {
      conversations.set(conversation.id, conversation)
      return conversation
    })
  }
}

test('scheduler runNow appends progress to task conversation and records success', async () => {
  const task = {
    id: 'sch-runner',
    name: 'Runner',
    prompt: 'run scheduled work',
    enabled: true,
    preauthorized: true,
    conversationId: 'conv-runner',
    schedule: { kind: 'daily', hour: 8, minute: 0, timezone: 'Asia/Shanghai', human: '每天 08:00' },
    history: []
  }
  const store = makeStore(task)
  const runTurn = vi.fn(async ({ preauthorized, messages, onStreamEvent }) => {
    expect(preauthorized).toBe(true)
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'run scheduled work' })
    onStreamEvent({ type: 'tool_progress', summary: 'working', tool: 'browser_task' })
    return { finalText: 'done', history: [] }
  })

  const scheduler = createScheduler({ store, runTurn, now: () => new Date('2026-05-12T00:00:00.000Z') })
  const result = await scheduler.runNow('sch-runner', 'manual')

  expect(result.ok).toBe(true)
  expect(store.appendTaskHistory).toHaveBeenCalledWith('sch-runner', expect.objectContaining({ status: 'success', trigger: 'manual' }))
  expect(store.upsertConversation).toHaveBeenCalledWith(expect.objectContaining({
    id: 'conv-runner',
    messages: expect.arrayContaining([
      expect.objectContaining({ role: 'assistant', content: expect.stringContaining('Scheduled run started') }),
      expect.objectContaining({ role: 'assistant', content: expect.stringContaining('done') })
    ])
  }))
})

test('scheduler skips overlapping runs for same task', async () => {
  const task = {
    id: 'sch-overlap',
    name: 'Overlap',
    prompt: 'run',
    enabled: true,
    preauthorized: true,
    conversationId: 'conv-overlap',
    schedule: { kind: 'daily', hour: 8, minute: 0, timezone: 'Asia/Shanghai', human: '每天 08:00' },
    history: []
  }
  const store = makeStore(task)
  let release
  const runTurn = vi.fn(() => new Promise((resolve) => { release = () => resolve({ finalText: 'done', history: [] }) }))
  const scheduler = createScheduler({ store, runTurn, now: () => new Date('2026-05-12T00:00:00.000Z') })

  const first = scheduler.runNow('sch-overlap', 'manual')
  const second = await scheduler.runNow('sch-overlap', 'manual')
  release()
  await first

  expect(second).toEqual({ ok: false, skipped: true, reason: 'already-running' })
  expect(runTurn).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 3: Run tests and verify failures**

Run:

```powershell
npm test -- electron/__tests__/agent-loop.test.js electron/__tests__/scheduled-task-runner.test.js
```

Expected:

```text
FAIL electron/__tests__/agent-loop.test.js
expected "spy" to not be called
FAIL electron/__tests__/scheduled-task-runner.test.js
Cannot find module '../services/scheduledTasks/scheduler'
```

- [ ] **Step 4: Modify Agent Loop to support preauthorization**

In `electron/services/agentLoop.js`, change the `runTurn` signature from:

```javascript
async function runTurn({ messages, model, signal, onEvent, onStreamEvent, requestApproval, forceTool, forcedSkill, convId, waitForDesktopUser }, deps = {}) {
```

to:

```javascript
async function runTurn({ messages, model, signal, onEvent, onStreamEvent, requestApproval, forceTool, forcedSkill, convId, waitForDesktopUser, preauthorized = false }, deps = {}) {
```

Inside `processToolCall`, replace:

```javascript
if (decision.requiresApproval) {
```

with:

```javascript
if (decision.requiresApproval && preauthorized) {
  emitStream('approval_resolved', {
    tool: call.name,
    status: 'preauthorized',
    summary: `Scheduled task preauthorization allowed ${call.name}.`
  })
} else if (decision.requiresApproval) {
```

Do not change the earlier `decision.risk === 'blocked'` branch. Blocked tools must remain blocked.

- [ ] **Step 5: Implement scheduled task runner**

Create `electron/services/scheduledTasks/scheduler.js`:

```javascript
const { store: defaultStore } = require('../../store')
const { runTurn: defaultRunTurn } = require('../agentLoop')
const { nextRunFromSchedule, makeTaskHistoryEntry } = require('./scheduleUtils')

function appendConversationMessage(store, conversationId, message) {
  const existing = store.getConversation(conversationId) || { id: conversationId, title: 'Scheduled task', assistant: 'scheduled-task', messages: [] }
  const messages = [...(existing.messages || []), message]
  return store.upsertConversation({ ...existing, messages })
}

function createScheduler(deps = {}) {
  const store = deps.store || defaultStore
  const runTurn = deps.runTurn || defaultRunTurn
  const now = deps.now || (() => new Date())
  const timers = new Map()
  const running = new Set()
  let openConversation = deps.openConversation || (() => {})

  function listEnabledTasks() {
    return store.listScheduledTasks().filter((task) => task.enabled !== false)
  }

  function clearTimer(taskId) {
    const timer = timers.get(taskId)
    if (timer) clearTimeout(timer)
    timers.delete(taskId)
  }

  function scheduleTask(task) {
    clearTimer(task.id)
    if (!task.enabled || !task.nextRunAt) return
    const delay = Math.max(0, new Date(task.nextRunAt).getTime() - now().getTime())
    const timer = setTimeout(() => {
      runNow(task.id, 'in-app').catch(() => {})
    }, Math.min(delay, 2 ** 31 - 1))
    timer.unref?.()
    timers.set(task.id, timer)
  }

  function init(options = {}) {
    if (options.openConversation) openConversation = options.openConversation
    for (const task of listEnabledTasks()) scheduleTask(task)
  }

  async function runNow(taskId, trigger = 'manual') {
    const task = store.listScheduledTasks().find((item) => item.id === taskId)
    if (!task) return { ok: false, error: { code: 'NOT_FOUND', message: 'Scheduled task not found.' } }
    if (running.has(taskId)) return { ok: false, skipped: true, reason: 'already-running' }

    running.add(taskId)
    const runAt = now().toISOString()
    openConversation(task.conversationId)
    appendConversationMessage(store, task.conversationId, {
      role: 'assistant',
      content: `Scheduled run started: ${task.name}\nTrigger: ${trigger}\nPreauthorized: full trust`
    })

    const toolCalls = []
    try {
      const result = await runTurn({
        convId: task.conversationId,
        preauthorized: true,
        messages: [{ role: 'user', content: task.prompt }],
        onStreamEvent: (event) => {
          if (event.tool) toolCalls.push({ name: event.tool, type: event.type, summary: event.summary || event.text || '' })
          const summary = event.summary || event.text
          if (summary) appendConversationMessage(store, task.conversationId, { role: 'assistant', content: summary })
        }
      })

      appendConversationMessage(store, task.conversationId, { role: 'assistant', content: result.finalText || 'Scheduled run completed.' })
      const entry = makeTaskHistoryEntry({
        taskId,
        trigger,
        status: 'success',
        summary: result.finalText || 'Scheduled run completed.',
        toolCalls,
        runAt,
        completedAt: now().toISOString()
      })
      store.appendTaskHistory(taskId, entry)
      const next = { ...task, lastStatus: 'success', lastRun: runAt, nextRunAt: nextRunFromSchedule(task.schedule, now()) }
      store.upsertScheduledTask(next)
      scheduleTask(next)
      return { ok: true, task: next, entry }
    } catch (error) {
      const entry = makeTaskHistoryEntry({
        taskId,
        trigger,
        status: 'error',
        summary: 'Scheduled run failed.',
        error: error.message,
        toolCalls,
        runAt,
        completedAt: now().toISOString()
      })
      appendConversationMessage(store, task.conversationId, { role: 'assistant', content: `Scheduled run failed: ${error.message}` })
      store.appendTaskHistory(taskId, entry)
      const next = { ...task, lastStatus: 'error', lastRun: runAt, nextRunAt: nextRunFromSchedule(task.schedule, now()) }
      store.upsertScheduledTask(next)
      scheduleTask(next)
      return { ok: false, error: { code: 'RUN_FAILED', message: error.message }, entry }
    } finally {
      running.delete(taskId)
    }
  }

  function stop() {
    for (const taskId of timers.keys()) clearTimer(taskId)
  }

  return { init, stop, scheduleTask, clearTimer, runNow }
}

module.exports = { createScheduler, appendConversationMessage }
```

- [ ] **Step 6: Wire `runNow` IPC to scheduler**

Modify `electron/ipc/scheduledTasks.js` so `createRegister` accepts `scheduler`:

```javascript
function createRegister(overrides = {}) {
  const service = overrides.service || createTaskService(overrides)
  const scheduler = overrides.scheduler
```

Replace the `scheduledTasks:runNow` handler with:

```javascript
ipcMain.handle('scheduledTasks:runNow', async (_event, payload = {}) => {
  if (!scheduler?.runNow) return { ok: false, error: { code: 'SCHEDULER_UNAVAILABLE', message: '定时任务调度器尚未初始化。' } }
  return scheduler.runNow(payload.id, 'manual')
})
```

- [ ] **Step 7: Run tests and verify they pass**

Run:

```powershell
npm test -- electron/__tests__/agent-loop.test.js electron/__tests__/scheduled-task-runner.test.js
```

Expected:

```text
PASS electron/__tests__/agent-loop.test.js
PASS electron/__tests__/scheduled-task-runner.test.js
```

- [ ] **Step 8: Commit**

```powershell
git add electron/services/agentLoop.js electron/services/scheduledTasks/scheduler.js electron/ipc/scheduledTasks.js electron/__tests__/agent-loop.test.js electron/__tests__/scheduled-task-runner.test.js
git commit -m "feat: run preauthorized scheduled tasks"
```

---

### Task 5: Main Process Startup And Conversation Opening

**Files:**
- Create: `electron/services/scheduledTasks/startup.js`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Create: `electron/__tests__/scheduled-task-startup.test.js`

- [ ] **Step 1: Write startup helper tests**

Create `electron/__tests__/scheduled-task-startup.test.js`:

```javascript
import { expect, test } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { parseScheduledTaskArg, createConversationOpener } = require('../services/scheduledTasks/startup')

test('parseScheduledTaskArg extracts task id after flag', () => {
  expect(parseScheduledTaskArg(['electron', '.', '--run-scheduled-task', 'sch-123'])).toBe('sch-123')
  expect(parseScheduledTaskArg(['electron', '.'])).toBe('')
})

test('createConversationOpener sends event only when window is ready', () => {
  const sent = []
  const win = {
    isDestroyed: () => false,
    webContents: { send: (channel, payload) => sent.push({ channel, payload }) },
    show: () => sent.push({ channel: 'show' }),
    focus: () => sent.push({ channel: 'focus' })
  }
  const open = createConversationOpener(() => win)

  open('conv-task')

  expect(sent).toEqual([
    { channel: 'show' },
    { channel: 'focus' },
    { channel: 'app:open-conversation', payload: { conversationId: 'conv-task' } }
  ])
})
```

- [ ] **Step 2: Run test and verify missing exports fail**

Run:

```powershell
npm test -- electron/__tests__/scheduled-task-startup.test.js
```

Expected:

```text
FAIL electron/__tests__/scheduled-task-startup.test.js
parseScheduledTaskArg is not a function
```

- [ ] **Step 3: Export startup helpers from main process**

Create `electron/services/scheduledTasks/startup.js`:

```javascript
function parseScheduledTaskArg(argv = process.argv) {
  const index = argv.indexOf('--run-scheduled-task')
  if (index === -1) return ''
  return String(argv[index + 1] || '')
}

function createConversationOpener(getWindow) {
  return function openConversation(conversationId) {
    const win = getWindow()
    if (!win || win.isDestroyed?.()) return
    win.show?.()
    win.focus?.()
    win.webContents?.send?.('app:open-conversation', { conversationId })
  }
}

module.exports = { parseScheduledTaskArg, createConversationOpener }
```

In `electron/main.js`, add near the top:

```javascript
const { createScheduler } = require('./services/scheduledTasks/scheduler')
const { parseScheduledTaskArg, createConversationOpener } = require('./services/scheduledTasks/startup')
```

Change:

```javascript
let supervisor = null
```

to:

```javascript
let supervisor = null
let scheduledTaskScheduler = null
```

In the `app.whenReady().then(async () => { ... })` block, after `createWindow()` add:

```javascript
scheduledTaskScheduler = createScheduler()
scheduledTaskScheduler.init({ openConversation: createConversationOpener(() => mainWindow) })
const startupTaskId = parseScheduledTaskArg()
if (startupTaskId) {
  mainWindow.webContents.once('did-finish-load', () => {
    scheduledTaskScheduler.runNow(startupTaskId, 'windows-task-scheduler').catch((error) => {
      console.error('[scheduled-tasks] startup run failed', error)
    })
  })
}
```

In `before-quit`, add:

```javascript
if (scheduledTaskScheduler) try { scheduledTaskScheduler.stop() } catch {}
```

- [ ] **Step 4: Expose renderer listener**

Modify `electron/preload.js` in `createElectronAPI` to add:

```javascript
onOpenConversation: (handler) => {
  const wrapped = (_event, payload) => handler(payload)
  ipc.on('app:open-conversation', wrapped)
  return () => ipc.removeListener('app:open-conversation', wrapped)
},
scheduledTasks: {
  list: () => ipc.invoke('scheduledTasks:list'),
  draft: (payload) => ipc.invoke('scheduledTasks:draft', payload),
  create: (payload) => ipc.invoke('scheduledTasks:create', payload),
  update: (payload) => ipc.invoke('scheduledTasks:update', payload),
  delete: (payload) => ipc.invoke('scheduledTasks:delete', payload),
  runNow: (payload) => ipc.invoke('scheduledTasks:runNow', payload),
  status: (payload) => ipc.invoke('scheduledTasks:status', payload)
},
```

- [ ] **Step 5: Run tests and verify they pass**

Run:

```powershell
npm test -- electron/__tests__/scheduled-task-startup.test.js electron/__tests__/preload.test.js
```

Expected:

```text
PASS electron/__tests__/scheduled-task-startup.test.js
PASS electron/__tests__/preload.test.js
```

If `preload.test.js` has static expectations, add assertions that the source contains `onOpenConversation` and `scheduledTasks`.

- [ ] **Step 6: Commit**

```powershell
git add electron/main.js electron/preload.js electron/services/scheduledTasks/startup.js electron/__tests__/scheduled-task-startup.test.js electron/__tests__/preload.test.js
git commit -m "feat: launch scheduled tasks from startup"
```

---

### Task 6: Renderer API And Chat Creation Flow

**Files:**
- Modify: `client/src/lib/api.js`
- Modify: `client/src/lib/api.test.js`
- Modify: `client/src/components/chat/InputBar.jsx`
- Modify: `client/src/components/chat/ModelSelector.jsx`
- Modify: `client/src/components/chat/ChatArea.jsx`
- Modify: `client/src/hooks/useChat.js`
- Modify: `client/src/components/chat/MessageBubble.jsx`
- Modify: `client/src/components/chat/unified-chat-ui.test.js`

- [ ] **Step 1: Add failing renderer static/API tests**

Append to `client/src/lib/api.test.js`:

```javascript
test('scheduled task API wrappers invoke expected IPC channels', async () => {
  const calls = []
  window.electronAPI = {
    invoke: async (channel, payload) => {
      calls.push({ channel, payload })
      return { ok: true }
    }
  }

  const api = await import('./api.js')
  await api.draftScheduledTask('每天 8 点检查网页')
  await api.createScheduledTask({ prompt: '每天 8 点检查网页' })
  await api.listScheduledTasks()
  await api.updateScheduledTask('sch-1', { enabled: false })
  await api.deleteScheduledTask('sch-1')
  await api.runScheduledTaskNow('sch-1')

  expect(calls).toEqual([
    { channel: 'scheduledTasks:draft', payload: { message: '每天 8 点检查网页' } },
    { channel: 'scheduledTasks:create', payload: { draft: { prompt: '每天 8 点检查网页' } } },
    { channel: 'scheduledTasks:list', payload: undefined },
    { channel: 'scheduledTasks:update', payload: { id: 'sch-1', patch: { enabled: false } } },
    { channel: 'scheduledTasks:delete', payload: { id: 'sch-1' } },
    { channel: 'scheduledTasks:runNow', payload: { id: 'sch-1' } }
  ])
})
```

Append to `client/src/components/chat/unified-chat-ui.test.js`:

```javascript
test('scheduled task plugin is a launcher and not an embedded task list', () => {
  const input = readProjectFile('client/src/components/chat/InputBar.jsx')
  const chatArea = readProjectFile('client/src/components/chat/ChatArea.jsx')
  const modelSelector = readProjectFile('client/src/components/chat/ModelSelector.jsx')
  const hook = readProjectFile('client/src/hooks/useChat.js')
  const bubble = readProjectFile('client/src/components/chat/MessageBubble.jsx')

  expect(input).toContain("mode: 'schedule'")
  expect(input).toContain('定时任务')
  expect(input).not.toContain('scheduledTasks.map')
  expect(chatArea).toContain("pluginMode === 'schedule'")
  expect(modelSelector).toContain('SCHEDULE_OPTION')
  expect(hook).toContain('createScheduledTaskDraft')
  expect(hook).toContain('pendingScheduleDraft')
  expect(bubble).toContain('schedule_draft_confirmation')
})
```

- [ ] **Step 2: Run tests and verify failures**

Run:

```powershell
npm test -- client/src/lib/api.test.js client/src/components/chat/unified-chat-ui.test.js
```

Expected:

```text
FAIL client/src/lib/api.test.js
expected scheduledTasks:draft call
FAIL client/src/components/chat/unified-chat-ui.test.js
expected source to contain "mode: 'schedule'"
```

- [ ] **Step 3: Add scheduled task API wrappers**

In `client/src/lib/api.js`, add:

```javascript
export function listScheduledTasks() { return invoke('scheduledTasks:list') }
export function draftScheduledTask(message) { return invoke('scheduledTasks:draft', { message }) }
export function createScheduledTask(draft) { return invoke('scheduledTasks:create', { draft }) }
export function updateScheduledTask(id, patch) { return invoke('scheduledTasks:update', { id, patch }) }
export function deleteScheduledTask(id) { return invoke('scheduledTasks:delete', { id }) }
export function runScheduledTaskNow(id) { return invoke('scheduledTasks:runNow', { id }) }
export function getScheduledTaskStatus(id) { return invoke('scheduledTasks:status', { id }) }
```

- [ ] **Step 4: Add schedule plugin item and mode chip**

In `client/src/components/chat/InputBar.jsx`, add `CalendarClock` to the lucide import:

```javascript
import { CalendarClock, Check, ChevronRight, Grid2X2, Globe2, Monitor, Paperclip, Plus, Send, Sparkles, Square } from 'lucide-react'
```

In `PLUGIN_ITEMS`, add this item next to Browser and Computer Use:

```javascript
{ name: '定时任务', description: 'Schedule · full trust after confirmation', mode: 'schedule' },
```

In the plugin icon branch, replace the nested conditional with:

```jsx
{plugin.mode === 'browser'
  ? <Globe2 size={16} className="text-[color:var(--accent)]" />
  : plugin.mode === 'desktop'
    ? <Monitor size={16} className="text-[color:var(--accent)]" />
    : plugin.mode === 'schedule'
      ? <CalendarClock size={16} className="text-[color:var(--accent)]" />
      : <Sparkles size={16} className="text-[color:var(--text-muted)]" />}
```

Update the textarea placeholder:

```jsx
placeholder={pluginMode === 'schedule' ? '描述定时任务，例如：每天 8 点打开网页检查更新' : '输入消息或任务，Enter 发送，Shift+Enter 换行'}
```

In `client/src/components/chat/ModelSelector.jsx`, add:

```javascript
const SCHEDULE_OPTION = {
  id: 'scheduled-task',
  label: '定时任务',
  provider: 'scheduled-task',
  model: 'Full trust'
}
```

Change selected option logic:

```javascript
const selected = pluginMode === 'browser'
  ? BROWSER_USE_OPTION
  : pluginMode === 'desktop'
    ? DESKTOP_USE_OPTION
    : pluginMode === 'schedule'
      ? SCHEDULE_OPTION
      : MODEL_OPTIONS.find(o => o.id === value) || MODEL_OPTIONS[0]
const pluginActive = pluginMode === 'browser' || pluginMode === 'desktop' || pluginMode === 'schedule'
```

- [ ] **Step 5: Add schedule creation flow to chat hook**

In `client/src/hooks/useChat.js`, update imports:

```javascript
import { abortChat, api, cancelAction, createScheduledTask, draftScheduledTask } from '../lib/api.js'
```

Add reducer cases:

```javascript
case 'ADD_SCHEDULE_DRAFT':
  return { ...state, messages: [...state.messages, action.msg] }
case 'UPDATE_SCHEDULE_DRAFT':
  return {
    ...state,
    messages: state.messages.map((message) => (
      message.type === 'schedule_draft_confirmation' && message.scheduleDraftId === action.scheduleDraftId
        ? { ...message, scheduleDraftStatus: action.status }
        : message
    ))
  }
```

Add state:

```javascript
const [pendingScheduleDraft, setPendingScheduleDraft] = useState(null)
```

Add helper:

```javascript
function formatScheduleDraftContent(draft) {
  return [
    `定时任务草案：${draft.name}`,
    `频率：${draft.schedule?.human || '未识别'}`,
    `下次运行：${draft.nextRunAt || '未知'}`,
    '',
    draft.preauthorizationWarning
  ].join('\n')
}
```

Add function inside `useChat`:

```javascript
const createScheduledTaskDraft = useCallback(async (text) => {
  const convId = conversationIdRef.current
  if (!convId) return
  const userMessage = { id: uid(), role: 'user', content: text }
  dispatch({ type: 'ADD', msg: userMessage })
  try {
    const result = await draftScheduledTask(text)
    if (!result.ok) {
      dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', content: result.error?.message || '无法创建定时任务草案。' } })
      return
    }
    const scheduleDraftId = uid()
    setPendingScheduleDraft({ id: scheduleDraftId, draft: result.draft })
    dispatch({
      type: 'ADD_SCHEDULE_DRAFT',
      msg: {
        id: `schedule-draft-${scheduleDraftId}`,
        role: 'assistant',
        type: 'schedule_draft_confirmation',
        scheduleDraftId,
        scheduleDraft: result.draft,
        scheduleDraftStatus: 'pending',
        content: formatScheduleDraftContent(result.draft)
      }
    })
  } catch (error) {
    dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', content: `[定时任务错误] ${error.message}` } })
  }
}, [])
```

Add confirmation handler:

```javascript
const respondToScheduleDraft = useCallback(async (approved) => {
  const pending = pendingScheduleDraft
  if (!pending) return
  dispatch({ type: 'UPDATE_SCHEDULE_DRAFT', scheduleDraftId: pending.id, status: approved ? 'confirmed' : 'rejected' })
  if (!approved) {
    setPendingScheduleDraft(null)
    dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', content: '已取消创建定时任务。' } })
    return
  }
  try {
    const result = await createScheduledTask(pending.draft)
    setPendingScheduleDraft(null)
    if (!result.ok) {
      dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', content: result.error?.message || '定时任务保存失败。' } })
      return
    }
    window.dispatchEvent(new CustomEvent('aionui:scheduled-tasks-changed'))
    window.dispatchEvent(new CustomEvent('agentdev:conversations-changed'))
    dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', content: `定时任务已创建：${result.task.name}\n专属聊天：${result.task.conversationId}` } })
  } catch (error) {
    dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', content: `[定时任务保存失败] ${error.message}` } })
  }
}, [pendingScheduleDraft])
```

Return both functions:

```javascript
return { ...state, agentRunning, pendingConfirmation, pendingDesktopAsk, pendingScheduleDraft, sendUserMessage, createScheduledTaskDraft, respondToScheduleDraft, respondToConfirmation, handleAbort, sendCommand, addCard, updateCard, addFileCard, clear }
```

- [ ] **Step 6: Route schedule mode in ChatArea and render confirmation buttons**

In `client/src/components/chat/ChatArea.jsx`, destructure:

```javascript
const { messages, streaming, agentRunning, pendingConfirmation, pendingScheduleDraft, sendUserMessage, createScheduledTaskDraft, respondToScheduleDraft, respondToConfirmation, handleAbort, updateCard, addFileCard } = useChat(conversationId)
```

In `handleSend`, add before normal parsing:

```javascript
if (pluginMode === 'schedule') {
  createScheduledTaskDraft(text)
  setPluginMode(null)
  return
}
```

Pass schedule confirmation handler:

```jsx
<MessageList
  messages={messages}
  onRespondConfirmation={respondToConfirmation}
  onRespondScheduleDraft={respondToScheduleDraft}
  onUpdateCard={updateCard}
  onFileGenerated={addFileCard}
/>
```

In `client/src/components/chat/MessageList.jsx`, accept and pass `onRespondScheduleDraft`:

```javascript
export default function MessageList({ messages, onRespondConfirmation, onRespondScheduleDraft }) {
```

and:

```jsx
return <MessageBubble key={message.id} message={message} role={message.role} content={message.content} streaming={message.streaming} onRespondConfirmation={onRespondConfirmation} onRespondScheduleDraft={onRespondScheduleDraft} />
```

In `client/src/components/chat/MessageBubble.jsx`, add before the normal bubble branch:

```jsx
if (message?.type === 'schedule_draft_confirmation') {
  const disabled = message.scheduleDraftStatus !== 'pending'
  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[75%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap break-words bg-[color:var(--bg-secondary)] text-[color:var(--text-primary)] rounded-bl-sm border border-[color:var(--border)]">
        <div>{content}</div>
        <div className="mt-3 flex gap-3">
          <button type="button" disabled={disabled} onClick={() => onRespondScheduleDraft?.(true)} className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent)] px-3 py-1 text-xs disabled:opacity-60">
            确认创建
          </button>
          <button type="button" disabled={disabled} onClick={() => onRespondScheduleDraft?.(false)} className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] px-3 py-1 text-xs disabled:opacity-60">
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Run renderer tests and verify pass**

Run:

```powershell
npm test -- client/src/lib/api.test.js client/src/components/chat/unified-chat-ui.test.js
```

Expected:

```text
PASS client/src/lib/api.test.js
PASS client/src/components/chat/unified-chat-ui.test.js
```

- [ ] **Step 8: Commit**

```powershell
git add client/src/lib/api.js client/src/lib/api.test.js client/src/components/chat/InputBar.jsx client/src/components/chat/ModelSelector.jsx client/src/components/chat/ChatArea.jsx client/src/components/chat/MessageList.jsx client/src/components/chat/MessageBubble.jsx client/src/hooks/useChat.js client/src/components/chat/unified-chat-ui.test.js
git commit -m "feat: add scheduled task creation flow"
```

---

### Task 7: Sidebar And Settings Management UI

**Files:**
- Create: `client/src/hooks/useScheduledTasks.js`
- Modify: `client/src/components/layout/Layout.jsx`
- Modify: `client/src/components/layout/Sidebar.jsx`
- Modify: `client/src/pages/SettingsPage.jsx`
- Modify: `client/src/components/chat/unified-chat-ui.test.js`

- [ ] **Step 1: Add static UI tests**

Append to `client/src/components/chat/unified-chat-ui.test.js`:

```javascript
test('scheduled tasks are managed from sidebar and settings, not plugin menu', () => {
  const layout = readProjectFile('client/src/components/layout/Layout.jsx')
  const sidebar = readProjectFile('client/src/components/layout/Sidebar.jsx')
  const settings = readProjectFile('client/src/pages/SettingsPage.jsx')
  const hook = readProjectFile('client/src/hooks/useScheduledTasks.js')
  const input = readProjectFile('client/src/components/chat/InputBar.jsx')

  expect(layout).toContain('useScheduledTasks')
  expect(layout).toContain('onOpenConversation')
  expect(sidebar).toContain('scheduledTasks')
  expect(sidebar).toContain('定时任务')
  expect(settings).toContain("['scheduledTasks', 'Scheduled Tasks']")
  expect(settings).toContain('runScheduledTaskNow')
  expect(settings).toContain('已预授权')
  expect(hook).toContain('listScheduledTasks')
  expect(input).not.toContain('scheduledTasks.map')
})
```

- [ ] **Step 2: Run test and verify missing hook failure**

Run:

```powershell
npm test -- client/src/components/chat/unified-chat-ui.test.js
```

Expected:

```text
FAIL client/src/components/chat/unified-chat-ui.test.js
ENOENT: no such file or directory, open 'client/src/hooks/useScheduledTasks.js'
```

- [ ] **Step 3: Create scheduled tasks hook**

Create `client/src/hooks/useScheduledTasks.js`:

```javascript
import { useCallback, useEffect, useState } from 'react'
import { deleteScheduledTask, listScheduledTasks, runScheduledTaskNow, updateScheduledTask } from '../lib/api.js'

export function useScheduledTasks() {
  const [scheduledTasks, setScheduledTasks] = useState([])
  const [loading, setLoading] = useState(false)

  const refreshScheduledTasks = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listScheduledTasks()
      setScheduledTasks(result.tasks || [])
    } catch (error) {
      console.error('[useScheduledTasks] load failed:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const setEnabled = useCallback(async (id, enabled) => {
    const result = await updateScheduledTask(id, { enabled })
    setScheduledTasks(current => current.map(task => task.id === id ? result.task : task))
  }, [])

  const removeScheduledTask = useCallback(async (id) => {
    await deleteScheduledTask(id)
    setScheduledTasks(current => current.filter(task => task.id !== id))
  }, [])

  const runNow = useCallback(async (id) => {
    const result = await runScheduledTaskNow(id)
    await refreshScheduledTasks()
    return result
  }, [refreshScheduledTasks])

  useEffect(() => { refreshScheduledTasks() }, [refreshScheduledTasks])

  useEffect(() => {
    const handler = () => refreshScheduledTasks()
    window.addEventListener('aionui:scheduled-tasks-changed', handler)
    return () => window.removeEventListener('aionui:scheduled-tasks-changed', handler)
  }, [refreshScheduledTasks])

  return { scheduledTasks, loading, refreshScheduledTasks, setEnabled, removeScheduledTask, runNow }
}
```

- [ ] **Step 4: Wire Layout event and pass tasks to Sidebar**

In `client/src/components/layout/Layout.jsx`, add import:

```javascript
import { useScheduledTasks } from '../../hooks/useScheduledTasks.js'
```

Inside `Layout`, add:

```javascript
const { scheduledTasks, refreshScheduledTasks, setEnabled, removeScheduledTask, runNow } = useScheduledTasks()
```

Add event listener:

```javascript
useEffect(() => {
  const unsubscribe = window.electronAPI?.onOpenConversation?.((payload) => {
    if (payload?.conversationId) handleSelectConversation(payload.conversationId)
  })
  return () => unsubscribe?.()
}, [handleSelectConversation])
```

The file currently imports `useCallback` and `useState`; update it:

```javascript
import { useCallback, useEffect, useState } from 'react'
```

Pass props to `Sidebar`:

```jsx
scheduledTasks={scheduledTasks}
onSelectScheduledTask={(task) => handleSelectConversation(task.conversationId)}
onToggleScheduledTask={setEnabled}
onDeleteScheduledTask={removeScheduledTask}
onRunScheduledTask={runNow}
onOpenScheduledTaskSettings={() => openSettings('scheduledTasks')}
```

- [ ] **Step 5: Add compact scheduled-task section to Sidebar**

In `client/src/components/layout/Sidebar.jsx`, add `CalendarClock, Play, PauseCircle` to the lucide import:

```javascript
import { CalendarClock, Check, ChevronLeft, ChevronRight, MoreHorizontal, PauseCircle, Pencil, Play, Plus, Search, Settings, Trash2, X } from 'lucide-react'
```

Add props:

```javascript
scheduledTasks = [],
onSelectScheduledTask,
onToggleScheduledTask,
onDeleteScheduledTask,
onRunScheduledTask,
onOpenScheduledTaskSettings
```

above the conversation list, after the empty-state block, add:

```jsx
{!collapsed && scheduledTasks.length > 0 && (
  <div className="mb-3 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] p-2">
    <div className="mb-2 flex items-center justify-between gap-2 px-1 text-xs font-medium text-[color:var(--text-muted)]">
      <span className="inline-flex items-center gap-1"><CalendarClock size={13} />定时任务</span>
      <button type="button" onClick={onOpenScheduledTaskSettings} className="rounded px-1 py-0.5 hover:bg-[color:var(--bg-tertiary)]">管理</button>
    </div>
    <div className="space-y-1">
      {scheduledTasks.slice(0, 5).map((task) => (
        <div key={task.id} className="group rounded-md hover:bg-[color:var(--bg-tertiary)]">
          <button type="button" onClick={() => onSelectScheduledTask?.(task)} className="w-full px-2 py-1.5 text-left">
            <div className="truncate text-xs font-medium">{task.name}</div>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-[color:var(--text-muted)]">
              <span className="truncate">{task.schedule?.human || 'No schedule'}</span>
              <span>{task.enabled === false ? '暂停' : task.lastStatus || '启用'}</span>
            </div>
          </button>
          <div className="hidden gap-1 px-2 pb-1 group-hover:flex">
            <button type="button" onClick={() => onRunScheduledTask?.(task.id)} className="rounded p-1 hover:bg-[color:var(--bg-primary)]" title="Run now"><Play size={12} /></button>
            <button type="button" onClick={() => onToggleScheduledTask?.(task.id, task.enabled === false)} className="rounded p-1 hover:bg-[color:var(--bg-primary)]" title={task.enabled === false ? 'Enable' : 'Pause'}><PauseCircle size={12} /></button>
            <button type="button" onClick={() => onDeleteScheduledTask?.(task.id)} className="rounded p-1 text-[color:var(--error)] hover:bg-[color:var(--bg-primary)]" title="Delete"><Trash2 size={12} /></button>
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 6: Add Settings tab and management panel**

In `client/src/pages/SettingsPage.jsx`, update imports:

```javascript
import { deleteArtifact, getConfig, getRuntimeStatus, listArtifacts, listScheduledTasks, openFile, runScheduledTaskNow, setConfig, updateScheduledTask, deleteScheduledTask } from '../lib/api.js'
```

Add tab:

```javascript
['scheduledTasks', 'Scheduled Tasks'],
```

Add state:

```javascript
const [scheduledTasks, setScheduledTasks] = useState([])
```

Add loader:

```javascript
async function refreshScheduledTasks() {
  try {
    const result = await listScheduledTasks()
    setScheduledTasks(result.tasks || [])
  } catch (error) {
    setMessage(`Scheduled task refresh failed: ${error.message}`)
  }
}
```

In the initial `Promise.allSettled`, add `listScheduledTasks()` and set the result:

```javascript
const [configResult, runtimeResult, bridgeResult, artifactsResult, scheduledResult] = await Promise.allSettled([getConfig(), getRuntimeStatus(), bridgeStatus, listArtifacts(), listScheduledTasks()])
```

and:

```javascript
if (scheduledResult.status === 'fulfilled') setScheduledTasks(scheduledResult.value.tasks || [])
```

Add handlers:

```javascript
async function toggleScheduledTask(task) {
  const result = await updateScheduledTask(task.id, { enabled: task.enabled === false })
  setScheduledTasks(current => current.map(item => item.id === task.id ? result.task : item))
}

async function runScheduledTask(task) {
  setMessage('')
  const result = await runScheduledTaskNow(task.id)
  await refreshScheduledTasks()
  setMessage(result.ok ? `Started ${task.name}` : (result.error?.message || 'Run failed'))
}

async function removeScheduledTask(task) {
  await deleteScheduledTask(task.id)
  await refreshScheduledTasks()
  setMessage('Scheduled task deleted')
}
```

Add tab body:

```jsx
{tab === 'scheduledTasks' && (
  <div className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-medium">Scheduled Tasks</h3>
        <p className="text-xs text-[color:var(--text-muted)]">Plugin-created tasks with full-trust preauthorization.</p>
      </div>
      <button type="button" onClick={refreshScheduledTasks} className="h-9 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)]">Refresh</button>
    </div>
    {scheduledTasks.length === 0 && (
      <div className="rounded-md border border-dashed border-[color:var(--border)] p-6 text-center text-sm text-[color:var(--text-muted)]">
        No scheduled tasks yet. Use the plugin menu in chat to create one.
      </div>
    )}
    <div className="space-y-2">
      {scheduledTasks.map((task) => (
        <article key={task.id} className="rounded-md border border-[color:var(--border)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{task.name}</div>
              <div className="mt-1 text-xs text-[color:var(--text-muted)]">{task.schedule?.human || 'No schedule'} · next {task.nextRunAt || 'unknown'}</div>
              <div className="mt-2 inline-flex rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">已预授权</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => runScheduledTask(task)} className="h-8 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-tertiary)]">Run now</button>
              <button type="button" onClick={() => toggleScheduledTask(task)} className="h-8 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-tertiary)]">{task.enabled === false ? 'Enable' : 'Pause'}</button>
              <button type="button" onClick={() => removeScheduledTask(task)} className="h-8 rounded-md border border-[color:var(--border)] px-2 text-xs text-red-500 hover:bg-red-50">Delete</button>
            </div>
          </div>
          <div className="mt-2 text-xs text-[color:var(--text-muted)]">Last status: {task.lastStatus || 'never-run'} · Windows: {task.windows?.registered ? 'registered' : 'not registered'}</div>
        </article>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 7: Run tests and verify pass**

Run:

```powershell
npm test -- client/src/components/chat/unified-chat-ui.test.js
```

Expected:

```text
PASS client/src/components/chat/unified-chat-ui.test.js
```

- [ ] **Step 8: Commit**

```powershell
git add client/src/hooks/useScheduledTasks.js client/src/components/layout/Layout.jsx client/src/components/layout/Sidebar.jsx client/src/pages/SettingsPage.jsx client/src/components/chat/unified-chat-ui.test.js
git commit -m "feat: add scheduled task management UI"
```

---

### Task 8: Full Verification, Build, And Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/USER_MANUAL.md`
- Modify: `docs/runtime-setup.md`
- Modify: `docs/superpowers/plans/2026-05-12-scheduled-tasks-plugin-implementation.md`

- [ ] **Step 1: Add scheduled-task documentation**

Append to `README.md` under Features:

```markdown
- Scheduled Tasks plugin for natural-language task creation, full-trust confirmation, Windows Task Scheduler wake-up, and task-owned chat history.
```

Append to `docs/USER_MANUAL.md`:

```markdown
## Scheduled Tasks

Use `+ -> 插件 -> 定时任务` in the chat input, then describe the task in one message, for example `每天 8 点打开 https://example.com 检查更新`.

AionUi shows a task draft before saving. Confirming the draft fully preauthorizes future runs, including high-risk tool calls. Future scheduled runs do not ask again for confirmation, but AionUi still blocks hard-forbidden operations and records run history.

Each scheduled task owns one dedicated conversation. The sidebar `定时任务` section opens that conversation. Settings -> Scheduled Tasks provides pause, run now, delete, and status controls.

On Windows, AionUi registers tasks through Windows Task Scheduler so a due task can relaunch AionUi after the app has fully exited.
```

Append to `docs/runtime-setup.md`:

```markdown
## Windows Scheduled Tasks

Scheduled tasks use Windows Task Scheduler entries named under `\AionUi\ScheduledTasks\`. The entry launches AionUi with `--run-scheduled-task <task-id>` and stores no API keys or secrets. If registration fails, open Settings -> Scheduled Tasks and use the task status to retry or inspect the error.
```

- [ ] **Step 2: Run focused test suite**

Run:

```powershell
npm test -- electron/__tests__/scheduled-task-utils.test.js electron/__tests__/windows-task-scheduler.test.js electron/__tests__/scheduled-tasks-ipc.test.js electron/__tests__/scheduled-task-runner.test.js electron/__tests__/scheduled-task-startup.test.js electron/__tests__/agent-loop.test.js client/src/lib/api.test.js client/src/components/chat/unified-chat-ui.test.js
```

Expected:

```text
PASS electron/__tests__/scheduled-task-utils.test.js
PASS electron/__tests__/windows-task-scheduler.test.js
PASS electron/__tests__/scheduled-tasks-ipc.test.js
PASS electron/__tests__/scheduled-task-runner.test.js
PASS electron/__tests__/scheduled-task-startup.test.js
PASS electron/__tests__/agent-loop.test.js
PASS client/src/lib/api.test.js
PASS client/src/components/chat/unified-chat-ui.test.js
```

- [ ] **Step 3: Run full test suite**

Run:

```powershell
npm test
```

Expected:

```text
Test Files  all passed
Tests       all passed
```

If `npm test` fails because `better-sqlite3` needs an Electron/Node rebuild, run the repository's existing command and repeat:

```powershell
npm run rebuild:native:node
npm test
```

- [ ] **Step 4: Run renderer build**

Run:

```powershell
npm run build:client
```

Expected:

```text
vite v...
built in ...
```

- [ ] **Step 5: Optional manual smoke in Electron dev**

Run:

```powershell
npm run electron:dev
```

Smoke checklist:

- Open `+ -> 插件` and verify `定时任务` appears.
- Select `定时任务`; verify no task list appears inside the plugin menu.
- Send `每天 8 点打开 https://example.com 检查更新`.
- Confirm the draft.
- Verify sidebar shows the task under `定时任务`.
- Open Settings -> Scheduled Tasks and verify `已预授权`, Run now, Pause, and Delete controls.
- Click Run now and verify progress appears in the task-owned conversation.

- [ ] **Step 6: Commit verification docs**

```powershell
git add README.md docs/USER_MANUAL.md docs/runtime-setup.md docs/superpowers/plans/2026-05-12-scheduled-tasks-plugin-implementation.md
git commit -m "docs: document scheduled tasks plugin"
```

---

## Plan Self-Review

Spec coverage:

- Plugin menu only starts scheduled-task creation mode: Task 6 and Task 7 static tests enforce no task list inside `InputBar.jsx`.
- Natural-language creation with parsed summary: Task 1 parses schedules; Task 3 drafts and creates tasks; Task 6 renders draft confirmation.
- Full Agent Loop execution: Task 4 scheduler invokes `runTurn`.
- Full-trust preauthorization: Task 4 adds `preauthorized` bypass and tests high-risk execution without prompting.
- Windows relaunch after exit: Task 2 builds Windows Task Scheduler commands; Task 5 parses `--run-scheduled-task` and runs startup task.
- Dedicated conversation per task: Task 3 creates the conversation; Task 4 appends run progress; Task 7 opens it from sidebar.
- Sidebar and Settings management: Task 7.
- Audit/history and failure records: Task 1 defines history shape; Task 4 records success, error, and skipped overlapping runs.
- Tests and verification: Tasks 1 through 8 include focused tests, full tests, build, and manual smoke.

Placeholder scan:

- The plan does not use `TBD`, `TODO`, "fill in details", or "write tests for the above".
- Every code-changing step includes concrete code or exact replacement snippets.

Type consistency:

- IPC channel names use `scheduledTasks:*` consistently across API, IPC, tests, and preload.
- Task fields use `preauthorized`, `authorization.mode`, `conversationId`, `nextRunAt`, `lastStatus`, and `windows.registered` consistently.
- Scheduler entry point is `runNow(id, trigger)` in IPC, tests, and main startup.

## Implementation Completion Notes

- Tasks 1-7 were implemented and committed as focused slices on `reconcile-main-merge-dev`.
- Task 8 documentation was added to `README.md`, `docs/USER_MANUAL.md`, and `docs/runtime-setup.md`.
- Verification includes the focused scheduled-task suite, full `npm.cmd test`, and `npm.cmd run build:client`.
