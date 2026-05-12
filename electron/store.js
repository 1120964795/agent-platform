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
const CONFIG_SCHEMA_VERSION = 2

const DEPRECATED_CONFIG_KEYS = new Set([
  'qwenApiKey',
  'qwenBaseUrl',
  'qwenPrimaryModel',
  'qwenCodingModel',
  'qwenVisionEndpoint',
  'qwenVisionApiKey',
  'qwenVisionModel',
  'doubaoVisionEndpoint',
  'doubaoVisionApiKey',
  'doubaoVisionModel'
])

const DEFAULT_CONFIG = {
  configVersion: CONFIG_SCHEMA_VERSION,
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  fallbackProvider: '',
  fallbackModel: 'deepseek-chat',
  deepseekApiKey: '',
  deepseekBaseUrl: 'https://api.deepseek.com',
  deepseekChatEndpoint: 'https://api.deepseek.com',
  deepseekPlannerModel: 'deepseek-chat',
  deepseekCodingModel: 'deepseek-coder',
  browserUseEndpoint: 'https://zenmux.ai/api/v1',
  browserUseApiKey: '',
  browserUseModel: 'openai/gpt-5.5',
  browserUseVisionEnabled: true,
  browserUseHeadless: false,
  desktopUseEndpoint: 'https://zenmux.ai/api/v1',
  desktopUseApiKey: '',
  desktopUseModel: 'openai/gpt-5.5',
  desktopUseGroundingBackend: 'manual-coordinate',
  desktopUseAllowBrowserFallback: true,
  dryRunEnabled: true,
  visionLoopEnabled: true,
  auditRetentionDays: 30,
  outputRetentionDays: 30,
  temperature: 0.7,
  permissionMode: 'default',
  workspace_root: os.homedir(),
  shell_whitelist_extra: [],
  shell_blacklist_extra: [],
  session_confirm_cache_enabled: true,
  welcomeShown: false
}

const DEFAULT_DATA = {
  version: 1,
  conversations: [],
  artifacts: [],
  deletedArtifacts: [],
  scheduledTasks: []
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function stripDeprecatedConfigKeys(config = {}) {
  const next = { ...config }
  for (const key of DEPRECATED_CONFIG_KEYS) delete next[key]
  return next
}

function ensureDataShape(data) {
  const next = data && typeof data === 'object' ? data : clone(DEFAULT_DATA)
  if (!Array.isArray(next.conversations)) next.conversations = []
  if (!Array.isArray(next.artifacts)) next.artifacts = []
  if (!Array.isArray(next.deletedArtifacts)) next.deletedArtifacts = []
  if (!Array.isArray(next.scheduledTasks)) next.scheduledTasks = []
  return next
}

function artifactFileExists(artifact) {
  if (!artifact?.path) return false
  try {
    const filePath = path.resolve(String(artifact.path))
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function canRestoreDeletedArtifact(artifact) {
  return artifact?.deleteInfo?.status === 'system-trash'
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
    let content = fs.readFileSync(filePath, 'utf-8')
    // Strip UTF-8 BOM if present. PowerShell's `Set-Content -Encoding utf8`
    // adds one and JSON.parse rejects it — without this, getConfig() silently
    // returns DEFAULT_CONFIG even though the file on disk is correct.
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)
    return JSON.parse(content)
  } catch (error) {
    console.error('[store] parse error, using fallback:', filePath, error.message)
    return clone(fallback)
  }
}

function writeJson(filePath, value) {
  ensureDirs()
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8')
}

function normalizeConfig(config, source = config) {
  const next = stripDeprecatedConfigKeys(config)
  const sourceVersion = Number(source.configVersion || 1)
  if (
    sourceVersion < 2 &&
    source.desktopUseAllowBrowserFallback === false &&
    !source.desktopUseApiKey
  ) {
    next.desktopUseAllowBrowserFallback = true
  }
  next.configVersion = CONFIG_SCHEMA_VERSION
  return next
}

const conversationStore = require('./services/conversationStore')

const store = {
  genId: (prefix = '') => prefix + crypto.randomUUID(),

  DATA_DIR,
  GENERATED_DIR,

  getConfig() {
    const diskConfig = readJson(CONFIG_PATH, DEFAULT_CONFIG)
    return stripDeprecatedConfigKeys(normalizeConfig({ ...DEFAULT_CONFIG, ...diskConfig }, diskConfig))
  },

  setConfig(patch) {
    const next = stripDeprecatedConfigKeys(normalizeConfig({ ...this.getConfig(), ...(patch || {}) }))
    writeJson(CONFIG_PATH, next)
    return next
  },

  getMaskedConfig() {
    const config = stripDeprecatedConfigKeys(this.getConfig())
    const mask = (key = '') => key.length > 10 ? `${key.slice(0, 6)}***${key.slice(-4)}` : (key ? '***' : '')
    const maskBrowserUse = (key = '') => {
      if (!key) return ''
      if (key.length <= 10) return '***'
      return `${key.slice(0, 6).replace(/-+$/, '')}***${key.slice(-4)}`
    }
    return {
      ...config,
      apiKey: mask(config.apiKey || ''),
      deepseekApiKey: mask(config.deepseekApiKey || ''),
      browserUseApiKey: maskBrowserUse(config.browserUseApiKey || ''),
      desktopUseApiKey: maskBrowserUse(config.desktopUseApiKey || '')
    }
  },

  getData() {
    return ensureDataShape(readJson(DATA_PATH, DEFAULT_DATA))
  },

  saveData(data) {
    writeJson(DATA_PATH, ensureDataShape(data))
  },

  upsertConversation(conversation) {
    return conversationStore.upsertConversation(conversation.id, conversation)
  },

  getConversation(id) {
    return conversationStore.getConversation(id)
  },

  listConversations(search = '') {
    return conversationStore.listConversations(search)
  },

  deleteConversation(id) {
    return conversationStore.deleteConversation(id)
  },

  renameConversation(id, title) {
    return conversationStore.renameConversation(id, title)
  },

  closeConversationStore() {
    return conversationStore.close()
  },

  addArtifact(artifact) {
    const data = this.getData()
    data.deletedArtifacts = data.deletedArtifacts.filter((item) => item.id !== artifact.id)
    data.artifacts.unshift(artifact)
    this.saveData(data)
    return artifact
  },

  listArtifacts() {
    const data = this.getData()
    const activeIds = new Set(data.artifacts.map((item) => item.id))
    const stillDeleted = []
    const restored = []

    for (const deleted of data.deletedArtifacts) {
      if (!deleted?.id || activeIds.has(deleted.id)) continue
      if (canRestoreDeletedArtifact(deleted) && artifactFileExists(deleted)) {
        const { deletedAt, deleteInfo, ...artifact } = deleted
        data.artifacts.unshift(artifact)
        activeIds.add(artifact.id)
        restored.push(artifact)
      } else {
        stillDeleted.push(deleted)
      }
    }

    if (restored.length || stillDeleted.length !== data.deletedArtifacts.length) {
      data.deletedArtifacts = stillDeleted
      this.saveData(data)
    }
    return data.artifacts
  },

  deleteArtifact(id, deleteInfo = {}) {
    const data = this.getData()
    const index = data.artifacts.findIndex((item) => item.id === id)
    if (index === -1) return null
    const [artifact] = data.artifacts.splice(index, 1)
    data.deletedArtifacts = data.deletedArtifacts.filter((item) => item.id !== id)
    data.deletedArtifacts.unshift({ ...artifact, deletedAt: new Date().toISOString(), deleteInfo })
    this.saveData(data)
    return artifact
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

module.exports = { store, DEFAULT_CONFIG, DEFAULT_DATA, DEPRECATED_CONFIG_KEYS, stripDeprecatedConfigKeys }
