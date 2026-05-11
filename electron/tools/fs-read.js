const fs = require('fs')
const path = require('path')
const { register } = require('./index')
const { readFileAsText } = require('../services/fileReader')
const { ensurePathExists, listDir, searchFiles: searchFilesHelper } = require('./_fs-helpers')

const MIME_BY_EXT = {
  '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json', '.js': 'text/javascript', '.jsx': 'text/javascript', '.ts': 'text/typescript', '.tsx': 'text/typescript', '.csv': 'text/csv', '.html': 'text/html', '.css': 'text/css', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

async function readFile({ path: filePath, encoding = 'utf8', max_bytes = 2000000 }) {
  ensurePathExists(filePath)
  const stat = fs.statSync(filePath)
  if (!stat.isFile()) {
    const error = new Error('路径必须是文件。')
    error.code = 'INVALID_ARGS'
    throw error
  }

  const ext = path.extname(filePath).toLowerCase()
  const maxBytes = Number(max_bytes) || 2000000
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream'
  if (encoding === 'base64') {
    const buffer = fs.readFileSync(filePath)
    return { content: buffer.subarray(0, maxBytes).toString('base64'), truncated: buffer.length > maxBytes, mime, size: stat.size }
  }

  let content = ext === '.pdf' || ext === '.docx'
    ? await readFileAsText(filePath)
    : fs.readFileSync(filePath, 'utf-8')
  const bytes = Buffer.byteLength(content, 'utf8')
  let truncated = false
  if (bytes > maxBytes) {
    content = Buffer.from(content, 'utf8').subarray(0, maxBytes).toString('utf8')
    truncated = true
  }
  return { content, truncated, mime, size: stat.size }
}

function listDirectory(args) {
  return listDir(args.path, args.show_hidden === true)
}

function searchFiles(args) {
  return searchFilesHelper(args)
}

register({
  name: 'read_file',
  description: '以文本或 base64 形式读取本地文件。支持文本文件，并在可用时提取 PDF/DOCX 文本。',
  parameters: { type: 'object', properties: { path: { type: 'string' }, encoding: { type: 'string', enum: ['utf8', 'base64'] }, max_bytes: { type: 'number' } }, required: ['path'] }
}, readFile)

register({
  name: 'list_dir',
  description: '列出本地目录中的条目。',
  parameters: { type: 'object', properties: { path: { type: 'string' }, show_hidden: { type: 'boolean' } }, required: ['path'] }
}, listDirectory)

register({
  name: 'search_files',
  description: '在根路径下搜索文件和目录名称。',
  parameters: { type: 'object', properties: { root: { type: 'string' }, query: { type: 'string' }, max_depth: { type: 'number' } }, required: ['root', 'query'] }
}, searchFiles)

module.exports = { readFile, listDirectory, searchFiles }
