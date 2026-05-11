const fs = require('fs')
const path = require('path')

let db = null

function getDbPath() {
  if (module.exports.__testDbPath) return module.exports.__testDbPath
  const { app } = require('electron')
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'conversations.db')
}

function open() {
  if (db) return db
  const Database = require('better-sqlite3')
  db = new Database(getDbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      messages TEXT NOT NULL DEFAULT '[]',
      assistant TEXT NOT NULL DEFAULT 'deepseek',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  migrateFromJson(db)
  return db
}

function close() {
  if (db) { db.close(); db = null }
}

function firstUserPreview(messagesJson) {
  try {
    const msgs = JSON.parse(messagesJson || '[]')
    const first = msgs.find(m => m.role === 'user' && m.content)
    return first ? String(first.content).slice(0, 50) : ''
  } catch {
    return ''
  }
}

function listConversations(search = '') {
  const d = open()
  const normalizedSearch = String(search || '').trim()
  const rows = normalizedSearch
    ? d.prepare('SELECT id, title, messages, assistant, created_at, updated_at FROM conversations WHERE title LIKE @search ORDER BY updated_at DESC').all({ search: `%${normalizedSearch}%` })
    : d.prepare('SELECT id, title, messages, assistant, created_at, updated_at FROM conversations ORDER BY updated_at DESC').all()
  return rows.map(r => ({
    id: r.id,
    title: r.title || '新聊天',
    firstMessagePreview: firstUserPreview(r.messages),
    assistant: r.assistant,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }))
}

function getConversation(id) {
  const d = open()
  const row = d.prepare('SELECT * FROM conversations WHERE id = ?').get(id)
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    messages: JSON.parse(row.messages),
    assistant: row.assistant,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function upsertConversation(id, data) {
  const d = open()
  const existing = d.prepare('SELECT id FROM conversations WHERE id = ?').get(id)
  if (existing) {
    const updates = []
    const params = {}
    if (data.title !== undefined) { updates.push('title = @title'); params.title = data.title }
    if (data.messages !== undefined) { updates.push('messages = @messages'); params.messages = JSON.stringify(data.messages) }
    if (data.assistant !== undefined) { updates.push('assistant = @assistant'); params.assistant = data.assistant }
    updates.push("updated_at = datetime('now')")
    params.id = id
    d.prepare(`UPDATE conversations SET ${updates.join(', ')} WHERE id = @id`).run(params)
  } else {
    d.prepare(`
      INSERT INTO conversations (id, title, messages, assistant, created_at, updated_at)
      VALUES (@id, @title, @messages, @assistant, datetime('now'), datetime('now'))
    `).run({
      id,
      title: data.title || '',
      messages: JSON.stringify(data.messages || []),
      assistant: data.assistant || 'deepseek'
    })
  }
  return getConversation(id)
}

function deleteConversation(id) {
  const d = open()
  d.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

function renameConversation(id, title) {
  const d = open()
  d.prepare("UPDATE conversations SET title = @title, updated_at = datetime('now') WHERE id = @id").run({ id, title })
  return getConversation(id)
}

function migrationDataPath() {
  const { app } = require('electron')
  return path.join(app.getPath('userData'), 'agentdev-lite', 'data', 'data.json')
}

function migrateFromJson(d) {
  const count = d.prepare('SELECT COUNT(*) as cnt FROM conversations').get()
  if (count.cnt > 0) return

  const dataPath = migrationDataPath()
  try {
    if (!fs.existsSync(dataPath)) return
    const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
    const conversations = Array.isArray(raw.conversations) ? raw.conversations : []
    if (!conversations.length) return

    const insert = d.prepare(`
      INSERT OR IGNORE INTO conversations (id, title, messages, assistant, created_at, updated_at)
      VALUES (@id, @title, @messages, @assistant, @created_at, @updated_at)
    `)
    const now = new Date().toISOString()
    d.transaction((items) => {
      for (const c of items) {
        if (!c?.id) continue
        insert.run({
          id: c.id,
          title: c.title || '新聊天',
          messages: JSON.stringify(Array.isArray(c.messages) ? c.messages : []),
          assistant: c.assistant || 'deepseek',
          created_at: c.createdAt || c.created_at || now,
          updated_at: c.updatedAt || c.updated_at || c.createdAt || c.created_at || now
        })
      }
    })(conversations)
    fs.renameSync(dataPath, `${dataPath}.bak`)
  } catch (err) {
    console.warn('[conversationStore] legacy data migration skipped:', err.message)
  }
}

module.exports = { open, close, listConversations, getConversation, upsertConversation, deleteConversation, renameConversation, __testDbPath: null }
