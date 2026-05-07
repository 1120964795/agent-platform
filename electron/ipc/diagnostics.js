const { store } = require('../store')
const tools = require('../tools')
const { requestConfirm } = require('../confirm')
const diagnosisService = require('../services/diagnostics/diagnosisService')
const windowCollector = require('../services/diagnostics/windowCollector')
const { defaultService } = require('../services/diagnostics/companionService')

function ok(payload = {}) {
  return { ok: true, ...payload }
}

function fail(error) {
  return { ok: false, error: { code: error.code || 'DIAGNOSTICS_ERROR', message: error.message || 'Diagnostics operation failed' } }
}

function wrap(handler) {
  return async (event, payload = {}) => {
    try {
      return await handler(event, payload)
    } catch (error) {
      return fail(error)
    }
  }
}

function username(payload = {}) {
  return payload.username || 'guest'
}

function register(ipcMain, deps = {}) {
  const execute = deps.execute || tools.execute
  const confirm = deps.requestConfirm || requestConfirm
  const collector = deps.collector || windowCollector
  const companionService = deps.companionService || defaultService

  ipcMain.handle('diagnostics:start', wrap(async (_event, payload = {}) => {
    const session = companionService.start({
      username: username(payload),
      projectId: payload.projectId || null,
      target: payload.target || { type: 'manual' }
    })
    return ok({ status: session })
  }))

  ipcMain.handle('diagnostics:stop', wrap(async () => ok({ status: companionService.stop() })))

  ipcMain.handle('diagnostics:status', wrap(async () => ok({ status: store.getDiagnosticsSession() })))

  ipcMain.handle('diagnostics:targets', wrap(async () => ok({ targets: await collector.listWindowTargets() })))

  ipcMain.handle('diagnostics:selectRegion', wrap(async (_event, payload = {}) => ok({ target: { id: `region:${Date.now()}`, type: 'region', title: '屏幕区域 OCR', ...(payload.region || {}) } })))

  ipcMain.handle('diagnostics:ingestText', wrap(async (_event, payload = {}) => {
    const result = diagnosisService.createDiagnosis({
      text: payload.text,
      username: username(payload),
      projectId: payload.projectId || null,
      source: payload.source || 'manual'
    })
    if (!result) return ok({ diagnosis: null, experience: null, matched: false })
    return ok({ ...result, matched: true })
  }))

  ipcMain.handle('diagnostics:list', wrap(async (_event, payload = {}) => ok({ diagnostics: store.listDiagnostics(username(payload)) })))

  ipcMain.handle('diagnostics:get', wrap(async (_event, payload = {}) => {
    const diagnosis = store.getDiagnosis(payload.diagnosisId || payload.id, username(payload))
    if (!diagnosis) return { ok: false, error: { code: 'NOT_FOUND', message: 'Diagnosis not found' } }
    return ok({ diagnosis })
  }))

  ipcMain.handle('diagnostics:ignore', wrap(async (_event, payload = {}) => {
    const data = store.getData()
    data.ignoredDiagnosisSignatures = [...new Set([...(data.ignoredDiagnosisSignatures || []), payload.signature].filter(Boolean))]
    store.saveData(data)
    return ok({ ignored: data.ignoredDiagnosisSignatures })
  }))

  ipcMain.handle('diagnostics:explain', wrap(async (_event, payload = {}) => {
    const diagnosis = store.getDiagnosis(payload.diagnosisId, username(payload))
    if (!diagnosis) return { ok: false, error: { code: 'NOT_FOUND', message: 'Diagnosis not found' } }
    const explanation = diagnosisService.explainDiagnosis(diagnosis)
    store.upsertDiagnosis({ ...diagnosis, modelExplanation: explanation, updatedAt: new Date().toISOString() })
    return ok({ explanation })
  }))

  ipcMain.handle('diagnostics:rewritePlan', wrap(async (_event, payload = {}) => {
    const diagnosis = store.getDiagnosis(payload.diagnosisId, username(payload))
    if (!diagnosis) return { ok: false, error: { code: 'NOT_FOUND', message: 'Diagnosis not found' } }
    const experience = payload.experienceId ? store.getExperience(payload.experienceId, username(payload)) : null
    return ok({ plan: diagnosisService.rewritePlan(diagnosis, experience) })
  }))

  ipcMain.handle('diagnostics:executeFix', wrap(async (_event, payload = {}) => {
    const diagnosis = store.getDiagnosis(payload.diagnosisId, username(payload))
    if (!diagnosis) return { ok: false, error: { code: 'NOT_FOUND', message: 'Diagnosis not found' } }
    const fix = diagnosis.fixes.find((item) => item.id === payload.fixId) || diagnosis.fixes[0]
    if (!fix?.command) return { ok: false, error: { code: 'NO_FIX', message: 'No fix command available' } }
    const allowed = await confirm({
      kind: 'diagnosis-fix',
      payload: {
        title: diagnosis.title,
        command: fix.command,
        cwd: payload.cwd || '',
        riskLevel: fix.riskLevel || diagnosis.severity
      }
    })
    if (!allowed) return { ok: false, error: { code: 'USER_CANCELLED', message: 'Fix cancelled by user' } }
    const result = await execute('run_shell_command', { command: fix.command, cwd: payload.cwd, timeout_ms: payload.timeout_ms || 120000 })
    diagnosisService.markExperienceResolved(username(payload), diagnosis, fix.command, result)
    store.upsertDiagnosis({ ...diagnosis, status: result.error ? 'failed' : 'resolved', lastFixResult: result, updatedAt: new Date().toISOString() })
    return ok({ result })
  }))

  ipcMain.handle('diagnostics:popup-action', wrap(async (_event, payload = {}) => ok({ action: payload.action || 'noop' })))
}

module.exports = { register }
