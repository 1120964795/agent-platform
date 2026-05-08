const fs = require('fs')
const { DEFAULT_PROJECT_SETTINGS } = require('./defaults')
const { isInsideRoot, safeJoin, toPosixPath } = require('./pathUtils')
const { validateRelativePatchPath } = require('./patchApplyService')

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function cleanToken(value = '') {
  return String(value || '')
    .trim()
    .replace(/^[\s"'`\u201c\u201d\u2018\u2019]+|[\s"'`\u201c\u201d\u2018\u2019\u3002\uff0c,.;:]+$/g, '')
}

function extractReplacementIntent(question = '') {
  const text = String(question || '').trim()
  const patterns = [
    /(?:\u628a|\u5c06)\s*(.+?)\s*(?:\u6539\u6210|\u6539\u4e3a|\u66ff\u6362\u6210|\u66ff\u6362\u4e3a|\u6362\u6210)\s*(.+)$/i,
    /replace\s+(.+?)\s+with\s+(.+)$/i,
    /change\s+(.+?)\s+to\s+(.+)$/i
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    const from = cleanToken(match[1])
    const to = cleanToken(match[2])
    if (from && to && from !== to) return { from, to }
  }

  return null
}

function makeHunk(lines, lineIndex, oldLine, newLine) {
  const start = Math.max(0, lineIndex - 2)
  const end = Math.min(lines.length, lineIndex + 3)
  const oldStart = start + 1
  const oldCount = end - start
  const hunk = [`@@ -${oldStart},${oldCount} +${oldStart},${oldCount} @@`]

  for (let index = start; index < end; index += 1) {
    if (index === lineIndex) {
      hunk.push(`-${oldLine}`)
      hunk.push(`+${newLine}`)
    } else {
      hunk.push(` ${lines[index]}`)
    }
  }

  return hunk.join('\n')
}

function createUnifiedDiff(relativePath, lines, lineIndex, nextLine) {
  const oldLine = lines[lineIndex]
  return [
    `diff --git a/${relativePath} b/${relativePath}`,
    `--- a/${relativePath}`,
    `+++ b/${relativePath}`,
    makeHunk(lines, lineIndex, oldLine, nextLine)
  ].join('\n')
}

function uniqueSearchResults(searchResults = []) {
  const seen = new Set()
  const items = []

  for (const result of searchResults || []) {
    const relativePath = toPosixPath(result.path || result.relativePath || '')
    const key = `${relativePath}:${result.lineStart || 0}:${result.lineEnd || 0}`
    if (!relativePath || seen.has(key)) continue
    seen.add(key)
    items.push({ ...result, path: relativePath })
  }

  return items
}

function candidateRank(result = {}) {
  const relativePath = toPosixPath(result.path || result.relativePath || '').toLowerCase()
  const basename = relativePath.split('/').pop() || ''
  let score = Number(result.score || 0)

  if (result.chunkType === 'source') score += 50
  if (relativePath.includes('/src/') || relativePath.startsWith('src/')) score += 30
  if (relativePath.includes('/api/') || basename.includes('api')) score += 10
  if (relativePath.includes('/server/') || relativePath.startsWith('server/')) score -= 5
  if (result.chunkType === 'markdown' || basename === 'readme.md') score -= 35
  if (/\.(test|spec)\.[jt]sx?$/.test(basename) || relativePath.includes('/test') || relativePath.includes('/tests/')) score -= 45

  return score
}

class PatchDraftService {
  constructor(options = {}) {
    this.fs = options.fsRef || fs
    this.now = options.now || (() => new Date())
  }

  draftReplacement({ project, settings = DEFAULT_PROJECT_SETTINGS, question, searchResults = [] } = {}) {
    const intent = extractReplacementIntent(question)
    if (!intent || !project?.id || !project?.rootPath) return []

    const candidates = uniqueSearchResults(searchResults)
      .sort((left, right) => candidateRank(right) - candidateRank(left))

    for (const result of candidates) {
      const relativePath = toPosixPath(result.path || '')
      const validation = validateRelativePatchPath(relativePath, settings)
      if (!validation.ok) continue

      const fullPath = safeJoin(project.rootPath, relativePath)
      if (!isInsideRoot(project.rootPath, fullPath)) continue
      if (!this.fs.existsSync(fullPath) || !this.fs.statSync(fullPath).isFile()) continue

      const text = this.fs.readFileSync(fullPath, 'utf-8')
      if (!text.includes(intent.from)) continue

      const lines = text.replace(/\r\n/g, '\n').split('\n')
      const lineIndex = lines.findIndex((line) => line.includes(intent.from))
      if (lineIndex < 0) continue

      const nextLine = lines[lineIndex].replace(new RegExp(escapeRegExp(intent.from), 'g'), intent.to)
      const diff = createUnifiedDiff(relativePath, lines, lineIndex, nextLine)
      const createdAt = this.now().toISOString()

      return [{
        id: `draft_${createdAt.replace(/\D/g, '').slice(0, 14)}_${lineIndex + 1}`,
        projectId: project.id,
        title: `Replace ${intent.from} with ${intent.to}`,
        summary: `Change ${intent.from} to ${intent.to} in ${relativePath}.`,
        affectedFiles: [{ path: relativePath, changeType: 'modify', riskLevel: 'medium' }],
        citations: [{
          path: relativePath,
          lineStart: lineIndex + 1,
          lineEnd: lineIndex + 1,
          chunkType: result.chunkType || 'source',
          reason: `Indexed source contains ${intent.from}.`
        }],
        diff,
        createdAt
      }]
    }

    return []
  }
}

module.exports = {
  PatchDraftService,
  extractReplacementIntent,
  createUnifiedDiff,
  candidateRank
}
