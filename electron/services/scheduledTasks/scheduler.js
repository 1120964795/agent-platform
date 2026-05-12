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
      const next = applyPostRunSchedule(task, 'success', runAt)
      store.upsertScheduledTask(next)
      if (next.enabled !== false && next.nextRunAt) scheduleTask(next)
      else clearTimer(taskId)
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
      const next = applyPostRunSchedule(task, 'error', runAt)
      store.upsertScheduledTask(next)
      if (next.enabled !== false && next.nextRunAt) scheduleTask(next)
      else clearTimer(taskId)
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
