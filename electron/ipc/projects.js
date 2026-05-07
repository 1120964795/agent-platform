const { store } = require('../store')
const projectIndex = require('../services/projectIndex')

function ok(payload = {}) {
  return { ok: true, ...payload }
}

function fail(error) {
  return { ok: false, error: { code: error.code || 'PROJECT_ERROR', message: error.message || 'Project operation failed' } }
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

function register(ipcMain) {
  ipcMain.handle('projects:list', wrap(async (_event, payload = {}) => ok({ projects: store.listProjects(username(payload)) })))

  ipcMain.handle('projects:add', wrap(async (_event, payload = {}) => {
    const project = projectIndex.addProject({ ...payload, username: username(payload) })
    const profile = projectIndex.refreshProfile(project.id, username(payload))
    return ok({ project, profile })
  }))

  ipcMain.handle('projects:get', wrap(async (_event, payload = {}) => {
    const project = store.getProject(payload.projectId || payload.id, username(payload))
    if (!project) return { ok: false, error: { code: 'NOT_FOUND', message: 'Project not found' } }
    return ok({
      project,
      settings: store.getProjectSettings(project.id),
      profile: store.getProjectProfile(project.id),
      indexStatus: { status: project.indexStatus || 'idle', indexedFileCount: project.indexedFileCount || 0, lastIndexedAt: project.lastIndexedAt || '' }
    })
  }))

  ipcMain.handle('projects:remove', wrap(async (_event, payload = {}) => {
    await projectIndex.removeProject(payload.projectId || payload.id, username(payload))
    return ok()
  }))

  ipcMain.handle('projects:settings:get', wrap(async (_event, payload = {}) => {
    return ok({ settings: projectIndex.ensureProjectSettings(payload.projectId) })
  }))

  ipcMain.handle('projects:settings:update', wrap(async (_event, payload = {}) => {
    const current = projectIndex.ensureProjectSettings(payload.projectId)
    const settings = store.upsertProjectSettings({ ...current, ...(payload.patch || payload), projectId: payload.projectId, updatedAt: new Date().toISOString() })
    return ok({ settings })
  }))

  ipcMain.handle('projects:profile:refresh', wrap(async (_event, payload = {}) => ok({ profile: projectIndex.refreshProfile(payload.projectId, username(payload)) })))

  ipcMain.handle('projects:index:start', wrap(async (_event, payload = {}) => ok(await projectIndex.indexProject(payload.projectId, username(payload)))))

  ipcMain.handle('projects:index:pause', wrap(async (_event, payload = {}) => {
    const project = store.getProject(payload.projectId, username(payload))
    if (!project) return { ok: false, error: { code: 'NOT_FOUND', message: 'Project not found' } }
    return ok({ project: store.upsertProject({ ...project, indexStatus: 'paused' }) })
  }))

  ipcMain.handle('projects:index:clear', wrap(async (_event, payload = {}) => {
    await projectIndex.clearProjectIndex(payload.projectId)
    const project = store.getProject(payload.projectId, username(payload))
    if (project) store.upsertProject({ ...project, indexStatus: 'cleared', indexedFileCount: 0, lastIndexedAt: '' })
    return ok({ indexedFileCount: 0 })
  }))

  ipcMain.handle('projects:index:status', wrap(async (_event, payload = {}) => {
    const project = store.getProject(payload.projectId, username(payload))
    if (!project) return { ok: false, error: { code: 'NOT_FOUND', message: 'Project not found' } }
    return ok({ status: project.indexStatus || 'idle', indexedFileCount: project.indexedFileCount || 0, lastIndexedAt: project.lastIndexedAt || '' })
  }))

  ipcMain.handle('projects:search', wrap(async (_event, payload = {}) => ok({ results: await projectIndex.searchProject(payload.projectId, payload.query, username(payload), payload) })))

  ipcMain.handle('projects:ask', wrap(async (_event, payload = {}) => ok(await projectIndex.askProject(payload.projectId, payload.question || payload.query, username(payload)))))

  ipcMain.handle('projects:patch:preview', wrap(async (_event, payload = {}) => ok({ patch: projectIndex.previewPatch(payload.projectId, payload, username(payload)) })))

  ipcMain.handle('projects:patch:apply', wrap(async (_event, payload = {}) => ok({ patch: projectIndex.applyPatch(payload.projectId, payload.patchId, username(payload), payload.confirmed === true) })))

  ipcMain.handle('projects:patch:list', wrap(async (_event, payload = {}) => ok({ patches: store.listPatchRecords(payload.projectId) })))

  ipcMain.handle('projects:experiences:match', wrap(async (_event, payload = {}) => {
    const project = store.getProject(payload.projectId, username(payload))
    const profile = project ? store.getProjectProfile(project.id) : null
    const tokens = new Set([...(profile?.languages || []), ...(profile?.frameworks || [])].map((item) => String(item).toLowerCase()))
    const matches = store.listExperiences(username(payload)).filter((experience) => {
      const haystack = [experience.projectType, experience.summary, experience.title].filter(Boolean).join(' ').toLowerCase()
      return [...tokens].some((token) => token && haystack.includes(token))
    })
    return ok({ matches })
  }))

  ipcMain.handle('projects:embedding:status', wrap(async (_event, payload = {}) => {
    const settings = projectIndex.ensureProjectSettings(payload.projectId)
    return ok({ enabled: settings.embeddingEnabled === true, status: settings.embeddingEnabled ? 'enabled' : 'disabled' })
  }))

  ipcMain.handle('projects:embedding:refresh', wrap(async (_event, payload = {}) => {
    const settings = projectIndex.ensureProjectSettings(payload.projectId)
    return ok({ enabled: settings.embeddingEnabled === true, status: settings.embeddingEnabled ? 'queued' : 'disabled' })
  }))
}

module.exports = { register }
