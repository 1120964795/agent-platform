const path = require('path')
const { runShellCommand } = require('../tools/shell')

function tail(text = '', max = 4000) {
  const value = String(text || '')
  return value.length > max ? value.slice(value.length - max) : value
}

class WorkflowStepExecutor {
  constructor(deps = {}) {
    this.shell = deps.shell || runShellCommand
    this.projectQA = deps.projectQA || null
    this.diagnosis = deps.diagnosis || null
    this.patchApply = deps.patchApply || null
    this.serviceManager = deps.serviceManager || null
  }

  async execute(step, context = {}) {
    if (step.type === 'query_project') {
      const answer = this.projectQA ? await this.projectQA.ask(step) : { answer: '', citations: [] }
      return { status: 'completed', exitCode: 0, stdoutTail: JSON.stringify(answer), stderrTail: '' }
    }
    if (step.type === 'diagnose_error') {
      const diagnosis = this.diagnosis ? await this.diagnosis.diagnose(step, context) : { matches: [] }
      return { status: 'completed', exitCode: 0, stdoutTail: JSON.stringify(diagnosis), stderrTail: '', diagnosisIds: diagnosis.ids || [] }
    }
    if (step.type === 'apply_patch') {
      if (!this.patchApply) return { status: 'failed', exitCode: null, stdoutTail: '', stderrTail: 'Patch apply service is not configured.' }
      const result = await this.patchApply.apply(step.patchDraftId)
      return { status: result.ok ? 'completed' : 'failed', exitCode: result.ok ? 0 : 1, stdoutTail: result.message || '', stderrTail: result.error || '' }
    }
    if (step.type === 'open_file') {
      return { status: 'completed', exitCode: 0, stdoutTail: path.resolve(step.path || ''), stderrTail: '' }
    }
    if (step.type === 'wait_for_output') {
      const source = context.stepResults?.find((result) => result.stepId === step.fromStepId)
      const haystack = `${source?.stdoutTail || ''}\n${source?.stderrTail || ''}`
      const matched = (step.patterns || []).some((pattern) => haystack.includes(pattern))
      return matched
        ? { status: 'completed', exitCode: 0, stdoutTail: 'Pattern matched.', stderrTail: '' }
        : { status: 'failed', exitCode: 1, stdoutTail: '', stderrTail: 'Timed out waiting for output pattern.' }
    }
    if (step.type === 'start_service') {
      if (!this.serviceManager) return { status: 'failed', exitCode: null, stdoutTail: '', stderrTail: 'Service manager is not configured.' }
      return this.serviceManager.start(step, context)
    }

    const result = await this.shell({ command: step.command, cwd: step.cwd, timeout_ms: step.timeoutMs })
    if (result.error) {
      return {
        status: 'failed',
        exitCode: result.exit_code ?? null,
        stdoutTail: tail(result.stdout),
        stderrTail: tail(result.stderr || result.error.message),
        error: result.error
      }
    }
    const expected = step.expectedExitCodes || [0]
    return {
      status: expected.includes(result.exit_code) ? 'completed' : 'failed',
      exitCode: result.exit_code,
      stdoutTail: tail(result.stdout),
      stderrTail: tail(result.stderr),
      durationMs: result.duration_ms,
      truncated: result.truncated
    }
  }
}

module.exports = { WorkflowStepExecutor, tail }
