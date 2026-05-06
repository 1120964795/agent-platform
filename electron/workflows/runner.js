const crypto = require('crypto')
const registry = require('./registry')
const runStore = require('./runStore')
const { normalizeStep, nowIso } = require('./schema')
const { WorkflowStepExecutor } = require('./stepExecutor')
const { suggestFromFailure } = require('./runtimeSuggestionService')

function newRunId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `run_${date}_${crypto.randomUUID().slice(0, 8)}`
}

class WorkflowRunner {
  constructor(deps = {}) {
    this.executor = deps.executor || new WorkflowStepExecutor(deps)
    this.emit = deps.emit || (() => {})
    this.active = new Map()
  }

  getRun(runId) {
    return this.active.get(runId) || runStore.findRun(runId)
  }

  async start(workflowId, options = {}) {
    const { workflow, version } = registry.getWorkflow(workflowId, options.version)
    if (workflow.status === 'disabled') throw new Error('workflow is disabled')
    const startedAt = nowIso()
    const run = {
      runId: options.runId || newRunId(),
      workflowId,
      version: version.version,
      status: 'running',
      currentStepId: null,
      currentStepIndex: 0,
      startedAt,
      endedAt: null,
      workflowSteps: version.steps.map((step, index) => normalizeStep(step, index)),
      insertedTemporarySteps: [],
      stepResults: [],
      serviceProcesses: [],
      suggestions: []
    }
    this.active.set(run.runId, run)
    await this.continueRun(run)
    return this.persist(run)
  }

  async continueRun(run) {
    while (run.currentStepIndex < run.workflowSteps.length) {
      const step = run.workflowSteps[run.currentStepIndex]
      run.currentStepId = step.id
      if (step.enabled === false) {
        run.stepResults.push(this.resultFor(step, { status: 'skipped', exitCode: null, stdoutTail: '', stderrTail: '' }))
        run.currentStepIndex += 1
        continue
      }
      if (step.requiresConfirmation && !step.confirmedByUser) {
        run.status = 'waiting_confirmation'
        return
      }
      const result = await this.executeStep(run, step)
      if (result.status !== 'completed' && step.continueOnFailure !== true) {
        run.status = 'failed'
        run.endedAt = nowIso()
        const suggestion = suggestFromFailure(step, result)
        if (suggestion) run.suggestions.push({ ...suggestion, runId: run.runId })
        return
      }
      run.currentStepIndex += 1
    }
    run.status = 'completed'
    run.currentStepId = null
    run.endedAt = nowIso()
  }

  async executeStep(run, step) {
    const startedAt = nowIso()
    const raw = await this.executor.execute(step, run)
    const result = this.resultFor(step, raw, startedAt)
    run.stepResults.push(result)
    this.emit('workflow:event', { kind: 'step-result', runId: run.runId, stepId: step.id, status: result.status })
    return result
  }

  resultFor(step, raw, startedAt = nowIso()) {
    return {
      stepId: step.id,
      status: raw.status || (raw.exitCode === 0 ? 'completed' : 'failed'),
      startedAt,
      endedAt: nowIso(),
      exitCode: raw.exitCode ?? raw.exit_code ?? null,
      stdoutTail: raw.stdoutTail || '',
      stderrTail: raw.stderrTail || '',
      diagnosisIds: raw.diagnosisIds || [],
      confirmedByUser: Boolean(step.confirmedByUser),
      serviceProcess: raw.serviceProcess || null,
      error: raw.error || null
    }
  }

  persist(run) {
    runStore.saveRun(run)
    this.active.set(run.runId, run)
    return run
  }

  async confirmStep(runId, accepted) {
    const run = this.getRun(runId)
    if (run.status !== 'waiting_confirmation') throw new Error('run is not waiting for confirmation')
    const step = run.workflowSteps[run.currentStepIndex]
    if (!accepted) {
      step.confirmedByUser = false
      run.stepResults.push(this.resultFor(step, { status: 'rejected', exitCode: null, stdoutTail: '', stderrTail: '' }))
      run.status = 'paused'
      return this.persist(run)
    }
    step.confirmedByUser = true
    run.status = 'running'
    const result = await this.executeStep(run, step)
    if (result.status !== 'completed' && step.continueOnFailure !== true) {
      run.status = 'failed'
      run.endedAt = nowIso()
      return this.persist(run)
    }
    run.currentStepIndex += 1
    await this.continueRun(run)
    return this.persist(run)
  }

  pause(runId) {
    const run = this.getRun(runId)
    run.status = 'paused'
    return this.persist(run)
  }

  async resume(runId) {
    const run = this.getRun(runId)
    run.status = 'running'
    await this.continueRun(run)
    return this.persist(run)
  }

  async skipStep(runId) {
    const run = this.getRun(runId)
    const step = run.workflowSteps[run.currentStepIndex]
    run.stepResults.push(this.resultFor(step, { status: 'skipped', exitCode: null, stdoutTail: '', stderrTail: '' }))
    run.currentStepIndex += 1
    run.status = 'running'
    await this.continueRun(run)
    return this.persist(run)
  }

  async retryStep(runId) {
    const run = this.getRun(runId)
    run.status = 'running'
    await this.continueRun(run)
    return this.persist(run)
  }

  terminate(runId) {
    const run = this.getRun(runId)
    run.status = 'terminated'
    run.endedAt = nowIso()
    return this.persist(run)
  }

  async insertTemporaryStep(runId, suggestion) {
    const run = this.getRun(runId)
    const step = normalizeStep({ ...suggestion.suggestedStep, temporary: true }, run.workflowSteps.length)
    const insertAt = Math.min(run.currentStepIndex + 1, run.workflowSteps.length)
    run.workflowSteps.splice(insertAt, 0, step)
    run.insertedTemporarySteps.push({
      stepId: step.id,
      step,
      reason: suggestion.reason || '',
      insertedBy: 'agent',
      confirmedAt: nowIso()
    })
    return this.persist(run)
  }
}

module.exports = { WorkflowRunner, newRunId }
