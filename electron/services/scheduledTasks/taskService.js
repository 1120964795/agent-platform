const { store } = require('../../store')
const { buildTaskName, registerTask, deleteTask, getTaskStatus } = require('./windowsTaskScheduler')
const { normalizeScheduledTask, parseScheduleTextDetailed, nextRunFromSchedule } = require('./scheduleUtils')

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

  function schedulerOptions() {
    return {
      executablePath: deps.executablePath || process.execPath,
      appPath: deps.appPath || ''
    }
  }

  function listTasks() {
    return store.listScheduledTasks()
  }

  function findTask(id) {
    return listTasks().find((task) => task.id === id) || null
  }

  function draftTask(message) {
    const prompt = String(message || '').trim()
    if (!prompt) return { ok: false, error: { code: 'BAD_REQUEST', message: '需要提供定时任务描述。' } }
    const parsed = parseScheduleTextDetailed(prompt, now())
    const schedule = parsed.schedule
    if (!schedule) {
      return {
        ok: false,
        error: {
          code: parsed.error?.code || 'SCHEDULE_PARSE_FAILED',
          message: parsed.error?.message || '没有识别到明确的执行频率。请使用“每天 8 点”“每周一 9:30”“每月 1 号 8 点”“每隔 15 分钟”或“今天晚上8点提醒我”。'
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
    const registration = await windowsScheduler.registerTask(task, schedulerOptions())
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
    if (patch.enabled === false) await windowsScheduler.deleteTask(id, schedulerOptions())
    if (patch.enabled === true) {
      const registration = await windowsScheduler.registerTask(next, schedulerOptions())
      next.windows = { registered: true, taskName: registration.taskName || buildTaskName(id), lastCheckedAt: now().toISOString(), lastError: '' }
    }
    store.upsertScheduledTask(next)
    return next
  }

  async function removeTask(id) {
    await windowsScheduler.deleteTask(id, schedulerOptions())
    store.removeScheduledTask(id)
  }

  async function statusTask(id) {
    return windowsScheduler.getTaskStatus(id, schedulerOptions())
  }

  return { listTasks, findTask, draftTask, createTask, updateTask, removeTask, statusTask }
}

module.exports = { createTaskService, preauthorizationWarning, titleFromPrompt }
