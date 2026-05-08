const { ACTION_TYPES, RUNTIME_NAMES } = require('../../security/actionTypes')

const SUPPORTED_ACTION_TYPES = Object.freeze([
  ACTION_TYPES.SCREEN_OBSERVE,
  ACTION_TYPES.SCREEN_REGION_SELECT,
  ACTION_TYPES.MOUSE_MOVE,
  ACTION_TYPES.MOUSE_CLICK,
  ACTION_TYPES.KEYBOARD_TYPE,
  ACTION_TYPES.KEYBOARD_SHORTCUT
])

function toUiTarsRequest(action) {
  if (action.runtime !== RUNTIME_NAMES.UI_TARS && action.runtime !== RUNTIME_NAMES.DRY_RUN) {
    throw new Error(`UI-TARS 适配器无法执行运行时 ${action.runtime}`)
  }
  if (!SUPPORTED_ACTION_TYPES.includes(action.type)) throw new Error(`UI-TARS 适配器不支持 ${action.type}`)
  return {
    protocol: 'aionui.ui-tars.v1',
    actionId: action.id,
    sessionId: action.sessionId,
    type: action.type,
    payload: action.payload || {},
    approved: action.status === 'approved' || action.status === 'running',
    createdAt: action.createdAt
  }
}

function normalizeUiTarsResult(action, result = {}) {
  return {
    actionId: action.id,
    ok: result.ok !== false,
    exitCode: Number.isInteger(result.exitCode) ? result.exitCode : (result.ok === false ? 1 : 0),
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    filesChanged: [],
    durationMs: Number.isFinite(result.durationMs) ? result.durationMs : 0,
    completedAt: result.completedAt || new Date().toISOString(),
    metadata: result.metadata || {}
  }
}

module.exports = { SUPPORTED_ACTION_TYPES, toUiTarsRequest, normalizeUiTarsResult }
