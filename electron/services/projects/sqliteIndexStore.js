const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js/dist/sql-asm.js')
const { store } = require('../../store')

const SQLITE_INDEX_PATH = path.join(store.DATA_DIR, 'project-index.sqlite')
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'do',
  'does',
  'for',
  'how',
  'in',
  'is',
  'of',
  'on',
  'or',
  'project',
  'that',
  'the',
  'this',
  'to',
  'was',
  'were',
  'what',
  'where',
  'which',
  'why',
  'with'
])

function rowsFromExec(result) {
  if (!result?.length) return []
  const table = result[0]
  return table.values.map((values) => {
    const row = {}
    table.columns.forEach((column, index) => {
      row[column] = values[index]
    })
    return row
  })
}

function json(value) {
  return JSON.stringify(value == null ? null : value)
}

function normalizeRelativePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '')
}

class SQLiteIndexStore {
  constructor(options = {}) {
    this.dbPath = options.dbPath || SQLITE_INDEX_PATH
    this.fs = options.fsRef || fs
    this.SQL = null
    this.db = null
    this.readyPromise = null
  }

  async ready() {
    if (this.db) return this
    if (!this.readyPromise) {
      this.readyPromise = this.open()
    }
    await this.readyPromise
    return this
  }

  async open() {
    this.SQL = await initSqlJs()
    const dir = path.dirname(this.dbPath)
    if (!this.fs.existsSync(dir)) this.fs.mkdirSync(dir, { recursive: true })
    if (this.fs.existsSync(this.dbPath)) {
      this.db = new this.SQL.Database(this.fs.readFileSync(this.dbPath))
    } else {
      this.db = new this.SQL.Database()
    }
    this.migrate()
    this.save()
  }

  migrate() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS project_files (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        language TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        indexed_at TEXT NOT NULL,
        UNIQUE(project_id, relative_path)
      );
      CREATE TABLE IF NOT EXISTS project_chunks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        file_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        language TEXT NOT NULL,
        chunk_type TEXT NOT NULL,
        text TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        text_preview TEXT NOT NULL,
        indexed_at TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS project_chunks_fts USING fts4(
        project_id,
        text,
        relative_path,
        chunk_type,
        language
      );
      CREATE TABLE IF NOT EXISTS project_index_stats (
        project_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        file_count INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL,
        fts_row_count INTEGER NOT NULL,
        failed_files INTEGER NOT NULL,
        pending_files INTEGER NOT NULL,
        processed_files INTEGER NOT NULL,
        last_error TEXT NOT NULL,
        failures_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_indexed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS project_embeddings (
        chunk_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        embedding_model TEXT NOT NULL,
        vector_json TEXT NOT NULL,
        embedded_at TEXT NOT NULL
      );
    `)
  }

  save() {
    const data = this.db.export()
    this.fs.writeFileSync(this.dbPath, Buffer.from(data))
  }

  insertFilesAndChunksSync(projectId, files = [], chunks = []) {
    if ((files || []).length > 0) {
      const fileStmt = this.db.prepare(`
        INSERT INTO project_files
        (id, project_id, relative_path, language, size_bytes, content_hash, indexed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      for (const file of files || []) {
        fileStmt.run([
          file.id,
          projectId,
          file.relativePath,
          file.language,
          file.sizeBytes,
          file.contentHash,
          file.indexedAt
        ])
      }
      fileStmt.free()
    }

    if ((chunks || []).length > 0) {
      const chunkStmt = this.db.prepare(`
        INSERT INTO project_chunks
        (id, project_id, file_id, relative_path, line_start, line_end, language, chunk_type, text, content_hash, text_preview, indexed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const ftsStmt = this.db.prepare(`
        INSERT INTO project_chunks_fts (docid, project_id, text, relative_path, chunk_type, language)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      const maxRow = this.db.exec('SELECT COALESCE(MAX(rowid), 0) AS max_row FROM project_chunks')
      const maxRows = rowsFromExec(maxRow)
      let rowId = Number(maxRows[0]?.max_row || 0) + 1

      for (const chunk of chunks || []) {
        chunkStmt.run([
          chunk.id,
          projectId,
          chunk.fileId,
          chunk.relativePath,
          chunk.lineStart,
          chunk.lineEnd,
          chunk.language,
          chunk.chunkType,
          chunk.text,
          chunk.contentHash,
          chunk.textPreview || String(chunk.text || '').slice(0, 240),
          chunk.indexedAt
        ])
        ftsStmt.run([
          rowId,
          projectId,
          chunk.text,
          chunk.relativePath,
          chunk.chunkType,
          chunk.language
        ])
        rowId += 1
      }
      chunkStmt.free()
      ftsStmt.free()
    }
  }

  deleteProjectPathsSync(projectId, relativePaths = []) {
    const paths = [...new Set((relativePaths || []).map(normalizeRelativePath).filter(Boolean))]
    for (const relativePath of paths) {
      this.db.run(`
        DELETE FROM project_chunks_fts
        WHERE docid IN (
          SELECT rowid FROM project_chunks
          WHERE project_id = ? AND relative_path = ?
        )
      `, [projectId, relativePath])
      this.db.run('DELETE FROM project_chunks WHERE project_id = ? AND relative_path = ?', [projectId, relativePath])
      this.db.run('DELETE FROM project_files WHERE project_id = ? AND relative_path = ?', [projectId, relativePath])
    }
  }

  countRowsSync(projectId) {
    const fileRows = rowsFromExec(this.db.exec(`
      SELECT COUNT(*) AS count FROM project_files
      WHERE project_id = ${JSON.stringify(projectId)}
    `))
    const chunkRows = rowsFromExec(this.db.exec(`
      SELECT COUNT(*) AS count FROM project_chunks
      WHERE project_id = ${JSON.stringify(projectId)}
    `))
    return {
      fileCount: Number(fileRows[0]?.count || 0),
      chunkCount: Number(chunkRows[0]?.count || 0)
    }
  }

  async replaceProjectIndex(projectId, files, chunks, stats = {}) {
    await this.ready()
    this.db.run('BEGIN TRANSACTION')
    try {
      this.db.run('DELETE FROM project_files WHERE project_id = ?', [projectId])
      this.db.run('DELETE FROM project_chunks WHERE project_id = ?', [projectId])
      this.db.run('DELETE FROM project_chunks_fts WHERE project_id = ?', [projectId])

      this.insertFilesAndChunksSync(projectId, files, chunks)

      this.upsertStatsSync(projectId, {
        status: 'indexed',
        fileCount: (files || []).length,
        chunkCount: (chunks || []).length,
        ftsRowCount: (chunks || []).length,
        failedFiles: 0,
        pendingFiles: 0,
        processedFiles: (files || []).length,
        lastError: '',
        failures: [],
        ...stats
      })
      this.db.run('COMMIT')
      this.save()
      return this.getIndexStats(projectId)
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
  }

  async replaceProjectFiles(projectId, files = [], chunks = [], removedPaths = [], stats = {}) {
    await this.ready()
    const touchedPaths = [
      ...(removedPaths || []),
      ...(files || []).map((item) => item.relativePath)
    ]
    this.db.run('BEGIN TRANSACTION')
    try {
      this.deleteProjectPathsSync(projectId, touchedPaths)
      this.insertFilesAndChunksSync(projectId, files, chunks)
      const counts = this.countRowsSync(projectId)
      this.upsertStatsSync(projectId, {
        status: 'indexed',
        failedFiles: 0,
        pendingFiles: 0,
        processedFiles: [...new Set(touchedPaths.map(normalizeRelativePath).filter(Boolean))].length,
        lastError: '',
        ...stats,
        fileCount: counts.fileCount,
        chunkCount: counts.chunkCount,
        ftsRowCount: counts.chunkCount
      })
      this.db.run('COMMIT')
      this.save()
      return this.getIndexStats(projectId)
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
  }

  upsertStatsSync(projectId, stats) {
    this.db.run(`
      INSERT OR REPLACE INTO project_index_stats
      (project_id, status, file_count, chunk_count, fts_row_count, failed_files, pending_files, processed_files, last_error, failures_json, updated_at, last_indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      projectId,
      stats.status || 'idle',
      Number(stats.fileCount || 0),
      Number(stats.chunkCount || 0),
      Number(stats.ftsRowCount || 0),
      Number(stats.failedFiles || 0),
      Number(stats.pendingFiles || 0),
      Number(stats.processedFiles || 0),
      stats.lastError || '',
      json(stats.failures || []),
      stats.updatedAt || new Date().toISOString(),
      stats.lastIndexedAt || ''
    ])
  }

  async clearProjectIndex(projectId) {
    await this.ready()
    this.db.run('DELETE FROM project_files WHERE project_id = ?', [projectId])
    this.db.run('DELETE FROM project_chunks WHERE project_id = ?', [projectId])
    this.db.run('DELETE FROM project_chunks_fts WHERE project_id = ?', [projectId])
    this.upsertStatsSync(projectId, {
      status: 'cleared',
      updatedAt: new Date().toISOString()
    })
    this.save()
    return this.getIndexStats(projectId)
  }

  async getIndexStats(projectId) {
    await this.ready()
    const rows = rowsFromExec(this.db.exec(`
      SELECT
        project_id AS projectId,
        status,
        file_count AS fileCount,
        chunk_count AS chunkCount,
        fts_row_count AS ftsRowCount,
        failed_files AS failedFiles,
        pending_files AS pendingFiles,
        processed_files AS processedFiles,
        last_error AS lastError,
        failures_json AS failuresJson,
        updated_at AS updatedAt,
        last_indexed_at AS lastIndexedAt
      FROM project_index_stats
      WHERE project_id = ${JSON.stringify(projectId)}
    `))
    const row = rows[0]
    if (!row) return null
    return {
      ...row,
      failures: JSON.parse(row.failuresJson || '[]')
    }
  }

  async listProjectChunks(projectId) {
    await this.ready()
    return rowsFromExec(this.db.exec(`
      SELECT
        id,
        project_id AS projectId,
        file_id AS fileId,
        relative_path AS relativePath,
        line_start AS lineStart,
        line_end AS lineEnd,
        language,
        chunk_type AS chunkType,
        text,
        content_hash AS contentHash,
        text_preview AS textPreview,
        indexed_at AS indexedAt
      FROM project_chunks
      WHERE project_id = ${JSON.stringify(projectId)}
      ORDER BY relative_path, line_start
    `))
  }

  async search(projectId, query, filters = {}) {
    await this.ready()
    const cleanQuery = String(query || '').replace(/["']/g, ' ').trim()
    if (!cleanQuery) return []
    const terms = (cleanQuery.match(/[a-zA-Z0-9_./:-]+|[\u4e00-\u9fff]{2,}/g) || [])
      .map((term) => term.toLowerCase())
      .filter((term) => term.length > 1 && !STOPWORDS.has(term))
    if (terms.length === 0) return []
    const match = terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(' OR ')
    const limit = Number(filters.limit) || 8
    const stmt = this.db.prepare(`
      SELECT
        c.relative_path AS path,
        c.line_start AS lineStart,
        c.line_end AS lineEnd,
        c.chunk_type AS chunkType,
        c.language AS language,
        c.text_preview AS textPreview,
        c.text AS text
      FROM project_chunks_fts f
      JOIN project_chunks c ON c.rowid = f.docid
      WHERE f.project_id = ?
        AND project_chunks_fts MATCH ?
      LIMIT ${limit}
    `)
    stmt.bind([projectId, match])
    const rows = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows.map((row, index) => ({
      ...row,
      score: Math.max(1, terms.length * 4 - index),
      reason: `SQLite FTS matched ${terms.join(', ')}`
    }))
  }

  async replaceEmbeddings(projectId, embeddings = []) {
    await this.ready()
    this.db.run('DELETE FROM project_embeddings WHERE project_id = ?', [projectId])
    const stmt = this.db.prepare(`
      INSERT INTO project_embeddings
      (chunk_id, project_id, relative_path, embedding_model, vector_json, embedded_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    for (const item of embeddings) {
      stmt.run([
        item.chunkId,
        projectId,
        item.relativePath,
        item.embeddingModel,
        JSON.stringify(item.vector || []),
        item.embeddedAt
      ])
    }
    stmt.free()
    this.save()
    return this.getEmbeddingStats(projectId)
  }

  async getEmbeddingStats(projectId) {
    await this.ready()
    const rows = rowsFromExec(this.db.exec(`
      SELECT
        COUNT(*) AS embeddingCount,
        MAX(embedded_at) AS embeddedAt,
        MAX(embedding_model) AS embeddingModel
      FROM project_embeddings
      WHERE project_id = ${JSON.stringify(projectId)}
    `))
    return {
      projectId,
      embeddingCount: Number(rows[0]?.embeddingCount || 0),
      embeddedAt: rows[0]?.embeddedAt || '',
      embeddingModel: rows[0]?.embeddingModel || ''
    }
  }

  async listEmbeddings(projectId) {
    await this.ready()
    return rowsFromExec(this.db.exec(`
      SELECT
        chunk_id AS chunkId,
        project_id AS projectId,
        relative_path AS relativePath,
        embedding_model AS embeddingModel,
        vector_json AS vectorJson,
        embedded_at AS embeddedAt
      FROM project_embeddings
      WHERE project_id = ${JSON.stringify(projectId)}
    `)).map((row) => ({
      ...row,
      vector: JSON.parse(row.vectorJson || '[]')
    }))
  }
}

module.exports = {
  SQLiteIndexStore,
  rowsFromExec,
  SQLITE_INDEX_PATH
}
