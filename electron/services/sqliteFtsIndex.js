const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')
const { store } = require('../store')

let sqlPromise = null
let dbPromise = null

function databasePath() {
  return path.join(store.DATA_DIR, 'project-index.sqlite')
}

function ensureDir() {
  if (!fs.existsSync(store.DATA_DIR)) fs.mkdirSync(store.DATA_DIR, { recursive: true })
}

function locateFile(file) {
  return require.resolve(`sql.js/dist/${file}`)
}

async function getSql() {
  if (!sqlPromise) sqlPromise = initSqlJs({ locateFile })
  return sqlPromise
}

async function getDb() {
  if (dbPromise) return dbPromise
  dbPromise = (async () => {
    ensureDir()
    const SQL = await getSql()
    const dbPath = databasePath()
    const db = fs.existsSync(dbPath)
      ? new SQL.Database(fs.readFileSync(dbPath))
      : new SQL.Database()
    db.run(`
      CREATE TABLE IF NOT EXISTS project_docs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        username TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        size INTEGER NOT NULL,
        mtime_ms REAL NOT NULL,
        indexed_at TEXT NOT NULL
      );
    `)
    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS project_docs_fts
      USING fts4(id, project_id, username, relative_path, content);
    `)
    return db
  })()
  return dbPromise
}

async function persist() {
  const db = await getDb()
  ensureDir()
  fs.writeFileSync(databasePath(), Buffer.from(db.export()))
}

function ftsQuery(query) {
  return String(query || '')
    .split(/\s+/)
    .map((term) => term.trim().replace(/["'*:()]/g, ''))
    .filter((term) => term.length >= 2)
    .map((term) => `"${term}"`)
    .join(' OR ')
}

async function clearProject(projectId) {
  const db = await getDb()
  db.run('DELETE FROM project_docs WHERE project_id = ?', [projectId])
  db.run('DELETE FROM project_docs_fts WHERE project_id = ?', [projectId])
  await persist()
}

async function replaceProjectEntries(projectId, entries) {
  const db = await getDb()
  db.run('BEGIN TRANSACTION')
  try {
    db.run('DELETE FROM project_docs WHERE project_id = ?', [projectId])
    db.run('DELETE FROM project_docs_fts WHERE project_id = ?', [projectId])
    const meta = db.prepare('INSERT INTO project_docs (id, project_id, username, relative_path, size, mtime_ms, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const fts = db.prepare('INSERT INTO project_docs_fts (id, project_id, username, relative_path, content) VALUES (?, ?, ?, ?, ?)')
    for (const entry of entries) {
      meta.run([entry.id, entry.projectId, entry.username, entry.relativePath, entry.size, entry.mtimeMs, entry.indexedAt])
      fts.run([entry.id, entry.projectId, entry.username, entry.relativePath, entry.content])
    }
    meta.free()
    fts.free()
    db.run('COMMIT')
  } catch (error) {
    db.run('ROLLBACK')
    throw error
  }
  await persist()
}

async function searchProject(projectId, query, options = {}) {
  const db = await getDb()
  const match = ftsQuery(query)
  if (!match) return []
  const limit = Number(options.limit || 8)
  const stmt = db.prepare(`
    SELECT id, project_id, username, relative_path, content
    FROM project_docs_fts
    WHERE project_id = ? AND project_docs_fts MATCH ?
    LIMIT ?
  `)
  const rows = []
  stmt.bind([projectId, match, limit])
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows.map((row, index) => ({
    id: row.id,
    projectId: row.project_id,
    username: row.username,
    relativePath: row.relative_path,
    content: row.content,
    score: limit - index
  }))
}

async function countProjectEntries(projectId) {
  const db = await getDb()
  const stmt = db.prepare('SELECT COUNT(*) AS count FROM project_docs WHERE project_id = ?')
  stmt.bind([projectId])
  const count = stmt.step() ? Number(stmt.getAsObject().count || 0) : 0
  stmt.free()
  return count
}

function resetForTests() {
  dbPromise = null
}

module.exports = {
  databasePath,
  clearProject,
  replaceProjectEntries,
  searchProject,
  countProjectEntries,
  resetForTests
}
