const fs = require('fs')
const path = require('path')
const { register } = require('./index')
const { requestConfirm } = require('../confirm')
const { toolError } = require('./_fs-helpers')

async function deletePath({ path: targetPath, recursive = false }) {
  if (!targetPath) throw toolError('INVALID_ARGS', 'path is required')
  if (!fs.existsSync(targetPath)) throw toolError('PATH_NOT_FOUND', `path not found: ${targetPath}`)
  const allowed = await requestConfirm({ kind: 'delete', payload: { path: targetPath, recursive } })
  if (!allowed) return { error: { code: 'USER_CANCELLED', message: 'delete cancelled by user' } }
  fs.rmSync(targetPath, { recursive: recursive === true, force: false })
  return { path: targetPath }
}

async function movePath({ src, dest, overwrite = false }) {
  if (!src || !dest) throw toolError('INVALID_ARGS', 'src and dest are required')
  if (!fs.existsSync(src)) throw toolError('PATH_NOT_FOUND', `path not found: ${src}`)
  if (fs.existsSync(dest)) {
    if (!overwrite) return { error: { code: 'ALREADY_EXISTS', message: `destination exists: ${dest}` } }
  }
  const allowed = await requestConfirm({ kind: 'move', payload: { src, dest, overwrite } })
  if (!allowed) return { error: { code: 'USER_CANCELLED', message: 'move cancelled by user' } }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  if (fs.existsSync(dest) && overwrite) fs.rmSync(dest, { recursive: true, force: true })
  fs.renameSync(src, dest)
  return { src, dest }
}

register({ name: 'delete_path', description: 'Delete a local file or directory after confirmation.', parameters: { type: 'object', properties: { path: { type: 'string' }, recursive: { type: 'boolean' } }, required: ['path'] } }, deletePath)
register({ name: 'move_path', description: 'Move or rename a local path after confirmation.', parameters: { type: 'object', properties: { src: { type: 'string' }, dest: { type: 'string' }, overwrite: { type: 'boolean' } }, required: ['src', 'dest'] } }, movePath)

module.exports = { deletePath, movePath }