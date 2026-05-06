const registry = require('../workflows/registry')
const versionService = require('../workflows/versionService')
const diffService = require('../workflows/diffService')
const packageService = require('../workflows/packageService')
const generator = require('../workflows/generator')
const runStore = require('../workflows/runStore')
const trustService = require('../workflows/trustService')
const templateSourceService = require('../workflows/templateSourceService')
const { WorkflowRunner } = require('../workflows/runner')
const { ServiceProcessManager } = require('../workflows/serviceProcessManager')

function ok(payload = {}) {
  return { ok: true, ...payload }
}

function fail(error) {
  return { ok: false, error: { code: error.code || 'WORKFLOW_ERROR', message: error.message || String(error) } }
}

function wrap(fn) {
  return async (event, payload) => {
    try {
      return await fn(event, payload || {})
    } catch (error) {
      return fail(error)
    }
  }
}

function register(ipcMain, deps = {}) {
  const emit = (eventName, payload) => deps.mainWindow?.webContents?.send(eventName, payload)
  const serviceManager = deps.workflowServiceManager || new ServiceProcessManager({ emit })
  const runner = deps.workflowRunner || new WorkflowRunner({
    executor: deps.workflowExecutor,
    serviceManager,
    emit
  })

  ipcMain.handle('workflow-skills:list', wrap(async () => ok({ workflows: registry.listWorkflows() })))
  ipcMain.handle('workflow-skills:get', wrap(async (_event, payload) => ok(registry.getWorkflow(payload.workflowId))))
  ipcMain.handle('workflow-skills:generateFromProject', wrap(async (_event, payload) => ok({ draft: generator.generateFromProject(payload) })))
  ipcMain.handle('workflow-skills:generateFromRun', wrap(async (_event, payload) => ok({ draft: generator.generateFromRun(payload) })))
  ipcMain.handle('workflow-skills:saveDraft', wrap(async (_event, payload) => ok(registry.saveDraft(payload.draft || payload, payload))))
  ipcMain.handle('workflow-skills:disable', wrap(async (_event, payload) => ok({ workflow: registry.setStatus(payload.workflowId, 'disabled') })))
  ipcMain.handle('workflow-skills:delete', wrap(async (_event, payload) => {
    registry.deleteWorkflow(payload.workflowId)
    return ok()
  }))
  ipcMain.handle('workflow-skills:export', wrap(async (_event, payload) => ok(await packageService.exportWorkflow(payload.workflowId, payload.version))))

  ipcMain.handle('workflow-versions:list', wrap(async (_event, payload) => ok({ versions: versionService.listVersions(payload.workflowId) })))
  ipcMain.handle('workflow-versions:diff', wrap(async (_event, payload) => ok({ diff: diffService.diffVersions(payload.workflowId, payload.fromVersion, payload.toVersion) })))
  ipcMain.handle('workflow-versions:rollback', wrap(async (_event, payload) => ok({ version: versionService.rollback(payload.workflowId, payload.version, payload.changelog) })))

  ipcMain.handle('workflow-runs:start', wrap(async (_event, payload) => ok({ run: await runner.start(payload.workflowId, payload) })))
  ipcMain.handle('workflow-runs:confirmStep', wrap(async (_event, payload) => ok({ run: await runner.confirmStep(payload.runId, payload.accepted) })))
  ipcMain.handle('workflow-runs:pause', wrap(async (_event, payload) => ok({ run: runner.pause(payload.runId) })))
  ipcMain.handle('workflow-runs:resume', wrap(async (_event, payload) => ok({ run: await runner.resume(payload.runId) })))
  ipcMain.handle('workflow-runs:skipStep', wrap(async (_event, payload) => ok({ run: await runner.skipStep(payload.runId) })))
  ipcMain.handle('workflow-runs:retryStep', wrap(async (_event, payload) => ok({ run: await runner.retryStep(payload.runId) })))
  ipcMain.handle('workflow-runs:terminate', wrap(async (_event, payload) => ok({ run: runner.terminate(payload.runId) })))
  ipcMain.handle('workflow-runs:insertTemporaryStep', wrap(async (_event, payload) => ok({ run: await runner.insertTemporaryStep(payload.runId, payload.suggestion || payload) })))
  ipcMain.handle('workflow-runs:list', wrap(async (_event, payload) => ok({ runs: runStore.listRuns(payload.workflowId) })))
  ipcMain.handle('workflow-runs:get', wrap(async (_event, payload) => ok({ run: payload.workflowId ? runStore.getRun(payload.workflowId, payload.runId) : runner.getRun(payload.runId) })))

  ipcMain.handle('workflow-services:stop', wrap(async (_event, payload) => ok({ service: serviceManager.stop(payload.serviceId) })))

  ipcMain.handle('workflow-template-sources:list', wrap(async () => ok({ sources: trustService.listSources() })))
  ipcMain.handle('workflow-template-sources:add', wrap(async (_event, payload) => ok({ source: trustService.addSource(payload) })))
  ipcMain.handle('workflow-template-sources:updateTrust', wrap(async (_event, payload) => ok({ source: trustService.updateTrust(payload.sourceId, payload) })))
  ipcMain.handle('workflow-templates:list', wrap(async () => ok(await templateSourceService.listTemplates(deps))))
  ipcMain.handle('workflow-templates:preview', wrap(async (_event, payload) => ok({ preview: await packageService.previewPackage(payload.packagePath, payload) })))
  ipcMain.handle('workflow-templates:import', wrap(async (_event, payload) => {
    trustService.recordImportConfirmation({ sourceUrl: payload.sourceUrl, packagePath: payload.packagePath, trusted: true })
    return ok(await packageService.importPackage(payload.packagePath, { ...payload, trusted: true }))
  }))
}

module.exports = { register }
