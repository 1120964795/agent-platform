const { store } = require('../store')
const modelRouter = require('./modelRouter')
const { MODEL_ROLES } = require('./models/modelTypes')
const { buildPlannerPrompt, normalizeActionPlan } = require('./actionPlanner')
const dryRunRuntime = require('./dryRunRuntime')
const { getBroker } = require('../ipc/actions')
const { addRunOutput } = require('./runOutputs')

function lastUserMessage(messages = []) {
  return [...messages].reverse().find((message) => message.role === 'user')?.content || ''
}

function summarizeSubmitted(actions = []) {
  if (!actions.length) return '本次没有生成可执行动作。'
  const counts = actions.reduce((acc, action) => {
    acc[action.status] = (acc[action.status] || 0) + 1
    return acc
  }, {})
  const statusLabels = {
    proposed: '已提议',
    pending: '待审批',
    approved: '已批准',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    denied: '已拒绝',
    blocked: '已阻止',
    cancelled: '已取消'
  }
  const parts = Object.entries(counts).map(([status, count]) => `${statusLabels[status] || status} ${count} 个`)
  return `AionUi 已准备 ${actions.length} 个动作：${parts.join('，')}。请在控制中心查看待审批动作。`
}

function saveCompletedOutputs(actions = [], addOutput = addRunOutput) {
  const outputs = []
  for (const action of actions) {
    if (action.result || action.status === 'completed' || action.status === 'failed') {
      outputs.push(addOutput({
        sessionId: action.sessionId,
        actionId: action.id,
        type: action.type,
        title: action.title,
        summary: action.result?.stdout || action.error?.message || action.summary,
        metadata: { status: action.status, runtime: action.runtime, result: action.result || null }
      }))
    }
  }
  return outputs
}

function createTaskOrchestrator(overrides = {}) {
  const deps = {
    storeRef: store,
    modelRouter,
    dryRunRuntime,
    broker: getBroker(),
    addRunOutput,
    now: () => new Date(),
    ...overrides
  }

  async function planWithQwen(task, config, sessionId) {
    const messages = buildPlannerPrompt(task)
    const raw = await deps.modelRouter.jsonForRole(MODEL_ROLES.TASK_PLANNING, messages, { temperature: 0.1 }, config)
    return normalizeActionPlan(raw, { sessionId, now: deps.now() })
  }

  async function runExecutionTask({ convId, messages = [], dryRun = false, onEvent }) {
    const config = deps.storeRef.getConfig()
    const task = lastUserMessage(messages)
    const sessionId = convId || `sess_${Date.now()}`
    let proposals
    let usedDryRun = false

    if (dryRun || (config.dryRunEnabled !== false && !config.qwenApiKey)) {
      const plan = deps.dryRunRuntime.planTask(task, { sessionId, cwd: config.workspace_root })
      proposals = plan.actions
      usedDryRun = true
    } else {
      proposals = await planWithQwen(task, config, sessionId)
    }

    onEvent?.('chat:action-plan', { actions: proposals, dryRun: usedDryRun })
    const submitted = await deps.broker.submitActions(proposals, { config })
    const outputs = saveCompletedOutputs(submitted, deps.addRunOutput)
    onEvent?.('chat:action-update', { actions: submitted, outputs })

    return {
      content: `${usedDryRun ? '[演示模式] ' : ''}${summarizeSubmitted(submitted)}`,
      actions: submitted,
      outputs,
      dryRun: usedDryRun
    }
  }

  return { runExecutionTask }
}

module.exports = { createTaskOrchestrator, lastUserMessage, saveCompletedOutputs, summarizeSubmitted }
