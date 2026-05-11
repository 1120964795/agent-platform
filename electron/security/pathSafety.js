const fs = require('fs')
const path = require('path')
const os = require('os')

const SYSTEM_ROOTS = [
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData'
]

function stripLongPathPrefix(p) {
  if (typeof p !== 'string') return p
  if (p.startsWith('\\\\?\\UNC\\') || p.startsWith('\\\\?\\UNC/')) {
    return '\\\\' + p.slice(8)
  }
  return p.replace(/^\\\\\?\\/, '')
}

function isUncPath(p) {
  return /^\\\\[^?]/.test(p)
}

function isUnderRoot(target, root) {
  const t = target.toLowerCase().replace(/[\\/]+$/, '') + '\\'
  const r = root.toLowerCase().replace(/[\\/]+$/, '') + '\\'
  return t === r || t.startsWith(r)
}

function realpathOrParent(p) {
  try {
    return fs.realpathSync(p)
  } catch {
    // path doesn't exist — try realpath of parent
  }
  const parent = path.dirname(p)
  try {
    const realParent = fs.realpathSync(parent)
    return path.join(realParent, path.basename(p))
  } catch {
    // parent doesn't exist either
  }
  return path.resolve(p)
}

function isSystemPath(resolved) {
  for (const sysRoot of SYSTEM_ROOTS) {
    if (isUnderRoot(resolved, sysRoot)) return true
  }
  return false
}

function validatePath(targetPath, mode, options = {}) {
  if (!targetPath || typeof targetPath !== 'string') {
    return { safe: false, reason: '路径为空或无效。' }
  }

  let p = stripLongPathPrefix(targetPath)

  if (isUncPath(p)) {
    return { safe: false, reason: 'UNC 路径已被阻止。', resolved: p }
  }

  p = path.resolve(p)

  const resolved = realpathOrParent(p)

  if (isSystemPath(p) || isSystemPath(resolved)) {
    return { safe: false, reason: '系统路径已被阻止。', resolved }
  }

  if (mode === 'read') {
    return { safe: true, resolved }
  }

  if (mode === 'write') {
    const writableRoots = options.writableRoots || [os.homedir()]
    for (const root of writableRoots) {
      if (isUnderRoot(resolved, root)) {
        return { safe: true, resolved }
      }
    }
    return { safe: false, reason: '路径不在可写根目录内。', resolved }
  }

  return { safe: false, reason: '未知模式。', resolved }
}

function isPathSafe(targetPath, mode, options) {
  return validatePath(targetPath, mode, options).safe
}

module.exports = { validatePath, isPathSafe, SYSTEM_ROOTS }
