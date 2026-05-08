const fs = require('fs')
const path = require('path')

function toolError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function ensurePathExists(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') throw toolError('INVALID_ARGS', '需要提供路径。')
  if (!fs.existsSync(targetPath)) throw toolError('PATH_NOT_FOUND', `未找到路径：${targetPath}`)
}

function listDir(pathValue, showHidden = false) {
  ensurePathExists(pathValue)
  const stat = fs.statSync(pathValue)
  if (!stat.isDirectory()) throw toolError('INVALID_ARGS', '路径必须是目录。')
  const entries = fs.readdirSync(pathValue, { withFileTypes: true })
    .filter((entry) => showHidden || !entry.name.startsWith('.'))
    .map((entry) => {
      const fullPath = path.join(pathValue, entry.name)
      const isDir = entry.isDirectory()
      let size = null
      try { if (!isDir) size = fs.statSync(fullPath).size } catch {}
      return { name: entry.name, path: fullPath, isDir, isDirectory: isDir, size, ext: isDir ? null : path.extname(entry.name).toLowerCase() }
    })
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  return { entries }
}

function searchFiles({ root, query, max_depth = 3 }) {
  if (!root || !query) throw toolError('INVALID_ARGS', '需要提供根目录和搜索关键词。')
  ensurePathExists(root)
  const stat = fs.statSync(root)
  if (!stat.isDirectory()) throw toolError('INVALID_ARGS', '根路径必须是目录。')
  const results = []
  const needle = String(query).toLowerCase()
  const limit = 50
  const depthLimit = Number(max_depth)

  function walk(currentDir, depth) {
    if (depth > depthLimit || results.length >= limit) return
    let entries = []
    try { entries = fs.readdirSync(currentDir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const fullPath = path.join(currentDir, entry.name)
      if (entry.name.toLowerCase().includes(needle)) {
        results.push({ name: entry.name, path: fullPath, isDir: entry.isDirectory(), isDirectory: entry.isDirectory(), ext: entry.isFile() ? path.extname(entry.name).toLowerCase() : null })
      }
      if (entry.isDirectory() && results.length < limit) walk(fullPath, depth + 1)
    }
  }

  walk(root, 0)
  return { results }
}

module.exports = { toolError, ensurePathExists, listDir, searchFiles }
