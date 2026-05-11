import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.AGENTDEV_DATA_DIR || path.join(__dirname, '..', 'data')
const GENERATED_DIR = process.env.AGENTDEV_GENERATED_DIR || path.join(__dirname, '..', 'generated')
const CONFIG_PATH = path.join(DATA_DIR, 'config.json')
const DATA_PATH = path.join(DATA_DIR, 'data.json')

const DEFAULT_CONFIG = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  temperature: 0.7,
  permissionMode: 'default'
}

const DEFAULT_DATA = {
  version: 1,
  conversations: [],
  artifacts: [],
  scheduledTasks: []
}

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true })
}

function readJson(p, fallback) {
  ensureDirs()
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify(fallback, null, 2), 'utf-8')
    return fallback
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch (e) {
    console.error('[store] parse error, using fallback:', p, e.message)
    return fallback
  }
}

function writeJson(p, obj) {
  ensureDirs()
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf-8')
}

export const store = {
  genId: (prefix = '') => prefix + crypto.randomUUID(),

  GENERATED_DIR,

  getConfig() {
    return { ...DEFAULT_CONFIG, ...readJson(CONFIG_PATH, DEFAULT_CONFIG) }
  },
  setConfig(patch) {
    const cur = this.getConfig()
    const next = { ...cur, ...patch }
    writeJson(CONFIG_PATH, next)
    return next
  },
  getMaskedConfig() {
    const c = this.getConfig()
    const k = c.apiKey || ''
    return {
      ...c,
      apiKey: k.length > 10 ? `${k.slice(0, 6)}***${k.slice(-4)}` : (k ? '***' : '')
    }
  },

  getData() {
    return readJson(DATA_PATH, DEFAULT_DATA)
  },
  saveData(data) {
    writeJson(DATA_PATH, data)
  },

  // 会话操作
  upsertConversation(conv) {
    const data = this.getData()
    const i = data.conversations.findIndex(c => c.id === conv.id)
    if (i === -1) data.conversations.unshift(conv)
    else data.conversations[i] = conv
    this.saveData(data)
    return conv
  },
  getConversation(id) {
    return this.getData().conversations.find(c => c.id === id)
  },
  listConversations() {
    return this.getData().conversations
  },

  // 产物操作
  addArtifact(artifact) {
    const data = this.getData()
    data.artifacts.unshift(artifact)
    this.saveData(data)
    return artifact
  },
  listArtifacts() {
    return this.getData().artifacts
  },

  // 定时任务操作
  listScheduledTasks() {
    return this.getData().scheduledTasks
  },
  upsertScheduledTask(task) {
    const data = this.getData()
    const i = data.scheduledTasks.findIndex(t => t.id === task.id)
    if (i === -1) data.scheduledTasks.push(task)
    else data.scheduledTasks[i] = task
    this.saveData(data)
    return task
  },
  removeScheduledTask(id) {
    const data = this.getData()
    data.scheduledTasks = data.scheduledTasks.filter(t => t.id !== id)
    this.saveData(data)
  },
  appendTaskHistory(taskId, entry) {
    const data = this.getData()
    const t = data.scheduledTasks.find(t => t.id === taskId)
    if (!t) return
    t.history = t.history || []
    t.history.unshift(entry)
    if (t.history.length > 20) t.history.length = 20
    t.lastRun = entry.runAt
    this.saveData(data)
  }
}
