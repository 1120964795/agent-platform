const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

let electronApp = null
try {
  const electron = require('electron')
  electronApp = electron && typeof electron === 'object' ? electron.app : null
} catch {
  electronApp = null
}

const userData = electronApp && typeof electronApp.getPath === 'function'
  ? electronApp.getPath('userData')
  : os.tmpdir()

const DATA_DIR = process.env.AGENTDEV_DATA_DIR || path.join(userData, 'agentdev-lite', 'data')
const GENERATED_DIR = process.env.AGENTDEV_GENERATED_DIR || path.join(path.dirname(DATA_DIR), 'generated')
const CONFIG_PATH = path.join(DATA_DIR, 'config.json')
const DATA_PATH = path.join(DATA_DIR, 'data.json')
const AUTH_PATH = path.join(DATA_DIR, 'auth.json')
const EXPERIENCES_PATH = path.join(DATA_DIR, 'experiences.json')
const DIAGNOSTICS_PATH = path.join(DATA_DIR, 'diagnostics.json')
const PROJECTS_PATH = path.join(DATA_DIR, 'projects.json')

const DEFAULT_CONFIG = {
  modelProvider: 'deepseek',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  qwenApiKey: '',
  qwenBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  qwenModel: 'qwen-plus',
  embeddingModel: '',
  temperature: 0.7,
  permissionMode: 'default',
  workspace_root: os.homedir(),
  shell_whitelist_extra: [],
  shell_blacklist_extra: [],
  session_confirm_cache_enabled: true,
  advancedRiskExecutionEnabled: false,
  lastExperienceCleanupDate: ''
}

const DEFAULT_DATA = {
  version: 1,
  conversations: [],
  artifacts: [],
  scheduledTasks: []
}

const DEFAULT_AUTH = {
  version: 1,
  accounts: [],
  loginHistory: [],
  loginPrefs: {
    username: '',
    password: '',
    rememberPassword: false,
    autoLogin: false
  },
  session: null
}

const DEFAULT_EXPERIENCES = {
  version: 1,
  experiences: []
}

const DEFAULT_DIAGNOSTICS = {
  version: 1,
  diagnostics: []
}

const DEFAULT_PROJECTS = {
  version: 1,
  projects: [],
  settings: [],
  profiles: [],
  files: [],
  chunks: [],
  indexStats: [],
  patchRecords: []
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeConfig(config = {}) {
  const next = { ...DEFAULT_CONFIG, ...config }
  if (next.modelProvider === 'minimax') next.modelProvider = 'qwen'
  delete next.minimaxApiKey
  delete next.minimaxBaseUrl
  delete next.minimaxModel
  return next
}

function normalizeUsername(username) {
  return String(username || 'guest').trim() || 'guest'
}

function normalizeRecordUsername(record, fallback = 'guest') {
  return normalizeUsername(record?.username || fallback)
}

function normalizePathForCompare(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const pathApi = (process.platform === 'win32' || /^[a-zA-Z]:($|[\\/])/.test(text) || /^\\\\/.test(text))
    ? path.win32
    : path
  return pathApi.normalize(text).replace(/[\\/]+$/, '').toLowerCase()
}

function normalizeProjectRelativePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '')
}

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true })
}

function readJson(filePath, fallback) {
  ensureDirs()
  if (!fs.existsSync(filePath)) {
    const initial = clone(fallback)
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), 'utf-8')
    return initial
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (error) {
    console.error('[store] parse error, using fallback:', filePath, error.message)
    return clone(fallback)
  }
}

function writeJson(filePath, value) {
  ensureDirs()
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8')
}

const store = {
  genId: (prefix = '') => prefix + crypto.randomUUID(),

  DATA_DIR,
  GENERATED_DIR,

  getConfig() {
    return normalizeConfig(readJson(CONFIG_PATH, DEFAULT_CONFIG))
  },

  setConfig(patch) {
    const next = { ...this.getConfig(), ...(patch || {}) }
    writeJson(CONFIG_PATH, next)
    return next
  },

  getUserConfig(username) {
    const config = this.getConfig()
    const userKey = normalizeUsername(username)
    const userConfigs = config.userConfigs && typeof config.userConfigs === 'object'
      ? config.userConfigs
      : {}

    return normalizeConfig(userConfigs[userKey] || {})
  },

  setUserConfig(username, patch) {
    const userKey = normalizeUsername(username)
    const config = this.getConfig()
    const userConfigs = config.userConfigs && typeof config.userConfigs === 'object'
      ? config.userConfigs
      : {}
    const currentUserConfig = userConfigs[userKey] || {}
    const nextUserConfig = { ...currentUserConfig, ...(patch || {}) }
    const next = {
      ...config,
      userConfigs: {
        ...userConfigs,
        [userKey]: nextUserConfig
      }
    }

    writeJson(CONFIG_PATH, next)
    return { ...DEFAULT_CONFIG, ...nextUserConfig }
  },

  getMaskedConfig(username) {
    const config = username ? this.getUserConfig(username) : this.getConfig()
    const key = config.apiKey || ''
    const qwenKey = config.qwenApiKey || ''
    const { userConfigs, ...safeConfig } = config
    return {
      ...safeConfig,
      apiKey: key.length > 10 ? `${key.slice(0, 6)}***${key.slice(-4)}` : (key ? '***' : ''),
      qwenApiKey: qwenKey.length > 10 ? `${qwenKey.slice(0, 6)}***${qwenKey.slice(-4)}` : (qwenKey ? '***' : '')
    }
  },

  getData() {
    return readJson(DATA_PATH, DEFAULT_DATA)
  },

  saveData(data) {
    writeJson(DATA_PATH, data)
  },

  getAuth() {
    return readJson(AUTH_PATH, DEFAULT_AUTH)
  },

  saveAuth(auth) {
    writeJson(AUTH_PATH, auth)
  },

  getExperiencesData() {
    return readJson(EXPERIENCES_PATH, DEFAULT_EXPERIENCES)
  },

  saveExperiencesData(data) {
    writeJson(EXPERIENCES_PATH, {
      version: 1,
      experiences: Array.isArray(data?.experiences) ? data.experiences : []
    })
  },

  listExperiences(username, filters = {}) {
    const userKey = normalizeUsername(username)
    let items = this.getExperiencesData().experiences
      .filter((item) => normalizeRecordUsername(item) === userKey)
    if (filters.status) items = items.filter((item) => item.status === filters.status)
    return items.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
  },

  getExperience(id, username) {
    const userKey = normalizeUsername(username)
    return this.getExperiencesData().experiences
      .find((item) => item.id === id && normalizeRecordUsername(item) === userKey) || null
  },

  upsertExperience(experience) {
    const data = this.getExperiencesData()
    const now = new Date().toISOString()
    const normalizedUsername = normalizeUsername(experience?.username)
    const existing = data.experiences.find((item) => {
      if (experience?.id) {
        return item.id === experience.id && normalizeRecordUsername(item) === normalizedUsername
      }
      return item.errorSignature && experience?.errorSignature &&
        item.errorSignature === experience.errorSignature &&
        normalizeRecordUsername(item) === normalizedUsername
    })
    const next = {
      status: 'draft',
      sceneType: 'development',
      errorKeywords: [],
      projectDirs: [],
      commands: [],
      notes: [],
      successCount: 0,
      createdAt: now,
      updatedAt: now,
      ...(experience || {})
    }
    next.username = normalizedUsername
    next.id = next.id || existing?.id || this.genId('exp_')
    next.createdAt = existing?.createdAt || next.createdAt || now
    next.updatedAt = experience?.updatedAt || now
    const index = data.experiences.findIndex((item) => item.id === next.id && normalizeRecordUsername(item) === next.username)
    if (index === -1) data.experiences.unshift(next)
    else data.experiences[index] = { ...data.experiences[index], ...next }
    this.saveExperiencesData(data)
    return next
  },

  findExperienceBySignature(username, errorSignature) {
    const userKey = normalizeUsername(username)
    return this.getExperiencesData().experiences.find((item) => (
      item.errorSignature === errorSignature && normalizeRecordUsername(item) === userKey
    )) || null
  },

  deleteExperience(id, username) {
    const userKey = normalizeUsername(username)
    const data = this.getExperiencesData()
    const before = data.experiences.length
    data.experiences = data.experiences.filter((item) => !(item.id === id && normalizeRecordUsername(item) === userKey))
    this.saveExperiencesData(data)
    return data.experiences.length !== before
  },

  searchExperiences(username, query, filters = {}) {
    const needle = String(query || '').trim().toLowerCase()
    const items = this.listExperiences(username, filters)
    if (!needle) return items
    return items.filter((item) => {
      const haystack = [
        item.title,
        item.errorSignature,
        item.originalError,
        item.cause,
        ...(item.errorKeywords || []),
        ...(item.projectDirs || []),
        ...(item.notes || [])
      ].filter(Boolean).join('\n').toLowerCase()
      return haystack.includes(needle)
    })
  },

  getDiagnosticsData() {
    return readJson(DIAGNOSTICS_PATH, DEFAULT_DIAGNOSTICS)
  },

  saveDiagnosticsData(data) {
    writeJson(DIAGNOSTICS_PATH, {
      version: 1,
      diagnostics: Array.isArray(data?.diagnostics) ? data.diagnostics.slice(0, 200) : []
    })
  },

  listDiagnostics(username) {
    const userKey = normalizeUsername(username)
    return this.getDiagnosticsData().diagnostics
      .filter((item) => normalizeRecordUsername(item) === userKey)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  },

  getDiagnosis(id, username) {
    const userKey = normalizeUsername(username)
    return this.getDiagnosticsData().diagnostics
      .find((item) => item.id === id && normalizeRecordUsername(item) === userKey) || null
  },

  upsertDiagnosis(diagnosis) {
    const data = this.getDiagnosticsData()
    const now = new Date().toISOString()
    const normalizedUsername = normalizeUsername(diagnosis?.username)
    const existing = data.diagnostics.find((item) => item.id === diagnosis?.id && normalizeRecordUsername(item) === normalizedUsername)
    const next = {
      createdAt: now,
      ...(diagnosis || {})
    }
    next.username = normalizedUsername
    next.id = next.id || this.genId('diag_')
    next.createdAt = existing?.createdAt || next.createdAt || now
    const index = data.diagnostics.findIndex((item) => item.id === next.id && normalizeRecordUsername(item) === next.username)
    if (index === -1) data.diagnostics.unshift(next)
    else data.diagnostics[index] = { ...data.diagnostics[index], ...next }
    this.saveDiagnosticsData(data)
    return next
  },

  deleteOldDiagnostics(limit = 200) {
    const data = this.getDiagnosticsData()
    data.diagnostics = data.diagnostics
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, Number(limit) || 200)
    this.saveDiagnosticsData(data)
    return data.diagnostics.length
  },

  getProjectsData() {
    const data = readJson(PROJECTS_PATH, DEFAULT_PROJECTS)
    return {
      version: 1,
      projects: Array.isArray(data.projects) ? data.projects : [],
      settings: Array.isArray(data.settings) ? data.settings : [],
      profiles: Array.isArray(data.profiles) ? data.profiles : [],
      files: Array.isArray(data.files) ? data.files : [],
      chunks: Array.isArray(data.chunks) ? data.chunks : [],
      indexStats: Array.isArray(data.indexStats) ? data.indexStats : [],
      patchRecords: Array.isArray(data.patchRecords) ? data.patchRecords : []
    }
  },

  saveProjectsData(data) {
    writeJson(PROJECTS_PATH, {
      version: 1,
      projects: Array.isArray(data?.projects) ? data.projects : [],
      settings: Array.isArray(data?.settings) ? data.settings : [],
      profiles: Array.isArray(data?.profiles) ? data.profiles : [],
      files: Array.isArray(data?.files) ? data.files : [],
      chunks: Array.isArray(data?.chunks) ? data.chunks : [],
      indexStats: Array.isArray(data?.indexStats) ? data.indexStats : [],
      patchRecords: Array.isArray(data?.patchRecords) ? data.patchRecords : []
    })
  },

  listProjects(username) {
    const userKey = normalizeUsername(username)
    return this.getProjectsData().projects
      .filter((item) => normalizeRecordUsername(item) === userKey)
      .sort((a, b) => new Date(b.lastOpenedAt || b.createdAt || 0) - new Date(a.lastOpenedAt || a.createdAt || 0))
  },

  getProject(id, username) {
    const userKey = normalizeUsername(username)
    return this.getProjectsData().projects
      .find((item) => item.id === id && normalizeRecordUsername(item) === userKey) || null
  },

  findProjectByRoot(username, rootPath) {
    const userKey = normalizeUsername(username)
    const rootKey = normalizePathForCompare(rootPath)
    return this.getProjectsData().projects.find((item) => (
      normalizeRecordUsername(item) === userKey &&
      normalizePathForCompare(item.rootPath) === rootKey
    )) || null
  },

  upsertProject(project) {
    const data = this.getProjectsData()
    const now = new Date().toISOString()
    const username = normalizeUsername(project?.username)
    const rootPath = String(project?.rootPath || '').trim()
    const existing = project?.id
      ? data.projects.find((item) => item.id === project.id && normalizeRecordUsername(item) === username)
      : this.findProjectByRoot(username, rootPath)
    const next = {
      createdAt: now,
      lastOpenedAt: now,
      ...(existing || {}),
      ...(project || {})
    }
    next.username = username
    next.id = next.id || existing?.id || this.genId('proj_')
    next.rootPath = rootPath || existing?.rootPath || ''
    next.name = String(next.name || path.basename(next.rootPath) || 'Project')
    next.createdAt = existing?.createdAt || next.createdAt || now
    next.lastOpenedAt = project?.lastOpenedAt || now

    const index = data.projects.findIndex((item) => item.id === next.id && normalizeRecordUsername(item) === username)
    if (index === -1) data.projects.unshift(next)
    else data.projects[index] = { ...data.projects[index], ...next }
    this.saveProjectsData(data)
    return next
  },

  removeProject(id, username) {
    const userKey = normalizeUsername(username)
    const data = this.getProjectsData()
    const existing = data.projects.find((item) => item.id === id && normalizeRecordUsername(item) === userKey)
    if (!existing) return false
    data.projects = data.projects.filter((item) => !(item.id === id && normalizeRecordUsername(item) === userKey))
    data.settings = data.settings.filter((item) => item.projectId !== id)
    data.profiles = data.profiles.filter((item) => item.projectId !== id)
    data.files = data.files.filter((item) => item.projectId !== id)
    data.chunks = data.chunks.filter((item) => item.projectId !== id)
    data.indexStats = data.indexStats.filter((item) => item.projectId !== id)
    data.patchRecords = data.patchRecords.filter((item) => item.projectId !== id)
    this.saveProjectsData(data)
    return true
  },

  getProjectSettings(projectId) {
    return this.getProjectsData().settings.find((item) => item.projectId === projectId) || null
  },

  upsertProjectSettings(settings) {
    const data = this.getProjectsData()
    const now = new Date().toISOString()
    const next = {
      ...(settings || {}),
      projectId: settings?.projectId,
      updatedAt: settings?.updatedAt || now
    }
    const index = data.settings.findIndex((item) => item.projectId === next.projectId)
    if (index === -1) data.settings.push(next)
    else data.settings[index] = { ...data.settings[index], ...next }
    this.saveProjectsData(data)
    return next
  },

  getProjectProfile(projectId) {
    return this.getProjectsData().profiles.find((item) => item.projectId === projectId) || null
  },

  upsertProjectProfile(profile) {
    const data = this.getProjectsData()
    const now = new Date().toISOString()
    const next = {
      ...(profile || {}),
      projectId: profile?.projectId,
      updatedAt: profile?.updatedAt || now
    }
    const index = data.profiles.findIndex((item) => item.projectId === next.projectId)
    if (index === -1) data.profiles.push(next)
    else data.profiles[index] = { ...data.profiles[index], ...next }
    this.saveProjectsData(data)
    return next
  },

  listProjectFiles(projectId) {
    return this.getProjectsData().files.filter((item) => item.projectId === projectId)
  },

  listProjectChunks(projectId) {
    return this.getProjectsData().chunks.filter((item) => item.projectId === projectId)
  },

  getProjectIndexStats(projectId) {
    return this.getProjectsData().indexStats.find((item) => item.projectId === projectId) || null
  },

  upsertProjectIndexStats(stats) {
    const data = this.getProjectsData()
    const now = new Date().toISOString()
    const next = {
      status: 'idle',
      fileCount: 0,
      chunkCount: 0,
      ftsRowCount: 0,
      failedFiles: 0,
      pendingFiles: 0,
      processedFiles: 0,
      lastError: '',
      ...(stats || {}),
      projectId: stats?.projectId,
      updatedAt: stats?.updatedAt || now
    }
    const index = data.indexStats.findIndex((item) => item.projectId === next.projectId)
    if (index === -1) data.indexStats.push(next)
    else data.indexStats[index] = { ...data.indexStats[index], ...next }
    this.saveProjectsData(data)
    return next
  },

  clearProjectIndex(projectId) {
    const data = this.getProjectsData()
    data.files = data.files.filter((item) => item.projectId !== projectId)
    data.chunks = data.chunks.filter((item) => item.projectId !== projectId)
    const now = new Date().toISOString()
    const nextStats = {
      projectId,
      status: 'cleared',
      fileCount: 0,
      chunkCount: 0,
      ftsRowCount: 0,
      failedFiles: 0,
      pendingFiles: 0,
      processedFiles: 0,
      lastError: '',
      updatedAt: now,
      lastIndexedAt: ''
    }
    const index = data.indexStats.findIndex((item) => item.projectId === projectId)
    if (index === -1) data.indexStats.push(nextStats)
    else data.indexStats[index] = { ...data.indexStats[index], ...nextStats }
    this.saveProjectsData(data)
    return nextStats
  },

  replaceProjectFileIndex(projectId, files, chunks, stats = {}) {
    const data = this.getProjectsData()
    data.files = data.files.filter((item) => item.projectId !== projectId)
    data.chunks = data.chunks.filter((item) => item.projectId !== projectId)
    data.files.push(...(Array.isArray(files) ? files : []))
    data.chunks.push(...(Array.isArray(chunks) ? chunks : []))

    const now = new Date().toISOString()
    const nextStats = {
      projectId,
      status: 'indexed',
      fileCount: data.files.filter((item) => item.projectId === projectId).length,
      chunkCount: data.chunks.filter((item) => item.projectId === projectId).length,
      ftsRowCount: data.chunks.filter((item) => item.projectId === projectId).length,
      failedFiles: 0,
      pendingFiles: 0,
      processedFiles: data.files.filter((item) => item.projectId === projectId).length,
      lastError: '',
      ...(stats || {}),
      updatedAt: stats.updatedAt || now,
      lastIndexedAt: stats.lastIndexedAt || now
    }
    const index = data.indexStats.findIndex((item) => item.projectId === projectId)
    if (index === -1) data.indexStats.push(nextStats)
    else data.indexStats[index] = { ...data.indexStats[index], ...nextStats }
    this.saveProjectsData(data)
    return nextStats
  },

  mergeProjectFileIndex(projectId, files = [], chunks = [], removedPaths = [], stats = {}) {
    const data = this.getProjectsData()
    const touched = new Set([
      ...(removedPaths || []),
      ...(files || []).map((item) => item.relativePath)
    ].map(normalizeProjectRelativePath).filter(Boolean))

    if (touched.size > 0) {
      data.files = data.files.filter((item) => (
        item.projectId !== projectId || !touched.has(normalizeProjectRelativePath(item.relativePath))
      ))
      data.chunks = data.chunks.filter((item) => (
        item.projectId !== projectId || !touched.has(normalizeProjectRelativePath(item.relativePath))
      ))
    }

    data.files.push(...(Array.isArray(files) ? files : []))
    data.chunks.push(...(Array.isArray(chunks) ? chunks : []))

    const now = new Date().toISOString()
    const fileCount = data.files.filter((item) => item.projectId === projectId).length
    const chunkCount = data.chunks.filter((item) => item.projectId === projectId).length
    const nextStats = {
      projectId,
      status: 'indexed',
      fileCount,
      chunkCount,
      ftsRowCount: chunkCount,
      failedFiles: 0,
      pendingFiles: 0,
      processedFiles: touched.size,
      lastError: '',
      ...(stats || {}),
      fileCount,
      chunkCount,
      ftsRowCount: chunkCount,
      updatedAt: stats.updatedAt || now,
      lastIndexedAt: stats.lastIndexedAt || now
    }
    const index = data.indexStats.findIndex((item) => item.projectId === projectId)
    if (index === -1) data.indexStats.push(nextStats)
    else data.indexStats[index] = { ...data.indexStats[index], ...nextStats }
    this.saveProjectsData(data)
    return nextStats
  },

  listPatchRecords(projectId) {
    return this.getProjectsData().patchRecords
      .filter((item) => item.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  },

  getPatchRecord(projectId, id) {
    return this.getProjectsData().patchRecords
      .find((item) => item.projectId === projectId && item.id === id) || null
  },

  upsertPatchRecord(record) {
    const data = this.getProjectsData()
    const now = new Date().toISOString()
    const next = {
      status: 'draft',
      affectedFiles: [],
      createdAt: now,
      ...(record || {})
    }
    next.id = next.id || this.genId('patch_')
    next.createdAt = record?.createdAt || next.createdAt || now
    next.updatedAt = record?.updatedAt || now
    const index = data.patchRecords.findIndex((item) => item.projectId === next.projectId && item.id === next.id)
    if (index === -1) data.patchRecords.unshift(next)
    else data.patchRecords[index] = { ...data.patchRecords[index], ...next }
    this.saveProjectsData(data)
    return next
  },

  cleanupExpiredExperiences({ now = new Date(), username } = {}) {
    const cutoff = now.getTime() - (30 * 24 * 60 * 60 * 1000)
    const data = this.getExperiencesData()
    const before = data.experiences.length
    const userKey = username ? normalizeUsername(username) : ''
    data.experiences = data.experiences.filter((item) => {
      if (userKey && normalizeRecordUsername(item) !== userKey) return true
      if (item.pinned || item.status === 'resolved') return true
      const updatedAt = new Date(item.updatedAt || item.createdAt || 0).getTime()
      return updatedAt >= cutoff
    })
    this.saveExperiencesData(data)
    return { removed: before - data.experiences.length }
  },

  exportExperiences(username, { now = new Date() } = {}) {
    return {
      version: 1,
      exportedAt: now.toISOString(),
      username: normalizeUsername(username),
      experiences: this.listExperiences(username)
    }
  },

  upsertConversation(conversation) {
    const data = this.getData()
    const index = data.conversations.findIndex((item) => item.id === conversation.id)
    if (index === -1) data.conversations.unshift(conversation)
    else data.conversations[index] = conversation
    this.saveData(data)
    return conversation
  },

  getConversation(id) {
    return this.getData().conversations.find((item) => item.id === id)
  },

  listConversations() {
    return this.getData().conversations
  },

  addArtifact(artifact) {
    const data = this.getData()
    const next = {
      ...(artifact || {}),
      username: normalizeUsername(artifact?.username),
      id: artifact?.id || this.genId('artifact_')
    }
    data.artifacts = data.artifacts.filter((item) => {
      if (next.id && item.id === next.id) return false
      if (next.path && item.path === next.path && normalizeRecordUsername(item) === next.username) return false
      return true
    })
    data.artifacts.unshift(next)
    this.saveData(data)
    return next
  },

  listArtifacts(username) {
    const artifacts = this.getData().artifacts
    if (!username) return artifacts
    const userKey = normalizeUsername(username)
    return artifacts.filter((item) => normalizeRecordUsername(item) === userKey)
  },

  getArtifact(id, username) {
    const userKey = normalizeUsername(username)
    return this.getData().artifacts.find((item) => (
      item.id === id && normalizeRecordUsername(item) === userKey
    )) || null
  },

  deleteArtifact(id, username) {
    const userKey = normalizeUsername(username)
    const data = this.getData()
    const existing = data.artifacts.find((item) => (
      item.id === id && normalizeRecordUsername(item) === userKey
    ))
    if (!existing) return null
    data.artifacts = data.artifacts.filter((item) => !(
      item.id === id && normalizeRecordUsername(item) === userKey
    ))
    this.saveData(data)
    return existing
  },

  listScheduledTasks() {
    return this.getData().scheduledTasks
  },

  upsertScheduledTask(task) {
    const data = this.getData()
    const index = data.scheduledTasks.findIndex((item) => item.id === task.id)
    if (index === -1) data.scheduledTasks.push(task)
    else data.scheduledTasks[index] = task
    this.saveData(data)
    return task
  },

  removeScheduledTask(id) {
    const data = this.getData()
    data.scheduledTasks = data.scheduledTasks.filter((item) => item.id !== id)
    this.saveData(data)
  },

  appendTaskHistory(taskId, entry) {
    const data = this.getData()
    const task = data.scheduledTasks.find((item) => item.id === taskId)
    if (!task) return
    task.history = task.history || []
    task.history.unshift(entry)
    if (task.history.length > 20) task.history.length = 20
    task.lastRun = entry.runAt
    this.saveData(data)
  }
}

module.exports = {
  store,
  DEFAULT_CONFIG,
  DEFAULT_DATA,
  DEFAULT_AUTH,
  DEFAULT_EXPERIENCES,
  DEFAULT_DIAGNOSTICS,
  DEFAULT_PROJECTS
}
