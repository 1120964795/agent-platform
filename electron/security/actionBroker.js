const { evaluateAction } = require('./actionPolicy')
const { appendAuditEvent } = require('./auditLog')
const { ACTION_STATUS, AUDIT_PHASES, RISK_LEVELS } = require('./actionTypes')
const { store } = require('../store')

const FINAL_STATUSES = new Set([
  ACTION_STATUS.COMPLETED,
  ACTION_STATUS.FAILED,
  ACTION_STATUS.DENIED,
  ACTION_STATUS.BLOCKED,
  ACTION_STATUS.CANCELLED
])

class ActionBrokerError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function createActionBroker(options = {}) {
  const actions = new Map()
  const adapters = new Map()
  const controllers = new Map()
  const audit = options.audit || appendAuditEvent
  const storeRef = options.storeRef || store

  function snapshot(action) {
    return JSON.parse(JSON.stringify(action))
  }

  function emitAudit(action, phase, summary, extra = {}) {
    audit({
      sessionId: action.sessionId,
      actionId: action.id,
      runtime: action.runtime,
      type: action.type,
      phase,
      risk: action.risk,
      summary,
      payload: action.payload,
      ...extra
    })
  }

  function setAction(action) {
    actions.set(action.id, action)
    options.onChange?.(snapshot(action))
    return action
  }

  function registerAdapter(runtime, adapter) {
    if (!runtime || !adapter || typeof adapter.execute !== 'function') throw new ActionBrokerError('ADAPTER_INVALID', '适配器必须暴露 execute(action, context)。')
    adapters.set(runtime, adapter)
  }

  async function executeAction(action) {
    const adapter = adapters.get(action.runtime)
    if (!adapter) {
      action.status = ACTION_STATUS.FAILED
      action.error = { code: 'ADAPTER_MISSING', message: `未注册 ${action.runtime} 适配器。` }
      emitAudit(action, AUDIT_PHASES.FAILED, action.error.message)
      setAction(action)
      return snapshot(action)
    }

    const controller = new AbortController()
    controllers.set(action.id, controller)
    action.status = ACTION_STATUS.RUNNING
    action.startedAt = new Date().toISOString()
    emitAudit(action, AUDIT_PHASES.STARTED, `开始执行：${action.title}`)
    setAction(action)

    const start = Date.now()
    try {
      const result = await adapter.execute(snapshot(action), { signal: controller.signal })
      action.result = {
        actionId: action.id,
        ok: result?.ok !== false,
        exitCode: result?.exitCode ?? 0,
        stdout: result?.stdout || '',
        stderr: result?.stderr || '',
        filesChanged: result?.filesChanged || [],
        durationMs: result?.durationMs ?? Date.now() - start,
        completedAt: result?.completedAt || new Date().toISOString(),
        ...(result?.metadata ? { metadata: result.metadata } : {})
      }
      action.status = action.result.ok ? ACTION_STATUS.COMPLETED : ACTION_STATUS.FAILED
      emitAudit(action, action.result.ok ? AUDIT_PHASES.COMPLETED : AUDIT_PHASES.FAILED, action.result.ok ? `已完成：${action.title}` : `执行失败：${action.title}`, { payload: { ...action.payload, result: action.result } })
    } catch (error) {
      action.status = controller.signal.aborted ? ACTION_STATUS.CANCELLED : ACTION_STATUS.FAILED
      action.error = { code: error.code || (controller.signal.aborted ? 'ACTION_CANCELLED' : 'ACTION_FAILED'), message: error.message || '动作执行失败。' }
      emitAudit(action, action.status === ACTION_STATUS.CANCELLED ? AUDIT_PHASES.CANCELLED : AUDIT_PHASES.FAILED, action.error.message)
    } finally {
      controllers.delete(action.id)
      setAction(action)
    }
    return snapshot(action)
  }

  async function enqueue(action, submitOptions = {}) {
    const config = submitOptions.config || storeRef.getConfig?.() || {}
    const policy = evaluateAction(action, config)
    const next = {
      ...action,
      risk: policy.risk,
      requiresConfirmation: policy.requiresConfirmation,
      policyReasons: policy.reasons
    }

    emitAudit(next, AUDIT_PHASES.PROPOSED, `已提议：${next.title}`)

    if (policy.blocked) {
      next.status = ACTION_STATUS.BLOCKED
      next.blockedReason = policy.reasons.join(' ')
      emitAudit(next, AUDIT_PHASES.BLOCKED, next.blockedReason)
      setAction(next)
      return snapshot(next)
    }

    if (policy.risk === RISK_LEVELS.LOW && submitOptions.autoRunLowRisk !== false) {
      next.status = ACTION_STATUS.APPROVED
      emitAudit(next, AUDIT_PHASES.APPROVED, `策略自动批准低风险动作：${next.title}`)
      setAction(next)
      return executeAction(next)
    }

    next.status = ACTION_STATUS.PENDING
    setAction(next)
    return snapshot(next)
  }

  async function submitActions(proposals = [], submitOptions = {}) {
    const results = []
    for (const proposal of proposals) {
      results.push(await enqueue(proposal, submitOptions))
    }
    return results
  }

  async function approveAction(id) {
    const action = actions.get(id)
    if (!action) throw new ActionBrokerError('ACTION_NOT_FOUND', `未找到动作 ${id}。`)
    if (action.status !== ACTION_STATUS.PENDING) throw new ActionBrokerError('ACTION_NOT_PENDING', `动作 ${id} 不是待审批状态。`)
    action.status = ACTION_STATUS.APPROVED
    emitAudit(action, AUDIT_PHASES.APPROVED, `用户已批准：${action.title}`)
    setAction(action)
    return executeAction(action)
  }

  function denyAction(id, reason = '用户已拒绝动作。') {
    const action = actions.get(id)
    if (!action) throw new ActionBrokerError('ACTION_NOT_FOUND', `未找到动作 ${id}。`)
    if (FINAL_STATUSES.has(action.status)) return snapshot(action)
    action.status = ACTION_STATUS.DENIED
    action.deniedReason = reason
    emitAudit(action, AUDIT_PHASES.DENIED, reason)
    setAction(action)
    return snapshot(action)
  }

  function cancelAction(id, reason = '动作已取消。') {
    const action = actions.get(id)
    if (!action) throw new ActionBrokerError('ACTION_NOT_FOUND', `未找到动作 ${id}。`)
    if (FINAL_STATUSES.has(action.status)) return snapshot(action)
    controllers.get(id)?.abort()
    action.status = ACTION_STATUS.CANCELLED
    action.cancelledReason = reason
    emitAudit(action, AUDIT_PHASES.CANCELLED, reason)
    setAction(action)
    return snapshot(action)
  }

  function cancelSession(sessionId, reason = '会话已取消。') {
    const cancelled = []
    for (const action of actions.values()) {
      if (action.sessionId === sessionId && !FINAL_STATUSES.has(action.status)) cancelled.push(cancelAction(action.id, reason))
    }
    return cancelled
  }

  function emergencyStop(reason = '已请求紧急停止。') {
    const stopped = []
    for (const action of actions.values()) {
      if (!FINAL_STATUSES.has(action.status)) stopped.push(cancelAction(action.id, reason))
    }
    for (const adapter of adapters.values()) {
      adapter.emergencyStop?.()
    }
    return stopped
  }

  function listActions(filters = {}) {
    return [...actions.values()]
      .filter((action) => !filters.status || action.status === filters.status)
      .filter((action) => !filters.sessionId || action.sessionId === filters.sessionId)
      .filter((action) => !filters.runtime || action.runtime === filters.runtime)
      .map(snapshot)
  }

  function getAction(id) {
    const action = actions.get(id)
    return action ? snapshot(action) : null
  }

  return {
    registerAdapter,
    submitActions,
    approveAction,
    denyAction,
    cancelAction,
    cancelSession,
    emergencyStop,
    listActions,
    getAction
  }
}

module.exports = { ActionBrokerError, createActionBroker }
