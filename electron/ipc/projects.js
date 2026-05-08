const { store } = require('../store')
const { createProjectServices, getProjectIndexSchemaSql } = require('../services/projects')

function usernameFrom(payload = {}) {
  return typeof payload.username === 'string' ? payload.username : 'guest'
}

function error(code, message) {
  return { ok: false, error: { code, message } }
}

function asErrorResponse(errorValue) {
  return error(errorValue.code || 'PROJECT_ERROR', errorValue.message || 'Project request failed.')
}

function buildBundle(services, username, project) {
  if (!project) return null
  return {
    project,
    settings: services.settings.getOrCreate(project.id),
    profile: services.profiles.get(project.id) || null,
    indexStatus: services.indexer.store.getProjectIndexStats(project.id) || null,
    watcherStatus: services.watcher.status(project.id),
    indexQueueStatus: services.indexQueue.status(project.id)
  }
}

function getProjectOrError(services, payload = {}) {
  const username = usernameFrom(payload)
  const project = services.registry.get(username, payload.projectId || payload.id)
  if (!project) return { response: error('NOT_FOUND', 'Project not found.') }
  return { username, project }
}

function createRegister(overrides = {}) {
  const deps = {
    storeRef: store,
    services: null,
    ...overrides
  }
  const services = deps.services || createProjectServices({ storeRef: deps.storeRef })

  return function register(ipcMain) {
    ipcMain.handle('projects:list', async (_event, payload = {}) => {
      const username = usernameFrom(payload)
      return {
        ok: true,
        items: services.registry.list(username).map((project) => buildBundle(services, username, project))
      }
    })

    ipcMain.handle('projects:add', async (_event, payload = {}) => {
      try {
        const username = usernameFrom(payload)
        const project = services.registry.add({
          username,
          rootPath: payload.rootPath,
          name: payload.name
        })
        services.settings.getOrCreate(project.id)
        const profile = services.profiles.refresh(project)
        const settings = services.settings.getOrCreate(project.id)
        const indexStatus = await services.indexer.indexProject(project, settings)
        if (settings.watchEnabled) {
          services.watcher.start(project, settings, async (files) => {
            await services.indexQueue.enqueue(project, services.settings.getOrCreate(project.id), files || [])
          })
        }
        return {
          ok: true,
          project,
          settings,
          profile,
          indexStatus,
          watcherStatus: services.watcher.status(project.id),
          indexQueueStatus: services.indexQueue.status(project.id)
        }
      } catch (caught) {
        return asErrorResponse(caught)
      }
    })

    ipcMain.handle('projects:get', async (_event, payload = {}) => {
      const username = usernameFrom(payload)
      const project = services.registry.get(username, payload.projectId || payload.id)
      if (!project) return error('NOT_FOUND', 'Project not found.')
      return {
        ok: true,
        ...buildBundle(services, username, project)
      }
    })

    ipcMain.handle('projects:remove', async (_event, payload = {}) => ({
      ok: true,
      removed: services.registry.remove(usernameFrom(payload), payload.projectId || payload.id)
    }))

    ipcMain.handle('projects:settings:get', async (_event, payload = {}) => {
      const username = usernameFrom(payload)
      const project = services.registry.get(username, payload.projectId)
      if (!project) return error('NOT_FOUND', 'Project not found.')
      return {
        ok: true,
        settings: services.settings.getOrCreate(project.id)
      }
    })

    ipcMain.handle('projects:settings:update', async (_event, payload = {}) => {
      const username = usernameFrom(payload)
      const project = services.registry.get(username, payload.projectId)
      if (!project) return error('NOT_FOUND', 'Project not found.')
      const settings = services.settings.update(project.id, payload.patch || payload.settings || {})
      if (settings.watchEnabled) {
        services.watcher.start(project, settings, async (files) => {
          await services.indexQueue.enqueue(project, services.settings.getOrCreate(project.id), files || [])
        })
      } else {
        services.watcher.stop(project.id)
        services.indexQueue.pause(project.id)
      }
      return {
        ok: true,
        settings,
        watcherStatus: services.watcher.status(project.id),
        indexQueueStatus: services.indexQueue.status(project.id)
      }
    })

    ipcMain.handle('projects:profile:refresh', async (_event, payload = {}) => {
      const username = usernameFrom(payload)
      const project = services.registry.get(username, payload.projectId)
      if (!project) return error('NOT_FOUND', 'Project not found.')
      return {
        ok: true,
        profile: services.profiles.refresh(project)
      }
    })

    ipcMain.handle('projects:index:start', async (event, payload = {}) => {
      const found = getProjectOrError(services, payload)
      if (found.response) return found.response
      try {
        const settings = services.settings.getOrCreate(found.project.id)
        event.sender?.send?.('projects:event', {
          type: 'index-started',
          projectId: found.project.id
        })
        const profile = services.profiles.refresh(found.project)
        const indexStatus = await services.indexer.indexProject(found.project, settings)
        if (settings.watchEnabled) {
          services.watcher.start(found.project, settings, async (files) => {
            await services.indexQueue.enqueue(found.project, services.settings.getOrCreate(found.project.id), files || [])
          })
        }
        event.sender?.send?.('projects:event', {
          type: 'index-finished',
          projectId: found.project.id,
          indexStatus
        })
        return {
          ok: true,
          profile,
          indexStatus,
          watcherStatus: services.watcher.status(found.project.id),
          indexQueueStatus: services.indexQueue.status(found.project.id)
        }
      } catch (caught) {
        return asErrorResponse(caught)
      }
    })

    ipcMain.handle('projects:index:pause', async (_event, payload = {}) => {
      const found = getProjectOrError(services, payload)
      if (found.response) return found.response
      const watcherStatus = services.watcher.stop(found.project.id) || services.watcher.status(found.project.id)
      const indexQueueStatus = services.indexQueue.pause(found.project.id)
      const indexStatus = services.indexer.store.upsertProjectIndexStats({
        projectId: found.project.id,
        status: 'paused'
      })
      return { ok: true, indexStatus, watcherStatus, indexQueueStatus }
    })

    ipcMain.handle('projects:index:clear', async (_event, payload = {}) => {
      const found = getProjectOrError(services, payload)
      if (found.response) return found.response
      services.watcher.stop(found.project.id)
      services.indexQueue.pause(found.project.id)
      return {
        ok: true,
        indexStatus: await services.indexer.clear(found.project.id),
        watcherStatus: services.watcher.status(found.project.id),
        indexQueueStatus: services.indexQueue.status(found.project.id)
      }
    })

    ipcMain.handle('projects:index:status', async (_event, payload = {}) => {
      const found = getProjectOrError(services, payload)
      if (found.response) return found.response
      return {
        ok: true,
        indexStatus: services.indexer.store.getProjectIndexStats(found.project.id),
        watcherStatus: services.watcher.status(found.project.id),
        indexQueueStatus: services.indexQueue.status(found.project.id)
      }
    })

    ipcMain.handle('projects:search', async (_event, payload = {}) => {
      const found = getProjectOrError(services, payload)
      if (found.response) return found.response
      return {
        ok: true,
        ...(await services.search.search(found.project.id, payload.query || '', payload.filters || {}))
      }
    })

    ipcMain.handle('projects:ask', async (_event, payload = {}) => {
      const found = getProjectOrError(services, payload)
      if (found.response) return found.response
      const profile = services.profiles.get(found.project.id) || services.profiles.refresh(found.project)
      const settings = services.settings.getOrCreate(found.project.id)
      return {
        ok: true,
        result: await services.qa.answer({
          username: found.username,
          project: found.project,
          profile,
          settings,
          question: payload.question || payload.query || ''
        })
      }
    })

    ipcMain.handle('projects:patch:preview', async (_event, payload = {}) => {
      const found = getProjectOrError(services, payload)
      if (found.response) return found.response
      try {
        return {
          ok: true,
          patch: services.patch.preview(
            found.project,
            services.settings.getOrCreate(found.project.id),
            { ...payload, username: found.username }
          )
        }
      } catch (caught) {
        return asErrorResponse(caught)
      }
    })

    ipcMain.handle('projects:patch:apply', async (_event, payload = {}) => {
      const found = getProjectOrError(services, payload)
      if (found.response) return found.response
      try {
        const patch = services.patch.apply(
          found.project,
          services.settings.getOrCreate(found.project.id),
          { ...payload, username: found.username }
        )
        const profile = services.profiles.refresh(found.project)
        const indexStatus = await services.indexer.indexProject(found.project, services.settings.getOrCreate(found.project.id))
        return { ok: true, patch, profile, indexStatus }
      } catch (caught) {
        return asErrorResponse(caught)
      }
    })

    ipcMain.handle('projects:patch:list', async (_event, payload = {}) => {
      const found = getProjectOrError(services, payload)
      if (found.response) return found.response
      return {
        ok: true,
        items: services.patch.store.listPatchRecords(found.project.id)
      }
    })

    ipcMain.handle('projects:experiences:match', async (_event, payload = {}) => {
      const found = getProjectOrError(services, payload)
      if (found.response) return found.response
      const profile = services.profiles.get(found.project.id) || services.profiles.refresh(found.project)
      return {
        ok: true,
        items: services.migration.match({
          username: found.username,
          project: found.project,
          profile,
          query: payload.query || '',
          errorSignature: payload.errorSignature || ''
        })
      }
    })

    ipcMain.handle('projects:embedding:status', async (_event, payload = {}) => {
      const found = getProjectOrError(services, payload)
      if (found.response) return found.response
      const settings = services.settings.getOrCreate(found.project.id)
      const profile = services.profiles.get(found.project.id) || services.profiles.refresh(found.project)
      return {
        ok: true,
        status: await services.embedding.status({ project: found.project, profile, settings })
      }
    })

    ipcMain.handle('projects:embedding:refresh', async (_event, payload = {}) => {
      const found = getProjectOrError(services, payload)
      if (found.response) return found.response
      try {
        const settings = services.settings.getOrCreate(found.project.id)
        const profile = services.profiles.get(found.project.id) || services.profiles.refresh(found.project)
        return {
          ok: true,
          status: await services.embedding.refresh({
            username: found.username,
            project: found.project,
            profile,
            settings
          })
        }
      } catch (caught) {
        return asErrorResponse(caught)
      }
    })

    ipcMain.handle('projects:schema', async () => ({
      ok: true,
      schemaSql: getProjectIndexSchemaSql()
    }))
  }
}

function register(ipcMain, deps = {}) {
  return createRegister(deps)(ipcMain)
}

module.exports = {
  register,
  createRegister,
  usernameFrom
}
