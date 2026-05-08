const fs = require('fs')
const crypto = require('crypto')
const path = require('path')
const { store } = require('../../store')
const { DEFAULT_PROJECT_SETTINGS } = require('./defaults')
const { ProjectIgnorePolicy, matchesGlob } = require('./projectIgnorePolicy')
const { safeJoin, normalizeRelativePath, toPosixPath } = require('./pathUtils')
const { SQLiteIndexStore } = require('./sqliteIndexStore')

const MAX_INDEX_FILES = 2500
const DEFAULT_LINES_PER_CHUNK = 80
const DEFAULT_OVERLAP_LINES = 10

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex')
}

function inferLanguage(relativePath) {
  const ext = path.posix.extname(relativePath).toLowerCase()
  const basename = path.posix.basename(relativePath)
  if (ext === '.py') return 'Python'
  if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) return 'JavaScript'
  if (ext === '.java') return 'Java'
  if (ext === '.md') return 'Markdown'
  if (['.json', '.yaml', '.yml', '.toml', '.ini', '.xml', '.gradle'].includes(ext) || basename === 'Dockerfile') return 'Config'
  if (['.html', '.css'].includes(ext)) return 'Web'
  return 'Text'
}

function inferChunkType(relativePath) {
  const ext = path.posix.extname(relativePath).toLowerCase()
  const basename = path.posix.basename(relativePath)
  if (ext === '.md') return 'markdown'
  if (['.json', '.yaml', '.yml', '.toml', '.ini', '.xml', '.gradle'].includes(ext) || basename === 'Dockerfile') return 'config'
  if (['.py', '.js', '.jsx', '.ts', '.tsx', '.java'].includes(ext)) return 'source'
  return 'text'
}

function shouldSkipDirectory(relativePath, settings, gitignorePatterns = []) {
  const rel = String(relativePath || '').replace(/\\/g, '/').replace(/\/+$/, '')
  if (!rel) return false
  const patterns = [
    ...(DEFAULT_PROJECT_SETTINGS.excludeGlobs || []),
    ...(settings.excludeGlobs || []),
    ...(gitignorePatterns || [])
  ]
  return patterns.some((pattern) => matchesGlob(`${rel}/placeholder.txt`, pattern) || matchesGlob(rel, pattern))
}

function splitLinesIntoChunks({ projectId, fileId, relativePath, text, indexedAt }) {
  const lines = String(text || '').split(/\r?\n/)
  const chunks = []
  const language = inferLanguage(relativePath)
  const chunkType = inferChunkType(relativePath)
  const step = Math.max(1, DEFAULT_LINES_PER_CHUNK - DEFAULT_OVERLAP_LINES)

  for (let startIndex = 0; startIndex < lines.length; startIndex += step) {
    const chunkLines = lines.slice(startIndex, startIndex + DEFAULT_LINES_PER_CHUNK)
    const chunkText = chunkLines.join('\n').trim()
    if (!chunkText) continue
    const lineStart = startIndex + 1
    const lineEnd = Math.min(lines.length, startIndex + chunkLines.length)
    const seed = `${projectId}:${relativePath}:${lineStart}:${lineEnd}:${hashText(chunkText).slice(0, 16)}`
    chunks.push({
      id: `chunk_${hashText(seed).slice(0, 16)}`,
      projectId,
      fileId,
      relativePath,
      lineStart,
      lineEnd,
      language,
      chunkType,
      text: chunkText,
      contentHash: hashText(chunkText),
      textPreview: chunkText.slice(0, 240),
      indexedAt
    })
    if (startIndex + DEFAULT_LINES_PER_CHUNK >= lines.length) break
  }

  return chunks
}

function normalizeChangedPath(rootPath, value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const posixText = toPosixPath(text)
  if (/^[a-zA-Z]:\//.test(posixText) || posixText.startsWith('//')) {
    return normalizeRelativePath(rootPath, text)
  }
  return posixText.replace(/^\/+/, '')
}

class ProjectIndexer {
  constructor(options = {}) {
    this.store = options.storeRef || store
    this.fs = options.fsRef || fs
    this.ignorePolicy = options.ignorePolicy || new ProjectIgnorePolicy({ fsRef: this.fs })
    this.indexStore = options.indexStore || new SQLiteIndexStore(options)
    this.now = options.now || (() => new Date())
    this.maxFiles = options.maxFiles || MAX_INDEX_FILES
  }

  walkFiles(rootPath, settings) {
    const gitignorePatterns = this.ignorePolicy.getGitignorePatterns(rootPath)
    const results = []

    const walk = (currentDir) => {
      if (results.length >= this.maxFiles) return
      let entries = []
      try {
        entries = this.fs.readdirSync(currentDir, { withFileTypes: true })
      } catch {
        return
      }

      for (const entry of entries) {
        if (results.length >= this.maxFiles) break
        const fullPath = path.join(currentDir, entry.name)
        const relativePath = normalizeRelativePath(rootPath, fullPath)

        if (entry.isDirectory()) {
          if (!shouldSkipDirectory(relativePath, settings, gitignorePatterns)) walk(fullPath)
          continue
        }
        if (entry.isFile()) results.push(fullPath)
      }
    }

    walk(rootPath)
    return results
  }

  buildFileIndex(project, filePath, relativePath, stat, indexedAt) {
    const text = this.fs.readFileSync(filePath, 'utf-8')
    const fileId = `file_${hashText(`${project.id}:${relativePath}`).slice(0, 16)}`
    const fileRecord = {
      id: fileId,
      projectId: project.id,
      relativePath,
      language: inferLanguage(relativePath),
      sizeBytes: stat.size,
      contentHash: hashText(text),
      indexedAt
    }

    return {
      file: fileRecord,
      chunks: splitLinesIntoChunks({
        projectId: project.id,
        fileId,
        relativePath,
        text,
        indexedAt
      })
    }
  }

  async indexProject(project, settings = DEFAULT_PROJECT_SETTINGS) {
    const startedAt = this.now().toISOString()
    this.store.upsertProjectIndexStats({
      projectId: project.id,
      status: 'indexing',
      pendingFiles: 0,
      processedFiles: 0,
      failedFiles: 0,
      lastError: '',
      updatedAt: startedAt
    })

    const files = []
    const chunks = []
    const failures = []
    const candidates = this.walkFiles(project.rootPath, settings)

    for (const filePath of candidates) {
      const allowed = this.ignorePolicy.isAllowedFile({ rootPath: project.rootPath, filePath, settings, mode: 'index' })
      if (!allowed.allowed) continue

      try {
        const stat = this.fs.statSync(filePath)
        const indexedAt = this.now().toISOString()
        const relativePath = allowed.relativePath || normalizeRelativePath(project.rootPath, filePath)
        const next = this.buildFileIndex(project, filePath, relativePath, stat, indexedAt)
        files.push(next.file)
        chunks.push(...next.chunks)
      } catch (error) {
        failures.push({
          path: normalizeRelativePath(project.rootPath, filePath),
          reason: error.message || 'Read failed.'
        })
      }
    }

    const nextStats = this.store.replaceProjectFileIndex(project.id, files, chunks, {
      status: failures.length > 0 ? 'indexed_with_errors' : 'indexed',
      failedFiles: failures.length,
      failures: failures.slice(0, 50),
      pendingFiles: 0,
      processedFiles: files.length,
      lastError: failures[0]?.reason || '',
      updatedAt: this.now().toISOString(),
      lastIndexedAt: this.now().toISOString()
    })
    await this.indexStore.replaceProjectIndex(project.id, files, chunks, nextStats)
    return nextStats
  }

  async indexChangedFiles(project, settings = DEFAULT_PROJECT_SETTINGS, changedPaths = []) {
    const normalizedPaths = [...new Set((changedPaths || [])
      .map((item) => normalizeChangedPath(project.rootPath, item))
      .filter(Boolean))]

    if (normalizedPaths.length === 0) {
      return this.indexProject(project, settings)
    }

    const startedAt = this.now().toISOString()
    this.store.upsertProjectIndexStats({
      projectId: project.id,
      status: 'indexing',
      pendingFiles: normalizedPaths.length,
      processedFiles: 0,
      failedFiles: 0,
      lastError: '',
      updatedAt: startedAt
    })

    const existingFiles = new Map(this.store.listProjectFiles(project.id)
      .map((item) => [toPosixPath(item.relativePath), item]))
    const files = []
    const chunks = []
    const removedPaths = []
    const failures = []
    let skippedFiles = 0

    for (const relativePath of normalizedPaths) {
      const filePath = safeJoin(project.rootPath, relativePath)
      if (!this.fs.existsSync(filePath)) {
        removedPaths.push(relativePath)
        continue
      }

      let stat
      try {
        stat = this.fs.statSync(filePath)
      } catch (error) {
        failures.push({ path: relativePath, reason: error.message || 'Stat failed.' })
        continue
      }

      if (!stat.isFile()) continue
      const allowed = this.ignorePolicy.isAllowedFile({ rootPath: project.rootPath, filePath, settings, mode: 'index', stat })
      if (!allowed.allowed) {
        removedPaths.push(allowed.relativePath || relativePath)
        continue
      }

      try {
        const indexedAt = this.now().toISOString()
        const next = this.buildFileIndex(project, filePath, allowed.relativePath || relativePath, stat, indexedAt)
        const existing = existingFiles.get(next.file.relativePath)
        if (existing?.contentHash === next.file.contentHash) {
          skippedFiles += 1
          continue
        }
        files.push(next.file)
        chunks.push(...next.chunks)
      } catch (error) {
        failures.push({
          path: allowed.relativePath || relativePath,
          reason: error.message || 'Read failed.'
        })
      }
    }

    const touchedPaths = [...removedPaths, ...files.map((item) => item.relativePath)]
    const nextStats = this.store.mergeProjectFileIndex(project.id, files, chunks, removedPaths, {
      status: failures.length > 0 ? 'indexed_with_errors' : 'indexed',
      failedFiles: failures.length,
      failures: failures.slice(0, 50),
      pendingFiles: 0,
      processedFiles: normalizedPaths.length - failures.length,
      skippedFiles,
      changedFiles: files.length,
      removedFiles: removedPaths.length,
      touchedFiles: touchedPaths.length,
      lastError: failures[0]?.reason || '',
      updatedAt: this.now().toISOString(),
      lastIndexedAt: this.now().toISOString()
    })
    await this.indexStore.replaceProjectFiles(project.id, files, chunks, removedPaths, nextStats)
    return nextStats
  }

  async clear(projectId) {
    const stats = this.store.clearProjectIndex(projectId)
    await this.indexStore.clearProjectIndex(projectId)
    return stats
  }
}

module.exports = {
  ProjectIndexer,
  hashText,
  inferLanguage,
  inferChunkType,
  splitLinesIntoChunks,
  normalizeChangedPath,
  shouldSkipDirectory,
  safeJoin
}
