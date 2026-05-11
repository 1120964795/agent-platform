const fs = require('fs')
const path = require('path')
const { store } = require('../store')

function error(code, message) {
  return { ok: false, error: { code, message } }
}

function ensureFullPermission() {
  const config = store.getConfig()
  return config.permissionMode === 'full'
}

function listDirectory(dir) {
  if (!dir) return error('INVALID_ARGS', '需要提供目录。')
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return error('PATH_NOT_FOUND', '目录不存在。')
  }

  const items = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .map((entry) => {
      const fullPath = path.join(dir, entry.name)
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

  return { ok: true, dir, items }
}

function searchFiles({ query, dir, maxDepth = 3 }) {
  if (!query || !dir) return error('INVALID_ARGS', '需要提供搜索关键词和目录。')
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return error('PATH_NOT_FOUND', '目录不存在。')

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
    if (!ensureFullPermission()) return error('PERMISSION_DENIED', '浏览本地文件需要开启完全权限模式。')
    const dir = typeof payload === 'string' ? payload : (payload.dir || payload.path)
    return listDirectory(dir)
  })

  ipcMain.handle('files:search', async (_event, payload = {}) => {
    if (!ensureFullPermission()) return error('PERMISSION_DENIED', '搜索本地文件需要开启完全权限模式。')
    return searchFiles(payload)
  })
}

module.exports = { register, listDirectory, searchFiles }
