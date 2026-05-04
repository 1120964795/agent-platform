const { ProjectIndexer } = require('./projectIndexer')

function uniquePaths(paths = []) {
  return [...new Set((paths || []).map((item) => String(item || '').trim()).filter(Boolean))]
}

class ProjectIndexQueue {
  constructor(options = {}) {
    this.indexer = options.indexer || new ProjectIndexer(options)
    this.profileService = options.profileService || null
    this.queues = new Map()
    this.now = options.now || (() => new Date())
  }

  getState(projectId) {
    if (!this.queues.has(projectId)) {
      this.queues.set(projectId, {
        projectId,
        status: 'idle',
        pending: new Set(),
        activePromise: null,
        processedFiles: 0,
        failedFiles: 0,
        lastError: '',
        lastUpdatedAt: ''
      })
    }
    return this.queues.get(projectId)
  }

  enqueue(project, settings, changedPaths = []) {
    const state = this.getState(project.id)
    for (const filePath of uniquePaths(changedPaths)) state.pending.add(filePath)
    state.status = state.activePromise ? 'indexing' : 'waiting_idle'
    state.lastUpdatedAt = this.now().toISOString()

    if (!state.activePromise) {
      state.activePromise = this.process(project, settings, state)
    }

    return state.activePromise
  }

  async process(project, settings, state) {
    let latestStats = null
    try {
      while (state.pending.size > 0) {
        const batch = [...state.pending]
        state.pending.clear()
        state.status = 'indexing'
        state.lastUpdatedAt = this.now().toISOString()
        latestStats = await this.indexer.indexChangedFiles(project, settings, batch)
        state.processedFiles = Number(latestStats?.processedFiles || 0)
        state.failedFiles = Number(latestStats?.failedFiles || 0)
        state.lastError = latestStats?.lastError || ''
        this.profileService?.refresh?.(project)
      }
      state.status = state.failedFiles > 0 ? 'error' : 'indexed'
      return latestStats
    } catch (error) {
      state.status = 'error'
      state.lastError = error.message || 'Incremental indexing failed.'
      throw error
    } finally {
      state.activePromise = null
      state.lastUpdatedAt = this.now().toISOString()
      if (state.pending.size > 0) {
        state.activePromise = this.process(project, settings, state)
      }
    }
  }

  pause(projectId) {
    const state = this.getState(projectId)
    state.pending.clear()
    state.status = 'paused'
    state.lastUpdatedAt = this.now().toISOString()
    return this.status(projectId)
  }

  status(projectId) {
    const state = this.getState(projectId)
    return {
      projectId,
      status: state.status,
      pendingFiles: state.pending.size,
      processedFiles: state.processedFiles,
      failedFiles: state.failedFiles,
      lastError: state.lastError,
      lastUpdatedAt: state.lastUpdatedAt
    }
  }
}

module.exports = {
  ProjectIndexQueue
}
