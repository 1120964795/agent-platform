const fs = require('fs')
const path = require('path')
const { register } = require('./index')
const { requestConfirm } = require('../confirm')
const { toolError } = require('./_fs-helpers')

async function writeFile({ path: filePath, content = '', encoding = 'utf8', overwrite = false }) {
  if (!filePath) throw toolError('INVALID_ARGS', 'path is required')
  if (fs.existsSync(filePath)) {
    if (!overwrite) return { error: { code: 'ALREADY_EXISTS', message: `file already exists: ${filePath}` } }
    const allowed = await requestConfirm({ kind: 'overwrite', payload: { path: filePath } })
    if (!allowed) return { error: { code: 'USER_CANCELLED', message: 'overwrite cancelled by user' } }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const data = encoding === 'base64' ? Buffer.from(String(content), 'base64') : String(content)
  fs.writeFileSync(filePath, data, encoding === 'base64' ? undefined : 'utf-8')
  return { path: filePath, bytes_written: fs.statSync(filePath).size }
}

function editFile({ path: filePath, old_string, new_string, replace_all = false }) {
  if (!filePath || typeof old_string !== 'string' || typeof new_string !== 'string') throw toolError('INVALID_ARGS', 'path, old_string and new_string are required')
  if (!fs.existsSync(filePath)) throw toolError('PATH_NOT_FOUND', `file not found: ${filePath}`)
  const current = fs.readFileSync(filePath, 'utf-8')
  const first = current.indexOf(old_string)
  if (first === -1) throw toolError('INVALID_ARGS', 'old_string was not found')
  if (!replace_all && current.indexOf(old_string, first + old_string.length) !== -1) throw toolError('INVALID_ARGS', 'old_string is not unique; set replace_all=true')
  const next = replace_all ? current.split(old_string).join(new_string) : current.replace(old_string, new_string)
  const replacements = replace_all ? current.split(old_string).length - 1 : 1
  fs.writeFileSync(filePath, next, 'utf-8')
  return { path: filePath, replacements }
}

function createDir({ path: dirPath, recursive = true }) {
  if (!dirPath) throw toolError('INVALID_ARGS', 'path is required')
  fs.mkdirSync(dirPath, { recursive: recursive !== false })
  return { path: dirPath }
}

register({ name: 'write_file', description: 'Write a local file. Existing files require overwrite=true and confirmation.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, encoding: { type: 'string', enum: ['utf8', 'base64'] }, overwrite: { type: 'boolean' } }, required: ['path', 'content'] } }, writeFile)
register({ name: 'edit_file', description: 'Edit a file by replacing an exact string.', parameters: { type: 'object', properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' }, replace_all: { type: 'boolean' } }, required: ['path', 'old_string', 'new_string'] } }, editFile)
register({ name: 'create_dir', description: 'Create a directory.', parameters: { type: 'object', properties: { path: { type: 'string' }, recursive: { type: 'boolean' } }, required: ['path'] } }, createDir)

module.exports = { writeFile, editFile, createDir }