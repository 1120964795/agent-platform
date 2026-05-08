const fs = require('fs')
const path = require('path')
const { DEFAULT_PROJECT_SETTINGS } = require('./defaults')
const { isInsideRoot, normalizeRelativePath, safeJoin, toPosixPath } = require('./pathUtils')

const SENSITIVE_GLOBS = [
  '.env',
  '*.env',
  '*.pem',
  '*.key',
  '*.crt',
  '*.pfx',
  '*.sqlite',
  '*.db'
]

const LOCK_FILE_GLOBS = [
  '*.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'poetry.lock',
  'Pipfile.lock'
]

function escapeRegex(value) {
  return String(value).replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

function normalizePattern(pattern) {
  return toPosixPath(String(pattern || '').trim()).replace(/^\/+/, '')
}

function globToRegex(pattern) {
  const normalized = normalizePattern(pattern)
  let source = ''
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    const next = normalized[index + 1]
    if (char === '*' && next === '*') {
      source += '.*'
      index += 1
    } else if (char === '*') {
      source += '[^/]*'
    } else {
      source += escapeRegex(char)
    }
  }
  return new RegExp(`^${source}$`, 'i')
}

function matchesGlob(relativePath, pattern) {
  const rel = normalizePattern(relativePath)
  let normalized = normalizePattern(pattern)
  if (!rel || !normalized || normalized.startsWith('!')) return false

  if (normalized.endsWith('/')) normalized = `${normalized}**`
  if (normalized.endsWith('/**')) {
    const prefix = normalized.slice(0, -3).replace(/\/+$/, '')
    return rel === prefix || rel.startsWith(`${prefix}/`)
  }

  const hasSlash = normalized.includes('/')
  const basename = rel.split('/').pop()
  if (!hasSlash) {
    if (!normalized.includes('*')) {
      return basename.toLowerCase() === normalized.toLowerCase() ||
        rel.split('/').some((segment) => segment.toLowerCase() === normalized.toLowerCase())
    }
    return globToRegex(normalized).test(basename)
  }

  return globToRegex(normalized).test(rel)
}

function readGitignorePatterns(rootPath, fsRef = fs) {
  const gitignorePath = safeJoin(rootPath, '.gitignore')
  if (!fsRef.existsSync(gitignorePath)) return []
  try {
    return fsRef.readFileSync(gitignorePath, 'utf-8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && !line.startsWith('!'))
  } catch {
    return []
  }
}

function isIncludedByWhitelist(relativePath, settings) {
  const basename = relativePath.split('/').pop()
  const ext = path.posix.extname(relativePath).toLowerCase()
  const includeExtensions = settings.includeExtensions || DEFAULT_PROJECT_SETTINGS.includeExtensions
  const includeFilenames = settings.includeFilenames || DEFAULT_PROJECT_SETTINGS.includeFilenames
  return includeFilenames.some((name) => name.toLowerCase() === basename.toLowerCase()) ||
    includeExtensions.some((item) => item.toLowerCase() === ext)
}

class ProjectIgnorePolicy {
  constructor(options = {}) {
    this.fs = options.fsRef || fs
    this.gitignoreCache = new Map()
  }

  getGitignorePatterns(rootPath) {
    if (!this.gitignoreCache.has(rootPath)) {
      this.gitignoreCache.set(rootPath, readGitignorePatterns(rootPath, this.fs))
    }
    return this.gitignoreCache.get(rootPath)
  }

  isAllowedFile({ rootPath, filePath, settings = DEFAULT_PROJECT_SETTINGS, mode = 'index', stat } = {}) {
    if (!isInsideRoot(rootPath, filePath)) {
      return { allowed: false, reason: 'OUTSIDE_PROJECT', message: 'Path is outside the authorized project root.' }
    }

    let fileStat = stat
    try {
      fileStat = fileStat || this.fs.statSync(filePath)
    } catch {
      return { allowed: false, reason: 'PATH_NOT_FOUND', message: 'Path does not exist.' }
    }
    if (!fileStat.isFile()) {
      return { allowed: false, reason: 'NOT_FILE', message: 'Path is not a file.' }
    }

    const relativePath = normalizeRelativePath(rootPath, filePath)
    const allExcludes = [
      ...(DEFAULT_PROJECT_SETTINGS.excludeGlobs || []),
      ...(settings.excludeGlobs || []),
      ...this.getGitignorePatterns(rootPath)
    ]
    const sensitiveExcludes = [...SENSITIVE_GLOBS, ...LOCK_FILE_GLOBS]

    if (sensitiveExcludes.some((pattern) => matchesGlob(relativePath, pattern))) {
      return { allowed: false, reason: 'SENSITIVE_FILE', message: 'Sensitive, database, or lock files are excluded.', relativePath }
    }

    if (allExcludes.some((pattern) => matchesGlob(relativePath, pattern))) {
      return { allowed: false, reason: 'EXCLUDED_BY_PATTERN', message: 'Path is excluded by project rules.', relativePath }
    }

    if (Number(fileStat.size) > Number(settings.maxFileBytes || DEFAULT_PROJECT_SETTINGS.maxFileBytes)) {
      return { allowed: false, reason: 'FILE_TOO_LARGE', message: 'File is larger than the project limit.', relativePath }
    }

    if (mode === 'index' && !isIncludedByWhitelist(relativePath, settings)) {
      return { allowed: false, reason: 'TYPE_NOT_INCLUDED', message: 'File type is not included in this project index.', relativePath }
    }

    if (mode === 'patch' && LOCK_FILE_GLOBS.some((pattern) => matchesGlob(relativePath, pattern))) {
      return { allowed: false, reason: 'LOCK_FILE', message: 'Lock files cannot be modified by patch apply.', relativePath }
    }

    return { allowed: true, relativePath }
  }
}

module.exports = {
  ProjectIgnorePolicy,
  matchesGlob,
  readGitignorePatterns,
  SENSITIVE_GLOBS,
  LOCK_FILE_GLOBS
}
