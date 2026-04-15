const TOOLS = {}
const TOOL_SCHEMAS = []
let builtinsLoaded = false

function register(schema, fn) {
  if (!schema?.name) throw new Error('tool schema must have name')
  if (typeof fn !== 'function') throw new Error(`tool ${schema.name} handler must be a function`)
  if (TOOLS[schema.name]) throw new Error(`tool ${schema.name} already registered`)
  TOOLS[schema.name] = fn
  TOOL_SCHEMAS.push(schema)
}

async function execute(name, args, context = {}) {
  const fn = TOOLS[name]
  if (!fn) return { error: { code: 'INVALID_ARGS', message: `unknown tool ${name}` } }
  try {
    return await fn(args || {}, context)
  } catch (error) {
    return { error: { code: error.code || 'INTERNAL', message: error.message || 'Tool execution failed' } }
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

module.exports = { TOOLS, TOOL_SCHEMAS, register, execute, loadBuiltins }
loadBuiltins()