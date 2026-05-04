const { store } = require('../../store')
const { DEFAULT_PROJECT_SETTINGS } = require('./defaults')

function uniqueStrings(items = []) {
  return [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))]
}

function normalizeExtension(value) {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return ''
  return text.startsWith('.') ? text : `.${text}`
}

function normalizeSettings(projectId, patch = {}) {
  const current = {
    projectId,
    ...DEFAULT_PROJECT_SETTINGS,
    ...(patch || {})
  }

  return {
    projectId,
    watchEnabled: Boolean(current.watchEnabled),
    embeddingEnabled: Boolean(current.embeddingEnabled),
    debounceMs: Math.max(250, Number(current.debounceMs) || DEFAULT_PROJECT_SETTINGS.debounceMs),
    maxFileBytes: Math.max(1024, Number(current.maxFileBytes) || DEFAULT_PROJECT_SETTINGS.maxFileBytes),
    includeExtensions: uniqueStrings(current.includeExtensions || DEFAULT_PROJECT_SETTINGS.includeExtensions)
      .map(normalizeExtension)
      .filter(Boolean),
    includeFilenames: uniqueStrings(current.includeFilenames || DEFAULT_PROJECT_SETTINGS.includeFilenames),
    excludeGlobs: uniqueStrings(current.excludeGlobs || DEFAULT_PROJECT_SETTINGS.excludeGlobs),
    updatedAt: current.updatedAt || new Date().toISOString()
  }
}

class ProjectSettingsService {
  constructor(options = {}) {
    this.store = options.storeRef || store
    this.now = options.now || (() => new Date())
  }

  buildDefault(projectId) {
    return normalizeSettings(projectId, {
      ...DEFAULT_PROJECT_SETTINGS,
      updatedAt: this.now().toISOString()
    })
  }

  get(projectId) {
    return this.store.getProjectSettings(projectId) || null
  }

  getOrCreate(projectId) {
    const existing = this.get(projectId)
    if (existing) return normalizeSettings(projectId, existing)
    return this.store.upsertProjectSettings(this.buildDefault(projectId))
  }

  update(projectId, patch = {}) {
    const current = this.getOrCreate(projectId)
    return this.store.upsertProjectSettings(normalizeSettings(projectId, {
      ...current,
      ...(patch || {}),
      updatedAt: this.now().toISOString()
    }))
  }

  reset(projectId) {
    return this.store.upsertProjectSettings(this.buildDefault(projectId))
  }
}

module.exports = {
  ProjectSettingsService,
  normalizeSettings,
  DEFAULT_PROJECT_SETTINGS
}
