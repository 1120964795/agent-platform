const { store } = require('../store')
const { runShellCommand } = require('../tools/shell')
const { requestConfirm } = require('../confirm')

function usernameFrom(payload = {}) {
  return typeof payload.username === 'string' ? payload.username : 'guest'
}

function createRegister(overrides = {}) {
  const deps = {
    storeRef: store,
    companionService: overrides.companionService,
    execute: overrides.execute || runShellCommand,
    requestConfirm: overrides.requestConfirm || requestConfirm,
    mainWindowRef: overrides.mainWindowRef || (() => null),
    ...overrides
  }

  return function register(ipcMain) {
    const companion = deps.companionService
    const unavailable = () => ({
      ok: false,
      error: {
        code: 'COMPANION_UNAVAILABLE',
        message: 'Diagnostics companion service is not initialized.'
      }
    })

    ipcMain.handle('diagnostics:targets', async () => {
      if (!companion || typeof companion.listTargets !== 'function') return unavailable()
      return {
        ok: true,
        targets: await companion.listTargets()
      }
    })

    ipcMain.handle('diagnostics:selectRegion', async () => ({
      ok: true,
      region: await companion.selectRegion()
    }))

    ipcMain.handle('diagnostics:start', async (_event, payload = {}) => ({
      ok: true,
      session: await companion.start(payload)
    }))

    ipcMain.handle('diagnostics:stop', async () => ({
      ok: true,
      session: companion.stop()
    }))

    ipcMain.handle('diagnostics:resumeNow', async () => ({
      ok: true,
      session: companion.resumeNow()
    }))

    ipcMain.handle('diagnostics:status', async (_event, payload = {}) => ({
      ok: true,
      ...companion.status(usernameFrom(payload))
    }))

    ipcMain.handle('diagnostics:ignore', async (_event, payload = {}) => {
      if (!payload.signature) return { ok: false, error: { code: 'BAD_REQUEST', message: 'Missing signature.' } }
      companion.ignore(payload.signature)
      return { ok: true }
    })

    ipcMain.handle('diagnostics:list', async (_event, payload = {}) => ({
      ok: true,
      items: companion.listDiagnostics(usernameFrom(payload))
    }))

    ipcMain.handle('diagnostics:get', async (_event, payload = {}) => {
      const diagnosis = companion.getDiagnosis(payload.id || payload.diagnosisId, usernameFrom(payload))
      if (!diagnosis) return { ok: false, error: { code: 'NOT_FOUND', message: 'Diagnosis not found.' } }
      return { ok: true, diagnosis }
    })

    ipcMain.handle('diagnostics:executeFix', async (event, payload = {}) => {
      const username = usernameFrom(payload)
      const diagnosis = companion.getDiagnosis(payload.diagnosisId, username)
      if (!diagnosis) return { ok: false, error: { code: 'NOT_FOUND', message: 'Diagnosis not found.' } }

      const plan = payload.plan || diagnosis.recommendedFixes?.find((item) => item.id === payload.fixId)
      if (!plan) return { ok: false, error: { code: 'NOT_FOUND', message: 'Fix plan not found.' } }
      if (plan.blocked) {
        return {
          ok: false,
          error: {
            code: plan.blockReason || 'PLAN_BLOCKED',
            message: plan.riskExplanation || 'Execution plan is blocked.'
          }
        }
      }

      const allowed = await deps.requestConfirm({
        kind: 'diagnosis-fix',
        username,
        payload: {
          title: diagnosis.title,
          command: plan.command,
          cwd: plan.cwd,
          riskLevel: plan.riskLevel,
          riskExplanation: plan.riskExplanation,
          downloadUrl: plan.downloadUrl,
          downloadTarget: plan.downloadTarget,
          downloadExtension: plan.downloadExtension,
          executesAfterDownload: plan.executesAfterDownload,
          requiresAdmin: plan.requiresAdmin
        }
      })

      if (!allowed) return { ok: false, error: { code: 'USER_CANCELLED', message: 'User cancelled execution.' } }

      const result = await deps.execute({
        command: plan.command,
        cwd: plan.cwd,
        timeout_ms: payload.timeout_ms || 120000
      }, {
        username,
        alreadyConfirmed: true,
        onLog: (stream, chunk) => event.sender?.send?.('diagnostics:event', {
          type: 'fix-log',
          diagnosisId: diagnosis.id,
          stream,
          chunk
        })
      })

      if (result?.error) {
        const failedExperience = companion.recordExecution(diagnosis, plan, result)
        return { ok: false, error: result.error, experience: failedExperience, result }
      }

      const experience = companion.recordExecution(diagnosis, plan, result)
      const nextDiagnosis = deps.storeRef.upsertDiagnosis({
        ...diagnosis,
        status: Number(result.exit_code) === 0 ? 'resolved' : 'ready'
      })
      event.sender?.send?.('diagnostics:event', {
        type: 'fix-executed',
        diagnosis: nextDiagnosis,
        experience,
        result
      })

      return { ok: true, diagnosis: nextDiagnosis, experience, result }
    })

    ipcMain.handle('diagnostics:explain', async (_event, payload = {}) => {
      try {
        const diagnosis = await companion.explainDiagnosis(usernameFrom(payload), payload.diagnosisId)
        if (!diagnosis) return { ok: false, error: { code: 'NOT_FOUND', message: 'Diagnosis not found.' } }
        return { ok: true, diagnosis }
      } catch (error) {
        return { ok: false, error: { code: error.code || 'MODEL_UNAVAILABLE', message: error.message || 'Model unavailable.' } }
      }
    })

    ipcMain.handle('diagnostics:rewritePlan', async (_event, payload = {}) => {
      try {
        const plan = await companion.rewritePlan(usernameFrom(payload), payload.diagnosisId, payload.experienceId)
        if (!plan) return { ok: false, error: { code: 'NOT_FOUND', message: 'Diagnosis or experience not found.' } }
        return { ok: true, plan, reason: plan.reason || '' }
      } catch (error) {
        return { ok: false, error: { code: error.code || 'MODEL_UNAVAILABLE', message: error.message || 'Model unavailable.' } }
      }
    })

    ipcMain.handle('diagnostics:popup-action', async (_event, payload = {}) => {
      const mainWindow = deps.mainWindowRef()
      if (payload.action === 'ignore-batch') {
        for (const signature of payload.signatures || []) {
          companion.ignore(signature)
        }
        companion.popupManager?.close?.()
        return { ok: true }
      }

      if (payload.action === 'open-all' || payload.action === 'view-all') {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized?.()) mainWindow.restore?.()
          mainWindow.show?.()
          mainWindow.focus?.()
          mainWindow.webContents.send('diagnostics:event', {
            type: 'popup-open-all',
            diagnosisIds: payload.diagnosisIds || []
          })
        }
        companion.popupManager?.close?.()
        return { ok: true }
      }

      if (payload.action === 'open-diagnosis-explanation') {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized?.()) mainWindow.restore?.()
          mainWindow.show?.()
          mainWindow.focus?.()
          mainWindow.webContents.send('diagnostics:event', {
            type: 'popup-open-diagnosis-explanation',
            diagnosisId: payload.diagnosisId,
            diagnosisIds: payload.diagnosisId ? [payload.diagnosisId] : []
          })
        }
        companion.popupManager?.close?.()
        return { ok: true }
      }

      return { ok: false, error: { code: 'BAD_REQUEST', message: 'Unsupported popup action.' } }
    })
  }
}

function register(ipcMain, deps = {}) {
  return createRegister(deps)(ipcMain)
}

module.exports = { register, createRegister, usernameFrom }
