const RUNTIME_NAMES = Object.freeze({
  QWEN: 'qwen',
  DEEPSEEK: 'deepseek',
  OPEN_INTERPRETER: 'open-interpreter',
  UI_TARS: 'ui-tars',
  DRY_RUN: 'aionui-dry-run'
})

const ACTION_TYPES = Object.freeze({
  SHELL_COMMAND: 'shell.command',
  FILE_READ: 'file.read',
  FILE_WRITE: 'file.write',
  FILE_DELETE: 'file.delete',
  FILE_MOVE: 'file.move',
  CODE_EXECUTE: 'code.execute',
  RUNTIME_SETUP: 'runtime.setup',
  RUNTIME_START: 'runtime.start',
  RUNTIME_STOP: 'runtime.stop',
  SCREEN_OBSERVE: 'screen.observe',
  SCREEN_REGION_SELECT: 'screen.region.select',
  MOUSE_MOVE: 'mouse.move',
  MOUSE_CLICK: 'mouse.click',
  KEYBOARD_TYPE: 'keyboard.type',
  KEYBOARD_SHORTCUT: 'keyboard.shortcut',
  OUTPUT_OPEN: 'output.open',
  AUDIT_EXPORT: 'audit.export'
})

const RISK_LEVELS = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  BLOCKED: 'blocked'
})

const ACTION_STATUS = Object.freeze({
  PROPOSED: 'proposed',
  PENDING: 'pending',
  APPROVED: 'approved',
  DENIED: 'denied',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  BLOCKED: 'blocked',
  CANCELLED: 'cancelled'
})

const AUDIT_PHASES = Object.freeze({
  PROPOSED: 'proposed',
  APPROVED: 'approved',
  DENIED: 'denied',
  STARTED: 'started',
  COMPLETED: 'completed',
  FAILED: 'failed',
  BLOCKED: 'blocked',
  CANCELLED: 'cancelled'
})

const KNOWN_RUNTIME_NAMES = Object.freeze(Object.values(RUNTIME_NAMES))
const KNOWN_ACTION_TYPES = Object.freeze(Object.values(ACTION_TYPES))

module.exports = {
  RUNTIME_NAMES,
  ACTION_TYPES,
  RISK_LEVELS,
  ACTION_STATUS,
  AUDIT_PHASES,
  KNOWN_RUNTIME_NAMES,
  KNOWN_ACTION_TYPES
}
