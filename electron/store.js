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

const DEFAULT_CONFIG = {
  configVersion: CONFIG_SCHEMA_VERSION,
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  qwenApiKey: '',
  qwenBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  qwenPrimaryModel: 'qwen-max-latest',
  qwenCodingModel: 'qwen3-coder-plus',
  fallbackProvider: '',
  fallbackModel: 'deepseek-chat',
  deepseekApiKey: '',
  deepseekBaseUrl: 'https://api.deepseek.com',
  deepseekChatEndpoint: 'https://api.deepseek.com',
  deepseekPlannerModel: 'deepseek-chat',
  deepseekCodingModel: 'deepseek-coder',
  qwenVisionEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  qwenVisionApiKey: '',
  qwenVisionModel: 'qwen3-vl-plus',
  doubaoVisionEndpoint: 'https://ark.cn-beijing.volces.com/api/v3',
  doubaoVisionApiKey: '',
  doubaoVisionModel: 'doubao-seed-1-6-vision-250815',
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
  scheduledTasks: []
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
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
  const next = { ...config }
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
    return normalizeConfig({ ...DEFAULT_CONFIG, ...diskConfig }, diskConfig)
  },

  setConfig(patch) {
    const next = normalizeConfig({ ...this.getConfig(), ...(patch || {}) })
    writeJson(CONFIG_PATH, next)
    return next
  },

  getMaskedConfig() {
    const config = this.getConfig()
    const mask = (key = '') => key.length > 10 ? `${key.slice(0, 6)}***${key.slice(-4)}` : (key ? '***' : '')
    const maskBrowserUse = (key = '') => {
      if (!key) return ''
      if (key.length <= 10) return '***'
      return `${key.slice(0, 6).replace(/-+$/, '')}***${key.slice(-4)}`
    }
    return {
      ...config,
      apiKey: mask(config.apiKey || ''),
      qwenApiKey: mask(config.qwenApiKey || ''),
      deepseekApiKey: mask(config.deepseekApiKey || ''),
      doubaoVisionApiKey: mask(config.doubaoVisionApiKey || ''),
      browserUseApiKey: maskBrowserUse(config.browserUseApiKey || ''),
      desktopUseApiKey: maskBrowserUse(config.desktopUseApiKey || '')
    }
  },

  getData() {
    return readJson(DATA_PATH, DEFAULT_DATA)
  },

  saveData(data) {
    writeJson(DATA_PATH, data)
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

module.exports = { store, DEFAULT_CONFIG, DEFAULT_DATA }
