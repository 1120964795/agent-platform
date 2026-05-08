const fs = require('fs')
const path = require('path')
const { store } = require('../../store')
const { DEFAULT_PROJECT_SETTINGS } = require('./defaults')
const { LOCK_FILE_GLOBS, SENSITIVE_GLOBS, matchesGlob } = require('./projectIgnorePolicy')
const { isInsideRoot, safeJoin, toPosixPath } = require('./pathUtils')

const BINARY_GLOBS = [
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.pdf',
  '*.docx',
  '*.pptx',
  '*.zip',
  '*.7z',
  '*.rar',
  '*.exe',
  '*.dll'
]

function stripDiffPath(value = '') {
  const text = String(value || '').trim()
  if (!text || text === '/dev/null') return ''
  const withoutPrefix = text.replace(/^(a|b)\//, '')
  return toPosixPath(withoutPrefix).replace(/^\/+/, '')
}

function parseUnifiedDiff(diffText) {
  const lines = String(diffText || '').replace(/\r\n/g, '\n').split('\n')
  const files = []
  let current = null
  let currentHunk = null

  function ensureCurrent() {
    if (!current) {
      current = { oldPath: '', newPath: '', hunks: [] }
      files.push(current)
    }
    return current
  }

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const parts = line.trim().split(/\s+/)
      current = {
        oldPath: stripDiffPath(parts[2] || ''),
        newPath: stripDiffPath(parts[3] || ''),
        hunks: []
      }
      files.push(current)
      currentHunk = null
      continue
    }

    if (line.startsWith('--- ')) {
      ensureCurrent().oldPath = stripDiffPath(line.slice(4).split(/\t/)[0])
      continue
    }

    if (line.startsWith('+++ ')) {
      ensureCurrent().newPath = stripDiffPath(line.slice(4).split(/\t/)[0])
      continue
    }

    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/)
    if (hunkMatch) {
      currentHunk = {
        oldStart: Number(hunkMatch[1]),
        oldCount: Number(hunkMatch[2] || 1),
        newStart: Number(hunkMatch[3]),
        newCount: Number(hunkMatch[4] || 1),
        lines: []
      }
      ensureCurrent().hunks.push(currentHunk)
      continue
    }

    if (currentHunk && (/^[ +\\-]/.test(line) || line.startsWith('\\ No newline'))) {
      if (line.startsWith('\\ No newline')) continue
      currentHunk.lines.push({ op: line[0], text: line.slice(1) })
    }
  }

  return files
    .map((file) => ({
      ...file,
      path: file.newPath || file.oldPath,
      changeType: !file.oldPath ? 'add' : !file.newPath ? 'delete' : 'modify'
    }))
    .filter((file) => file.path && file.hunks.length > 0)
}

function validateRelativePatchPath(relativePath, settings = DEFAULT_PROJECT_SETTINGS) {
  const rel = toPosixPath(relativePath)
  if (!rel || rel.startsWith('../') || rel.includes('/../') || path.win32.isAbsolute(rel) || path.posix.isAbsolute(rel)) {
    return { ok: false, code: 'OUTSIDE_PROJECT', message: 'Patch path must stay inside the project.' }
  }

  const denied = [
    ...SENSITIVE_GLOBS,
    ...LOCK_FILE_GLOBS,
    ...BINARY_GLOBS,
    ...(settings.excludeGlobs || [])
  ]
  const matched = denied.find((pattern) => matchesGlob(rel, pattern))
  if (matched) {
    return { ok: false, code: 'PATCH_PATH_BLOCKED', message: `Patch path is blocked by ${matched}.` }
  }

  return { ok: true }
}

function analyzePatch(project, files, settings) {
  const affectedFiles = []
  const blocked = []
  let hasDelete = false
  let hasAdd = false

  for (const file of files) {
    const validation = validateRelativePatchPath(file.path, settings)
    const fullPath = safeJoin(project.rootPath, file.path)
    if (!validation.ok || !isInsideRoot(project.rootPath, fullPath)) {
      blocked.push({
        path: file.path,
        reason: validation.code || 'OUTSIDE_PROJECT',
        message: validation.message || 'Patch path is outside the project.'
      })
      continue
    }

    if (file.changeType === 'delete') hasDelete = true
    if (file.changeType === 'add') hasAdd = true
    affectedFiles.push({
      path: file.path,
      changeType: file.changeType,
      riskLevel: file.changeType === 'delete' ? 'high' : file.changeType === 'add' ? 'medium' : 'medium'
    })
  }

  const riskLevel = blocked.length > 0 ? 'blocked' : hasDelete ? 'high' : hasAdd ? 'medium' : 'medium'
  return {
    affectedFiles,
    blocked,
    riskLevel,
    summary: `${affectedFiles.length} file(s), ${blocked.length} blocked path(s).`
  }
}

function applyFilePatch(originalText, filePatch) {
  const originalLines = originalText ? originalText.replace(/\r\n/g, '\n').split('\n') : []
  const result = []
  let cursor = 0

  for (const hunk of filePatch.hunks) {
    const hunkStart = Math.max(0, hunk.oldStart - 1)
    while (cursor < hunkStart && cursor < originalLines.length) {
      result.push(originalLines[cursor])
      cursor += 1
    }

    for (const line of hunk.lines) {
      if (line.op === ' ') {
        if (originalLines[cursor] !== line.text) {
          const error = new Error('Patch context does not match the current file.')
          error.code = 'PATCH_CONFLICT'
          throw error
        }
        result.push(originalLines[cursor])
        cursor += 1
      } else if (line.op === '-') {
        if (originalLines[cursor] !== line.text) {
          const error = new Error('Patch removal does not match the current file.')
          error.code = 'PATCH_CONFLICT'
          throw error
        }
        cursor += 1
      } else if (line.op === '+') {
        result.push(line.text)
      }
    }
  }

  while (cursor < originalLines.length) {
    result.push(originalLines[cursor])
    cursor += 1
  }

  return result.join('\n')
}

function conflict(pathValue, message) {
  return {
    path: pathValue,
    reason: 'PATCH_CONFLICT',
    message
  }
}

class PatchApplyService {
  constructor(options = {}) {
    this.store = options.storeRef || store
    this.fs = options.fsRef || fs
    this.now = options.now || (() => new Date())
  }

  preview(project, settings, payload = {}) {
    const diff = String(payload.diff || payload.patchText || '').trim()
    if (!diff) {
      const error = new Error('Missing patch diff.')
      error.code = 'BAD_REQUEST'
      throw error
    }

    const files = parseUnifiedDiff(diff)
    if (files.length === 0) {
      const error = new Error('No valid unified diff files found.')
      error.code = 'BAD_PATCH'
      throw error
    }

    const analysis = analyzePatch(project, files, settings)
    const record = this.store.upsertPatchRecord({
      id: payload.id,
      projectId: project.id,
      username: payload.username || 'guest',
      title: payload.title || 'Patch draft',
      summary: payload.summary || analysis.summary,
      patchText: diff,
      affectedFiles: analysis.affectedFiles,
      blocked: analysis.blocked,
      conflicts: [],
      riskLevel: analysis.riskLevel,
      status: analysis.blocked.length ? 'blocked' : 'draft',
      createdAt: payload.createdAt,
      updatedAt: this.now().toISOString()
    })

    return record
  }

  apply(project, settings, payload = {}) {
    if (!payload.confirmed) {
      const error = new Error('Patch application requires confirmation.')
      error.code = 'CONFIRMATION_REQUIRED'
      throw error
    }

    const record = payload.patchRecord || this.store.getPatchRecord(project.id, payload.patchId)
    if (!record) {
      const error = new Error('Patch record not found.')
      error.code = 'NOT_FOUND'
      throw error
    }

    const files = parseUnifiedDiff(record.patchText)
    const analysis = analyzePatch(project, files, settings)
    if (analysis.blocked.length > 0) {
      return this.store.upsertPatchRecord({
        ...record,
        blocked: analysis.blocked,
        conflicts: [],
        status: 'blocked',
        updatedAt: this.now().toISOString()
      })
    }

    const operations = []
    const conflicts = []
    for (const filePatch of files) {
      const fullPath = safeJoin(project.rootPath, filePatch.path)
      try {
        if (filePatch.changeType === 'add') {
          if (this.fs.existsSync(fullPath)) {
            conflicts.push(conflict(filePatch.path, 'File to add already exists.'))
            continue
          }
          operations.push({
            type: 'write',
            fullPath,
            content: applyFilePatch('', filePatch)
          })
        } else if (filePatch.changeType === 'delete') {
          if (!this.fs.existsSync(fullPath)) {
            conflicts.push(conflict(filePatch.path, 'File to delete does not exist.'))
            continue
          }
          const current = this.fs.readFileSync(fullPath, 'utf-8')
          applyFilePatch(current, filePatch)
          operations.push({ type: 'delete', fullPath })
        } else {
          if (!this.fs.existsSync(fullPath)) {
            conflicts.push(conflict(filePatch.path, 'File to patch does not exist.'))
            continue
          }
          const current = this.fs.readFileSync(fullPath, 'utf-8')
          operations.push({
            type: 'write',
            fullPath,
            content: applyFilePatch(current, filePatch)
          })
        }
      } catch (error) {
        conflicts.push(conflict(filePatch.path, error.message || 'Patch context does not match the current file.'))
      }
    }

    if (conflicts.length > 0) {
      return this.store.upsertPatchRecord({
        ...record,
        affectedFiles: analysis.affectedFiles,
        blocked: [],
        conflicts,
        riskLevel: analysis.riskLevel,
        status: 'conflict',
        updatedAt: this.now().toISOString()
      })
    }

    for (const operation of operations) {
      if (operation.type === 'delete') {
        this.fs.unlinkSync(operation.fullPath)
      } else {
        this.fs.mkdirSync(path.dirname(operation.fullPath), { recursive: true })
        this.fs.writeFileSync(operation.fullPath, operation.content, 'utf-8')
      }
    }

    return this.store.upsertPatchRecord({
      ...record,
      affectedFiles: analysis.affectedFiles,
      blocked: [],
      conflicts: [],
      riskLevel: analysis.riskLevel,
      status: 'applied',
      appliedAt: this.now().toISOString(),
      updatedAt: this.now().toISOString()
    })
  }
}

module.exports = {
  PatchApplyService,
  parseUnifiedDiff,
  analyzePatch,
  applyFilePatch,
  validateRelativePatchPath
}
