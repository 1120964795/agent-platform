const fs = require('fs')
const path = require('path')
const { store } = require('../store')

function error(code, message) {
  return { ok: false, error: { code, message } }
}

function getPathApi(value = '') {
  const text = String(value)
  if (process.platform === 'win32' || /^[a-zA-Z]:($|[\\/])/.test(text) || /^\\\\/.test(text)) {
    return path.win32
  }
  return path
}

function normalizeDirectoryPath(dir) {
  const text = String(dir || '').trim()
  if (!text) return ''
  if (/^[a-zA-Z]:$/.test(text)) return `${text.toUpperCase()}\\`
  if (/^[a-zA-Z]:[^\\/]/.test(text)) return `${text[0].toUpperCase()}:\\${text.slice(2)}`

  const pathApi = getPathApi(text)
  return pathApi.normalize(text)
}

function getParentDir(dir) {
  const normalized = normalizeDirectoryPath(dir)
  if (!normalized) return null

  const pathApi = getPathApi(normalized)
  const parsed = pathApi.parse(normalized)
  const parent = pathApi.dirname(normalized)

  if (!parent || parent === '.' || parent === normalized || normalized === parsed.root) return null
  return normalizeDirectoryPath(parent)
}

function buildBreadcrumbs(dir) {
  const normalized = normalizeDirectoryPath(dir)
  if (!normalized) return []

  const pathApi = getPathApi(normalized)
  const parsed = pathApi.parse(normalized)
  const root = parsed.root || pathApi.sep
  const rest = normalized.slice(root.length).split(/[\\/]+/).filter(Boolean)
  const breadcrumbs = root ? [{ label: root, path: root }] : []
  let cursor = root

  for (const part of rest) {
    cursor = cursor ? pathApi.join(cursor, part) : part
    breadcrumbs.push({ label: part, path: normalizeDirectoryPath(cursor) })
  }

  return breadcrumbs
}

function listRoots() {
  if (process.platform !== 'win32') return ['/']

  const roots = []
  for (let code = 65; code <= 90; code += 1) {
    const root = `${String.fromCharCode(code)}:\\`
    try {
      if (fs.existsSync(root)) roots.push(root)
    } catch {}
  }
  return roots
}

function ensureFullPermission(username) {
  const config = username ? store.getUserConfig(username) : store.getConfig()
  return config.permissionMode === 'full'
}

function listDirectory(dir) {
  const normalizedDir = normalizeDirectoryPath(dir)
  if (!normalizedDir) return error('INVALID_ARGS', '缺少目录路径')
  if (!fs.existsSync(normalizedDir) || !fs.statSync(normalizedDir).isDirectory()) {
    return error('PATH_NOT_FOUND', '目录不存在')
  }

  const items = fs.readdirSync(normalizedDir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .map((entry) => {
      const pathApi = getPathApi(normalizedDir)
      const fullPath = pathApi.join(normalizedDir, entry.name)
      const isDirectory = entry.isDirectory()
      let size = null
      try {
        if (!isDirectory) size = fs.statSync(fullPath).size
      } catch {}
      return {
        name: entry.name,
        path: fullPath,
        isDirectory,
        ext: isDirectory ? null : path.extname(entry.name).toLowerCase(),
        size
      }
    })
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })

  return {
    ok: true,
    dir: normalizedDir,
    parentDir: getParentDir(normalizedDir),
    roots: listRoots(),
    breadcrumbs: buildBreadcrumbs(normalizedDir),
    items
  }
}

function searchFiles({ query, dir, maxDepth = 3 }) {
  if (!query || !dir) return error('INVALID_ARGS', '缺少搜索关键词或目录路径')
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return error('PATH_NOT_FOUND', '目录不存在')

  const results = []
  const pattern = String(query).toLowerCase()
  const depthLimit = Number(maxDepth)
  const limit = 50

  function walk(currentDir, depth) {
    if (depth > depthLimit || results.length >= limit) return
    let entries = []
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const fullPath = path.join(currentDir, entry.name)
      if (entry.name.toLowerCase().includes(pattern)) {
        results.push({
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          ext: entry.isFile() ? path.extname(entry.name).toLowerCase() : null
        })
      }
      if (entry.isDirectory() && results.length < limit) walk(fullPath, depth + 1)
    }
  }

  walk(dir, 0)
  return { ok: true, results }
}

function register(ipcMain) {
  ipcMain.handle('files:list', async (_event, payload = {}) => {
    const username = typeof payload === 'object' ? payload.username : ''
    if (!ensureFullPermission(username)) return error('PERMISSION_DENIED', '需要开启完全权限才能浏览本地文件。')
    const dir = typeof payload === 'string' ? payload : (payload.dir || payload.path)
    return listDirectory(dir)
  })

  ipcMain.handle('files:search', async (_event, payload = {}) => {
    const username = typeof payload === 'object' ? payload.username : ''
    if (!ensureFullPermission(username)) return error('PERMISSION_DENIED', '需要开启完全权限才能搜索本地文件。')
    return searchFiles(payload)
  })
}

module.exports = { register, listDirectory, searchFiles, normalizeDirectoryPath, getParentDir, buildBreadcrumbs, listRoots }
