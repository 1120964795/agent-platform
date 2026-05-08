const fs = require('fs')
const path = require('path')
const { register } = require('./index')
const { requestConfirm } = require('../confirm')
const { toolError } = require('./_fs-helpers')

async function deletePath({ path: targetPath, recursive = false }) {
  if (!targetPath) throw toolError('INVALID_ARGS', '需要提供路径。')
  if (!fs.existsSync(targetPath)) throw toolError('PATH_NOT_FOUND', `未找到路径：${targetPath}`)
  const allowed = await requestConfirm({ kind: 'delete', payload: { path: targetPath, recursive } })
  if (!allowed) return { error: { code: 'USER_CANCELLED', message: '用户已取消删除。' } }
  fs.rmSync(targetPath, { recursive: recursive === true, force: false })
  return { path: targetPath }
}

async function movePath({ src, dest, overwrite = false }) {
  if (!src || !dest) throw toolError('INVALID_ARGS', '需要提供源路径和目标路径。')
  if (!fs.existsSync(src)) throw toolError('PATH_NOT_FOUND', `未找到路径：${src}`)
  if (fs.existsSync(dest)) {
    if (!overwrite) return { error: { code: 'ALREADY_EXISTS', message: `目标已存在：${dest}` } }
  }
  const allowed = await requestConfirm({ kind: 'move', payload: { src, dest, overwrite } })
  if (!allowed) return { error: { code: 'USER_CANCELLED', message: '用户已取消移动。' } }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  if (fs.existsSync(dest) && overwrite) fs.rmSync(dest, { recursive: true, force: true })
  fs.renameSync(src, dest)
  return { src, dest }
}

register({ name: 'delete_path', description: 'Delete a local file or directory after confirmation.', parameters: { type: 'object', properties: { path: { type: 'string' }, recursive: { type: 'boolean' } }, required: ['path'] } }, deletePath)
register({ name: 'move_path', description: 'Move or rename a local path after confirmation.', parameters: { type: 'object', properties: { src: { type: 'string' }, dest: { type: 'string' }, overwrite: { type: 'boolean' } }, required: ['src', 'dest'] } }, movePath)

module.exports = { deletePath, movePath }
