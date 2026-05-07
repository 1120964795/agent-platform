const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { store } = require('../store')
const sqliteFts = require('./sqliteFtsIndex')

const MAX_FILES = 500
const MAX_FILE_BYTES = 64 * 1024
const MAX_SNIPPET = 700
const TEXT_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.txt', '.py', '.java',
  '.xml', '.gradle', '.properties', '.yml', '.yaml', '.html', '.css',
  '.toml', '.ini', '.env.example'
])
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', '.next', '.vite', '.venv', 'venv', '__pycache__'])
const SENSITIVE_NAMES = new Set(['.env', '.env.local', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'])
const FORBIDDEN_PATCH_EXTENSIONS = new Set(['.exe', '.dll', '.db', '.sqlite', '.sqlite3', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.zip'])

function nowIso() {
  return new Date().toISOString()
}

function normalizeUsername(username) {
  return String(username || 'guest').trim() || 'guest'
}

function isDirectory(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory()
  } catch {
    return false
  }
}

function normalizeRoot(rootPath) {
  const resolved = path.resolve(String(rootPath || '').trim())
  if (!isDirectory(resolved)) throw new Error(`project directory not found: ${rootPath}`)
  return resolved
}

function relativePath(rootPath, filePath) {
  return path.relative(rootPath, filePath).replace(/\\/g, '/')
}

function isInside(rootPath, targetPath) {
  const relative = path.relative(rootPath, targetPath)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function isAllowedTextFile(filePath) {
  const basename = path.basename(filePath)
  if (SENSITIVE_NAMES.has(basename)) return false
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function isPatchAllowed(filePath) {
  const basename = path.basename(filePath)
  if (SENSITIVE_NAMES.has(basename)) return false
  if (FORBIDDEN_PATCH_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return false
  return isAllowedTextFile(filePath)
}

function walkProject(rootPath, options = {}) {
  const files = []
  const limit = Number(options.limit || MAX_FILES)

  function walk(dirPath) {
    if (files.length >= limit) return
    let entries = []
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (files.length >= limit) return
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(fullPath)
        continue
      }
      if (!entry.isFile() || !isAllowedTextFile(fullPath)) continue
      try {
        const stat = fs.statSync(fullPath)
        if (stat.size > MAX_FILE_BYTES) continue
        files.push({ fullPath, relativePath: relativePath(rootPath, fullPath), size: stat.size, mtimeMs: stat.mtimeMs })
      } catch {
        // Ignore files that disappear during scanning.
      }
    }
  }

  walk(rootPath)
  return files
}

function safeReadText(filePath) {
  const buffer = fs.readFileSync(filePath)
  if (buffer.includes(0)) return ''
  return buffer.toString('utf-8')
}

function detectProfile(project, files) {
  const names = new Set(files.map((file) => file.relativePath))
  const rootPath = project.rootPath
  const languages = new Set()
  const frameworks = new Set()
  const commands = []

  for (const file of files) {
    const ext = path.extname(file.relativePath).toLowerCase()
    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) languages.add('Node')
    if (ext === '.py') languages.add('Python')
    if (ext === '.java') languages.add('Java')
  }

  if (names.has('package.json')) {
    frameworks.add('Node')
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(rootPath, 'package.json'), 'utf-8'))
      if (pkg.dependencies?.vite || pkg.devDependencies?.vite) frameworks.add('Vite')
      if (pkg.dependencies?.react || pkg.devDependencies?.react) frameworks.add('React')
      for (const [name, command] of Object.entries(pkg.scripts || {})) {
        commands.push({ name: `npm run ${name}`, command: `npm run ${name}`, source: 'package.json', value: command })
      }
    } catch {
      // A broken package.json should not block indexing.
    }
  }
  if (names.has('requirements.txt') || names.has('app.py')) {
    languages.add('Python')
    frameworks.add('Python')
    if (names.has('requirements.txt')) commands.push({ name: 'install requirements', command: 'pip install -r requirements.txt', source: 'requirements.txt' })
    if (names.has('app.py')) commands.push({ name: 'start app.py', command: 'python app.py', source: 'app.py' })
  }
  if (names.has('pom.xml')) {
    languages.add('Java')
    frameworks.add('Maven')
    commands.push({ name: 'maven test', command: 'mvn test', source: 'pom.xml' })
  }
  if (names.has('build.gradle') || names.has('settings.gradle')) {
    languages.add('Java')
    frameworks.add('Gradle')
    commands.push({ name: 'gradle test', command: 'gradle test', source: 'build.gradle' })
  }

  return {
    id: `profile_${project.id}`,
    projectId: project.id,
    username: project.username,
    rootPath,
    summary: `${project.name} 包含 ${files.length} 个可索引文本文件。`,
    languages: [...languages],
    frameworks: [...frameworks],
    commands,
    fileCount: files.length,
    updatedAt: nowIso()
  }
}

function addProject({ rootPath, name, username = 'guest' }) {
  const normalizedRoot = normalizeRoot(rootPath)
  const userKey = normalizeUsername(username)
  const existing = store.listProjects(userKey).find((project) => path.resolve(project.rootPath) === normalizedRoot)
  const project = existing || {
    id: store.genId('proj_'),
    username: userKey,
    rootPath: normalizedRoot,
    name: name || path.basename(normalizedRoot) || normalizedRoot,
    createdAt: nowIso()
  }
  project.lastOpenedAt = nowIso()
  project.indexStatus = project.indexStatus || 'idle'
  store.upsertProject(project)
  ensureProjectSettings(project.id)
  return project
}

function ensureProjectSettings(projectId) {
  const existing = store.getProjectSettings(projectId)
  if (existing) return existing
  return store.upsertProjectSettings({
    projectId,
    includePatterns: ['**/*'],
    excludePatterns: [...SKIP_DIRS],
    embeddingEnabled: false,
    maxFiles: MAX_FILES,
    updatedAt: nowIso()
  })
}

function refreshProfile(projectId, username = 'guest') {
  const project = store.getProject(projectId, username)
  if (!project) throw new Error('project not found')
  const files = walkProject(project.rootPath, { limit: ensureProjectSettings(projectId).maxFiles })
  return store.upsertProjectProfile(detectProfile(project, files))
}

async function indexProject(projectId, username = 'guest') {
  const project = store.getProject(projectId, username)
  if (!project) throw new Error('project not found')
  const settings = ensureProjectSettings(projectId)
  const files = walkProject(project.rootPath, { limit: settings.maxFiles })
  const indexedAt = nowIso()
  const entries = files.map((file) => {
    const content = safeReadText(file.fullPath)
    return {
      id: crypto.createHash('sha1').update(`${project.id}:${file.relativePath}`).digest('hex'),
      projectId: project.id,
      username: project.username,
      relativePath: file.relativePath,
      size: file.size,
      mtimeMs: file.mtimeMs,
      content: content.slice(0, MAX_FILE_BYTES),
      indexedAt
    }
  })
  await sqliteFts.replaceProjectEntries(projectId, entries)
  store.replaceProjectIndex(projectId, entries.map(({ content, ...entry }) => entry))
  const profile = store.upsertProjectProfile(detectProfile(project, files))
  store.upsertProject({ ...project, indexStatus: 'indexed', lastIndexedAt: indexedAt, indexedFileCount: entries.length })
  return { project: store.getProject(projectId, username), profile, indexedFileCount: entries.length }
}

function scoreEntry(entry, terms) {
  const haystack = `${entry.relativePath}\n${entry.content}`.toLowerCase()
  let score = 0
  for (const term of terms) {
    if (!term) continue
    const pathHit = entry.relativePath.toLowerCase().includes(term)
    const contentHits = haystack.split(term).length - 1
    score += (pathHit ? 5 : 0) + contentHits
  }
  return score
}

function makeSnippet(content, terms) {
  const lower = content.toLowerCase()
  const firstIndex = terms.map((term) => lower.indexOf(term)).filter((idx) => idx >= 0).sort((a, b) => a - b)[0] || 0
  const start = Math.max(0, firstIndex - 140)
  return content.slice(start, start + MAX_SNIPPET).trim()
}

async function searchProject(projectId, query, username = 'guest', options = {}) {
  const project = store.getProject(projectId, username)
  if (!project) throw new Error('project not found')
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const ftsResults = await sqliteFts.searchProject(projectId, query, options)
  return ftsResults
    .map((entry) => ({ entry, score: scoreEntry(entry, terms) || entry.score || 1 }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Number(options.limit || 8))
    .map(({ entry, score }) => ({
      projectId,
      relativePath: entry.relativePath,
      score,
      snippet: makeSnippet(entry.content, terms)
    }))
}

async function askProject(projectId, question, username = 'guest') {
  const sources = await searchProject(projectId, question, username, { limit: 5 })
  if (!sources.length) {
    return {
      answer: '没有找到可引用的项目来源，因此我不能编造答案。请先重新索引项目，或换一个更贴近文件内容的问题。',
      sources: []
    }
  }
  const answer = [
    '根据当前项目索引，下面这些来源与问题最相关：',
    ...sources.slice(0, 3).map((source, index) => `${index + 1}. ${source.relativePath}: ${source.snippet.split(/\r?\n/)[0] || '匹配到相关内容'}`)
  ].join('\n')
  return { answer, sources }
}

async function clearProjectIndex(projectId) {
  await sqliteFts.clearProject(projectId)
  return store.clearProjectIndex(projectId)
}

async function removeProject(projectId, username = 'guest') {
  await sqliteFts.clearProject(projectId)
  store.removeProject(projectId, username)
}

function previewPatch(projectId, payload = {}, username = 'guest') {
  const project = store.getProject(projectId, username)
  if (!project) throw new Error('project not found')
  const relative = String(payload.relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  const targetPath = path.resolve(project.rootPath, relative)
  if (!relative || !isInside(project.rootPath, targetPath)) throw new Error('patch target must stay inside project')
  if (!isPatchAllowed(targetPath)) throw new Error('patch target is not an allowed text file')
  const currentContent = fs.existsSync(targetPath) ? safeReadText(targetPath) : ''
  const nextContent = String(payload.newContent ?? payload.content ?? '')
  const record = {
    id: store.genId('patch_'),
    projectId,
    username: normalizeUsername(username),
    relativePath: relative,
    targetPath,
    status: 'draft',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    currentContent,
    newContent: nextContent,
    summary: payload.summary || `更新 ${relative}`,
    changes: {
      beforeLength: currentContent.length,
      afterLength: nextContent.length
    }
  }
  return store.upsertPatchRecord(record)
}

function applyPatch(projectId, patchId, username = 'guest', confirmed = false) {
  if (!confirmed) throw new Error('patch application requires explicit confirmation')
  const project = store.getProject(projectId, username)
  if (!project) throw new Error('project not found')
  const record = store.listPatchRecords(projectId).find((item) => item.id === patchId)
  if (!record) throw new Error('patch draft not found')
  const targetPath = path.resolve(project.rootPath, record.relativePath)
  if (!isInside(project.rootPath, targetPath) || !isPatchAllowed(targetPath)) throw new Error('patch target is not allowed')
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, record.newContent, 'utf-8')
  return store.upsertPatchRecord({ ...record, status: 'applied', appliedAt: nowIso(), updatedAt: nowIso() })
}

module.exports = {
  addProject,
  ensureProjectSettings,
  refreshProfile,
  indexProject,
  searchProject,
  askProject,
  clearProjectIndex,
  removeProject,
  previewPatch,
  applyPatch,
  walkProject,
  isAllowedTextFile,
  isPatchAllowed
}
