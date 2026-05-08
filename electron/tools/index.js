const TOOLS = {}
const TOOL_SCHEMAS = []
let builtinsLoaded = false

function register(schema, fn) {
  if (!schema?.name) throw new Error('工具 schema 必须包含名称。')
  if (typeof fn !== 'function') throw new Error(`工具 ${schema.name} 的处理器必须是函数。`)
  if (TOOLS[schema.name]) throw new Error(`工具 ${schema.name} 已注册。`)
  TOOLS[schema.name] = fn
  TOOL_SCHEMAS.push(schema)
}

async function execute(name, args, context = {}) {
  const fn = TOOLS[name]
  if (!fn) return { error: { code: 'INVALID_ARGS', message: `未知工具：${name}` } }
  try {
    return await fn(args || {}, context)
  } catch (error) {
    return { error: { code: error.code || 'INTERNAL', message: error.message || '工具执行失败。' } }
  }
}

function loadBuiltins() {
  if (builtinsLoaded) return
  builtinsLoaded = true
  require('./fs-read')
  require('./fs-write')
  require('./fs-destructive')
  require('./shell')
  require('./env')
  require('./docs')
  require('./remember')
  require('../skills/loader')
}

function getExecutionToolSchemas() {
  return []
}

module.exports = { TOOLS, TOOL_SCHEMAS, register, execute, loadBuiltins, getExecutionToolSchemas }
loadBuiltins()
