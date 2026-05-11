const fs = require('fs')
const path = require('path')
const { store } = require('../store')

function outputPath(baseDir = store.DATA_DIR) {
  return path.join(baseDir, 'run-outputs.json')
}

function ensure(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify({ version: 1, outputs: [] }, null, 2), 'utf-8')
}

function read(filePath = outputPath()) {
  ensure(filePath)
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return Array.isArray(parsed.outputs) ? parsed.outputs : []
  } catch {
    return []
  }
}

function write(outputs, filePath = outputPath()) {
  ensure(filePath)
  fs.writeFileSync(filePath, JSON.stringify({ version: 1, outputs }, null, 2), 'utf-8')
}

function addRunOutput(output = {}, options = {}) {
  const filePath = options.filePath || outputPath(options.baseDir)
  const outputs = read(filePath)
  const item = {
    id: output.id || `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: output.sessionId || '',
    actionId: output.actionId || '',
    type: output.type || 'summary',
    title: output.title || 'Run output',
    path: output.path || '',
    summary: output.summary || '',
    metadata: output.metadata || {},
    createdAt: output.createdAt || new Date().toISOString()
  }
  outputs.unshift(item)
  write(outputs, filePath)
  return item
}

function listRunOutputs(filters = {}, options = {}) {
  const filePath = options.filePath || outputPath(options.baseDir)
  return read(filePath)
    .filter((item) => !filters.sessionId || item.sessionId === filters.sessionId)
    .filter((item) => !filters.type || item.type === filters.type)
}

function exportRunOutputs(filters = {}, options = {}) {
  const outPath = options.outputPath || path.join(options.baseDir || store.DATA_DIR, `run-outputs-export-${Date.now()}.json`)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const items = listRunOutputs(filters, options)
  fs.writeFileSync(outPath, JSON.stringify(items, null, 2), 'utf-8')
  return { path: outPath, count: items.length }
}

module.exports = { addRunOutput, exportRunOutputs, listRunOutputs, outputPath }
