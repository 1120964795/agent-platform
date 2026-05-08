const { store } = require('../store')

function usernameFrom(payload = {}) {
  return typeof payload.username === 'string' ? payload.username : 'guest'
}

function register(ipcMain, deps = {}) {
  const storeRef = deps.storeRef || store
  const companionService = deps.companionService

  ipcMain.handle('experiences:list', async (_event, payload = {}) => {
    const username = usernameFrom(payload)
    companionService?.cleanupExperiencesIfNeeded?.(username)
    return {
      ok: true,
      items: storeRef.listExperiences(username, { status: payload.status })
    }
  })

  ipcMain.handle('experiences:get', async (_event, payload = {}) => {
    const item = storeRef.getExperience(payload.id, usernameFrom(payload))
    if (!item) return { ok: false, error: { code: 'NOT_FOUND', message: 'Experience not found.' } }
    return { ok: true, item }
  })

  ipcMain.handle('experiences:update', async (_event, payload = {}) => {
    if (!payload.id) return { ok: false, error: { code: 'BAD_REQUEST', message: 'Missing experience id.' } }
    const existing = storeRef.getExperience(payload.id, usernameFrom(payload))
    if (!existing) return { ok: false, error: { code: 'NOT_FOUND', message: 'Experience not found.' } }
    return {
      ok: true,
      item: storeRef.upsertExperience({
        ...existing,
        ...payload,
        username: usernameFrom(payload),
        updatedAt: new Date().toISOString()
      })
    }
  })

  ipcMain.handle('experiences:delete', async (_event, payload = {}) => ({
    ok: true,
    deleted: storeRef.deleteExperience(payload.id, usernameFrom(payload))
  }))

  ipcMain.handle('experiences:search', async (_event, payload = {}) => ({
    ok: true,
    items: storeRef.searchExperiences(usernameFrom(payload), payload.query, { status: payload.status })
  }))

  ipcMain.handle('experiences:export', async (_event, payload = {}) => ({
    ok: true,
    filename: `aionui-experiences-${new Date().toISOString().slice(0, 10)}.json`,
    payload: storeRef.exportExperiences(usernameFrom(payload))
  }))
}

module.exports = { register, usernameFrom }
