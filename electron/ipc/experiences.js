const { store } = require('../store')

function ok(payload = {}) {
  return { ok: true, ...payload }
}

function fail(error) {
  return { ok: false, error: { code: error.code || 'EXPERIENCE_ERROR', message: error.message || 'Experience operation failed' } }
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
  ipcMain.handle('experiences:list', wrap(async (_event, payload = {}) => ok({ experiences: store.listExperiences(username(payload), payload) })))

  ipcMain.handle('experiences:get', wrap(async (_event, payload = {}) => {
    const experience = store.getExperience(payload.id || payload.experienceId, username(payload))
    if (!experience) return { ok: false, error: { code: 'NOT_FOUND', message: 'Experience not found' } }
    return ok({ experience })
  }))

  ipcMain.handle('experiences:update', wrap(async (_event, payload = {}) => {
    const current = payload.id ? store.getExperience(payload.id, username(payload)) : null
    const now = new Date().toISOString()
    const experience = store.upsertExperience({
      ...(current || {}),
      ...(payload.patch || payload),
      id: payload.id || current?.id || store.genId('exp_'),
      username: username(payload),
      updatedAt: now,
      createdAt: current?.createdAt || payload.createdAt || now
    })
    return ok({ experience })
  }))

  ipcMain.handle('experiences:delete', wrap(async (_event, payload = {}) => {
    store.deleteExperience(payload.id || payload.experienceId, username(payload))
    return ok()
  }))

  ipcMain.handle('experiences:search', wrap(async (_event, payload = {}) => ok({ experiences: store.searchExperiences(username(payload), payload.query, payload) })))

  ipcMain.handle('experiences:export', wrap(async (_event, payload = {}) => {
    return ok({
      filename: `agentdev-experiences-${username(payload)}.json`,
      payload: {
        version: 1,
        exportedAt: new Date().toISOString(),
        username: username(payload),
        experiences: store.listExperiences(username(payload))
      }
    })
  }))
}

module.exports = { register }
