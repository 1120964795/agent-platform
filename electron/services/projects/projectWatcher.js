const fs = require('fs')

class ProjectWatcher {
  constructor(options = {}) {
    this.fs = options.fsRef || fs
    this.setTimeout = options.setTimeout || setTimeout
    this.clearTimeout = options.clearTimeout || clearTimeout
    this.watchers = new Map()
  }

  start(project, settings, onBatch) {
    this.stop(project.id)
    const debounceMs = Number(settings?.debounceMs) || 3000
    const state = {
      projectId: project.id,
      watcher: null,
      timer: null,
      pending: new Set(),
      status: 'watching',
      lastError: ''
    }

    try {
      state.watcher = this.fs.watch(project.rootPath, { recursive: true }, (_eventType, filename) => {
        if (filename) state.pending.add(String(filename))
        state.status = 'waiting_idle'
        if (state.timer) this.clearTimeout(state.timer)
        state.timer = this.setTimeout(() => {
          const files = [...state.pending]
          state.pending.clear()
          state.status = 'indexing'
          Promise.resolve(onBatch?.(files))
            .then(() => {
              state.status = 'watching'
              state.lastError = ''
            })
            .catch((error) => {
              state.status = 'error'
              state.lastError = error.message || 'Watcher batch failed.'
            })
        }, debounceMs)
      })
    } catch (error) {
      state.status = 'error'
      state.lastError = error.message || 'Watcher failed.'
    }

    this.watchers.set(project.id, state)
    return this.status(project.id)
  }

  stop(projectId) {
    const state = this.watchers.get(projectId)
    if (!state) return null
    if (state.timer) this.clearTimeout(state.timer)
    try {
      state.watcher?.close?.()
    } catch {}
    this.watchers.delete(projectId)
    return { projectId, status: 'paused' }
  }

  status(projectId) {
    const state = this.watchers.get(projectId)
    if (!state) return { projectId, status: 'paused', pendingFiles: 0, lastError: '' }
    return {
      projectId,
      status: state.status,
      pendingFiles: state.pending.size,
      lastError: state.lastError
    }
  }

  dispose() {
    for (const projectId of [...this.watchers.keys()]) {
      this.stop(projectId)
    }
  }
}

module.exports = {
  ProjectWatcher
}
