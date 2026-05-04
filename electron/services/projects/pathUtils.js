const path = require('path')

function getPathApi(value = '') {
  const text = String(value || '')
  if (process.platform === 'win32' || /^[a-zA-Z]:($|[\\/])/.test(text) || /^\\\\/.test(text)) {
    return path.win32
  }
  return path
}

function normalizeRootPath(value = '') {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^[a-zA-Z]:$/.test(text)) return `${text.toUpperCase()}\\`
  if (/^[a-zA-Z]:[^\\/]/.test(text)) return `${text[0].toUpperCase()}:\\${text.slice(2)}`
  const pathApi = getPathApi(text)
  return pathApi.normalize(text)
}

function stripTrailingSeparator(value, pathApi) {
  const parsed = pathApi.parse(value)
  if (value === parsed.root) return value
  return value.replace(/[\\/]+$/, '')
}

function toPosixPath(value = '') {
  return String(value || '').replace(/\\/g, '/')
}

function normalizeRelativePath(rootPath, targetPath) {
  const root = normalizeRootPath(rootPath)
  const target = normalizeRootPath(targetPath)
  const pathApi = getPathApi(root || target)
  return toPosixPath(pathApi.relative(root, target))
}

function isInsideRoot(rootPath, targetPath) {
  const root = normalizeRootPath(rootPath)
  const target = normalizeRootPath(targetPath)
  if (!root || !target) return false

  const pathApi = getPathApi(root || target)
  const rootKey = stripTrailingSeparator(pathApi.resolve(root), pathApi).toLowerCase()
  const targetKey = stripTrailingSeparator(pathApi.resolve(target), pathApi).toLowerCase()
  if (targetKey === rootKey) return true

  const relative = pathApi.relative(rootKey, targetKey)
  return Boolean(relative) && !relative.startsWith('..') && !pathApi.isAbsolute(relative)
}

function safeJoin(rootPath, relativePath) {
  const pathApi = getPathApi(rootPath)
  return pathApi.join(normalizeRootPath(rootPath), String(relativePath || ''))
}

module.exports = {
  getPathApi,
  normalizeRootPath,
  normalizeRelativePath,
  isInsideRoot,
  safeJoin,
  toPosixPath
}
