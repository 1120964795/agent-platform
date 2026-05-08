const fs = require('fs')
const path = require('path')
const { store } = require('../../store')
const { normalizeRootPath } = require('./pathUtils')

function usernameFrom(value) {
  return String(value || 'guest').trim() || 'guest'
}

function ensureDirectory(rootPath, fsRef = fs) {
  if (!rootPath) {
    const error = new Error('Missing project root path.')
    error.code = 'BAD_REQUEST'
    throw error
  }
  if (!fsRef.existsSync(rootPath)) {
    const error = new Error('Project directory does not exist.')
    error.code = 'PATH_NOT_FOUND'
    throw error
  }
  if (!fsRef.statSync(rootPath).isDirectory()) {
    const error = new Error('Project path must be a directory.')
    error.code = 'NOT_DIRECTORY'
    throw error
  }
}

class ProjectRegistry {
  constructor(options = {}) {
    this.store = options.storeRef || store
    this.fs = options.fsRef || fs
    this.now = options.now || (() => new Date())
  }

  list(username) {
    return this.store.listProjects(usernameFrom(username))
  }

  get(username, projectId) {
    return this.store.getProject(projectId, usernameFrom(username))
  }

  add(payload = {}) {
    const username = usernameFrom(payload.username)
    const rootPath = normalizeRootPath(payload.rootPath)
    ensureDirectory(rootPath, this.fs)

    const existing = this.store.findProjectByRoot(username, rootPath)
    return this.store.upsertProject({
      ...(existing || {}),
      username,
      rootPath,
      name: String(payload.name || existing?.name || path.basename(rootPath) || 'Project'),
      lastOpenedAt: this.now().toISOString()
    })
  }

  touch(username, projectId) {
    const project = this.get(username, projectId)
    if (!project) return null
    return this.store.upsertProject({
      ...project,
      lastOpenedAt: this.now().toISOString()
    })
  }

  remove(username, projectId) {
    return this.store.removeProject(projectId, usernameFrom(username))
  }
}

module.exports = {
  ProjectRegistry,
  ensureDirectory,
  usernameFrom
}
