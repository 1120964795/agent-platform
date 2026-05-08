const { ACTION_TYPES, RUNTIME_NAMES } = require('../../security/actionTypes')

const SUPPORTED_ACTION_TYPES = Object.freeze([
  ACTION_TYPES.SHELL_COMMAND,
  ACTION_TYPES.FILE_READ,
  ACTION_TYPES.FILE_WRITE,
  ACTION_TYPES.FILE_DELETE,
  ACTION_TYPES.CODE_EXECUTE,
  ACTION_TYPES.RUNTIME_SETUP
])

function toSidecarRequest(action) {
  if (action.runtime !== RUNTIME_NAMES.OPEN_INTERPRETER && action.runtime !== RUNTIME_NAMES.DRY_RUN) {
    throw new Error(`Open Interpreter 适配器无法执行运行时 ${action.runtime}`)
  }
  if (!SUPPORTED_ACTION_TYPES.includes(action.type)) {
    throw new Error(`Open Interpreter 适配器不支持 ${action.type}`)
  }
  return {
    protocol: 'aionui.open-interpreter.v1',
    actionId: action.id,
    sessionId: action.sessionId,
    type: action.type,
    payload: action.payload || {},
    approved: action.status === 'approved' || action.status === 'running',
    createdAt: action.createdAt
  }
}

function normalizeSidecarResult(action, result = {}) {
  return {
    actionId: action.id,
    ok: result.ok !== false,
    exitCode: Number.isInteger(result.exitCode) ? result.exitCode : (result.ok === false ? 1 : 0),
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    filesChanged: Array.isArray(result.filesChanged) ? result.filesChanged : [],
    durationMs: Number.isFinite(result.durationMs) ? result.durationMs : 0,
    completedAt: result.completedAt || new Date().toISOString(),
    metadata: result.metadata || {}
  }
}

module.exports = { SUPPORTED_ACTION_TYPES, toSidecarRequest, normalizeSidecarResult }
