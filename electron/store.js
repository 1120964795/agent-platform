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

const DEFAULT_CONFIG = {
  modelProvider: 'deepseek',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  minimaxApiKey: '',
  minimaxBaseUrl: 'https://api.minimax.io',
  minimaxModel: 'MiniMax-M2.7',
  temperature: 0.7,
  permissionMode: 'default',
  workspace_root: os.homedir(),
  shell_whitelist_extra: [],
  shell_blacklist_extra: [],
  session_confirm_cache_enabled: true
}

const DEFAULT_DATA = {
  version: 1,
  conversations: [],
  artifacts: [],
  scheduledTasks: [],
  projects: [],
  projectSettings: [],
  projectProfiles: [],
  projectIndex: [],
  patchRecords: [],
  diagnostics: [],
  experiences: [],
  ignoredDiagnosisSignatures: [],
  diagnosticsSession: {
    status: 'stopped',
    target: null,
    lastError: ''
  },
  workflowTemplateSources: []
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

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeUsername(username) {
  return String(username || 'guest').trim() || 'guest'
}

function recordUsername(record, fallback = 'guest') {
  return normalizeUsername(record?.username || fallback)
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
    return { ...DEFAULT_CONFIG, ...readJson(CONFIG_PATH, DEFAULT_CONFIG) }
  },

  setConfig(patch) {
    const next = { ...this.getConfig(), ...(patch || {}) }
    writeJson(CONFIG_PATH, next)
    return next
  },

  getMaskedConfig() {
    const config = this.getConfig()
    const key = config.apiKey || ''
    const minimaxKey = config.minimaxApiKey || ''
    return {
      ...config,
      apiKey: key.length > 10 ? `${key.slice(0, 6)}***${key.slice(-4)}` : (key ? '***' : ''),
      minimaxApiKey: minimaxKey.length > 10 ? `${minimaxKey.slice(0, 6)}***${minimaxKey.slice(-4)}` : (minimaxKey ? '***' : '')
    }
  },

  getData() {
    return { ...clone(DEFAULT_DATA), ...readJson(DATA_PATH, DEFAULT_DATA) }
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

  listProjects(username) {
    const userKey = normalizeUsername(username)
    return this.getData().projects
      .filter((item) => recordUsername(item) === userKey)
      .sort((a, b) => new Date(b.lastOpenedAt || b.createdAt || 0) - new Date(a.lastOpenedAt || a.createdAt || 0))
  },

  getProject(projectId, username) {
    const userKey = normalizeUsername(username)
    return this.getData().projects.find((item) => item.id === projectId && recordUsername(item) === userKey) || null
  },

  upsertProject(project) {
    const data = this.getData()
    const userKey = normalizeUsername(project?.username)
    const next = { ...(project || {}), username: userKey }
    const index = data.projects.findIndex((item) => item.id === next.id && recordUsername(item) === userKey)
    if (index === -1) data.projects.unshift(next)
    else data.projects[index] = { ...data.projects[index], ...next }
    this.saveData(data)
    return next
  },

  removeProject(projectId, username) {
    const data = this.getData()
    const userKey = normalizeUsername(username)
    data.projects = data.projects.filter((item) => !(item.id === projectId && recordUsername(item) === userKey))
    data.projectSettings = data.projectSettings.filter((item) => item.projectId !== projectId)
    data.projectProfiles = data.projectProfiles.filter((item) => item.projectId !== projectId)
    data.projectIndex = data.projectIndex.filter((item) => item.projectId !== projectId)
    data.patchRecords = data.patchRecords.filter((item) => item.projectId !== projectId)
    this.saveData(data)
  },

  getProjectSettings(projectId) {
    return this.getData().projectSettings.find((item) => item.projectId === projectId) || null
  },

  upsertProjectSettings(settings) {
    const data = this.getData()
    const index = data.projectSettings.findIndex((item) => item.projectId === settings.projectId)
    if (index === -1) data.projectSettings.push(settings)
    else data.projectSettings[index] = { ...data.projectSettings[index], ...settings }
    this.saveData(data)
    return settings
  },

  getProjectProfile(projectId) {
    return this.getData().projectProfiles.find((item) => item.projectId === projectId) || null
  },

  upsertProjectProfile(profile) {
    const data = this.getData()
    const index = data.projectProfiles.findIndex((item) => item.projectId === profile.projectId)
    if (index === -1) data.projectProfiles.push(profile)
    else data.projectProfiles[index] = { ...data.projectProfiles[index], ...profile }
    this.saveData(data)
    return profile
  },

  replaceProjectIndex(projectId, entries) {
    const data = this.getData()
    data.projectIndex = data.projectIndex.filter((item) => item.projectId !== projectId)
    data.projectIndex.push(...entries)
    this.saveData(data)
    return entries
  },

  clearProjectIndex(projectId) {
    return this.replaceProjectIndex(projectId, [])
  },

  listProjectIndex(projectId) {
    return this.getData().projectIndex.filter((item) => item.projectId === projectId)
  },

  upsertPatchRecord(record) {
    const data = this.getData()
    const index = data.patchRecords.findIndex((item) => item.id === record.id)
    if (index === -1) data.patchRecords.unshift(record)
    else data.patchRecords[index] = { ...data.patchRecords[index], ...record }
    this.saveData(data)
    return record
  },

  listPatchRecords(projectId) {
    return this.getData().patchRecords.filter((item) => item.projectId === projectId)
  },

  listDiagnostics(username) {
    const userKey = normalizeUsername(username)
    return this.getData().diagnostics
      .filter((item) => recordUsername(item) === userKey)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  },

  getDiagnosis(diagnosisId, username) {
    const userKey = normalizeUsername(username)
    return this.getData().diagnostics.find((item) => item.id === diagnosisId && recordUsername(item) === userKey) || null
  },

  upsertDiagnosis(diagnosis) {
    const data = this.getData()
    const next = { ...(diagnosis || {}), username: normalizeUsername(diagnosis?.username) }
    const index = data.diagnostics.findIndex((item) => item.id === next.id)
    if (index === -1) data.diagnostics.unshift(next)
    else data.diagnostics[index] = { ...data.diagnostics[index], ...next }
    this.saveData(data)
    return next
  },

  listExperiences(username, filters = {}) {
    const userKey = normalizeUsername(username)
    let items = this.getData().experiences.filter((item) => recordUsername(item) === userKey)
    if (filters.status) items = items.filter((item) => item.status === filters.status)
    return items.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
  },

  getExperience(experienceId, username) {
    const userKey = normalizeUsername(username)
    return this.getData().experiences.find((item) => item.id === experienceId && recordUsername(item) === userKey) || null
  },

  findExperienceBySignature(username, errorSignature) {
    const userKey = normalizeUsername(username)
    return this.getData().experiences.find((item) => item.errorSignature === errorSignature && recordUsername(item) === userKey) || null
  },

  upsertExperience(experience) {
    const data = this.getData()
    const next = { ...(experience || {}), username: normalizeUsername(experience?.username) }
    const index = data.experiences.findIndex((item) => item.id === next.id)
    if (index === -1) data.experiences.unshift(next)
    else data.experiences[index] = { ...data.experiences[index], ...next }
    this.saveData(data)
    return next
  },

  deleteExperience(experienceId, username) {
    const data = this.getData()
    const userKey = normalizeUsername(username)
    data.experiences = data.experiences.filter((item) => !(item.id === experienceId && recordUsername(item) === userKey))
    this.saveData(data)
  },

  searchExperiences(username, query, filters = {}) {
    const needle = String(query || '').trim().toLowerCase()
    const items = this.listExperiences(username, filters)
    if (!needle) return items
    return items.filter((item) => [
      item.title,
      item.errorSignature,
      item.summary,
      item.projectType,
      ...(item.commands || [])
    ].filter(Boolean).join('\n').toLowerCase().includes(needle))
  },

  getDiagnosticsSession() {
    return this.getData().diagnosticsSession || clone(DEFAULT_DATA.diagnosticsSession)
  },

  setDiagnosticsSession(session) {
    const data = this.getData()
    data.diagnosticsSession = { ...data.diagnosticsSession, ...(session || {}) }
    this.saveData(data)
    return data.diagnosticsSession
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
    data.artifacts.unshift(artifact)
    this.saveData(data)
    return artifact
  },

  listArtifacts() {
    return this.getData().artifacts
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

module.exports = { store, DEFAULT_CONFIG, DEFAULT_DATA, DEFAULT_AUTH }
