const { RUNTIME_NAMES, ACTION_TYPES } = require('../security/actionTypes')

function makeDryRunAction(sessionId, index, patch) {
  return {
    id: `act_dry_${String(index + 1).padStart(6, '0')}`,
    sessionId,
    runtime: patch.runtime || RUNTIME_NAMES.DRY_RUN,
    type: patch.type,
    title: patch.title,
    summary: `[DRY-RUN] ${patch.summary || patch.title}`,
    payload: patch.payload || {},
    risk: patch.risk || 'low',
    requiresConfirmation: patch.requiresConfirmation ?? false,
    status: 'pending',
    createdAt: new Date().toISOString()
  }
}

function planTask(task, options = {}) {
  const sessionId = options.sessionId || `sess_dry_${Date.now()}`
  const lower = String(task || '').toLowerCase()
  const actions = []
  if (lower.includes('screen') || lower.includes('click') || lower.includes('mouse')) {
    actions.push(makeDryRunAction(sessionId, actions.length, {
      type: ACTION_TYPES.SCREEN_OBSERVE,
      title: 'Observe demo screen',
      summary: 'Capture a simulated screen state.'
    }))
    actions.push(makeDryRunAction(sessionId, actions.length, {
      type: ACTION_TYPES.MOUSE_CLICK,
      title: 'Click simulated target',
      summary: 'Click the highlighted dry-run target.',
      payload: { x: 320, y: 240, button: 'left' },
      risk: 'high',
      requiresConfirmation: true
    }))
  }
  actions.push(makeDryRunAction(sessionId, actions.length, {
    type: ACTION_TYPES.SHELL_COMMAND,
    title: 'Run dry-run command',
    summary: 'Pretend to run npm test.',
    payload: { command: 'npm test', cwd: options.cwd || '' },
    risk: 'medium',
    requiresConfirmation: true
  }))
  actions.push(makeDryRunAction(sessionId, actions.length, {
    type: ACTION_TYPES.FILE_WRITE,
    title: 'Write dry-run output',
    summary: 'Create simulated run output metadata.',
    payload: { path: 'dry-run-output.txt', content: '[DRY-RUN] simulated output' },
    risk: 'medium',
    requiresConfirmation: true
  }))
  return { sessionId, actions, dryRun: true }
}

function result(action, stdout, metadata = {}) {
  return {
    actionId: action.id,
    ok: true,
    exitCode: 0,
    stdout: `[DRY-RUN] ${stdout}`,
    stderr: '',
    filesChanged: metadata.filesChanged || [],
    durationMs: metadata.durationMs || 1,
    completedAt: new Date().toISOString(),
    metadata: { dryRun: true, ...metadata }
  }
}

async function execute(action) {
  switch (action.type) {
    case ACTION_TYPES.SHELL_COMMAND:
      return result(action, `Would run command: ${action.payload?.command || ''}`)
    case ACTION_TYPES.FILE_READ:
      return result(action, `Would read file: ${action.payload?.path || ''}`)
    case ACTION_TYPES.FILE_WRITE:
      return result(action, `Would write file: ${action.payload?.path || ''}`, { filesChanged: [action.payload?.path || 'dry-run-output.txt'] })
    case ACTION_TYPES.FILE_DELETE:
      return result(action, `Would delete path: ${action.payload?.path || ''}`)
    case ACTION_TYPES.CODE_EXECUTE:
      return result(action, `Would execute ${action.payload?.language || 'code'} snippet.`)
    case ACTION_TYPES.SCREEN_OBSERVE:
      return result(action, 'Would observe a simulated screen.', { screenshot: 'dry-run-screen.png' })
    case ACTION_TYPES.MOUSE_MOVE:
    case ACTION_TYPES.MOUSE_CLICK:
      return result(action, `Would perform mouse action at ${action.payload?.x ?? '?'}, ${action.payload?.y ?? '?'}.`)
    case ACTION_TYPES.KEYBOARD_TYPE:
      return result(action, `Would type ${String(action.payload?.text || '').length} characters.`)
    case ACTION_TYPES.KEYBOARD_SHORTCUT:
      return result(action, `Would press shortcut ${Array.isArray(action.payload?.keys) ? action.payload.keys.join('+') : action.payload?.keys || ''}.`)
    default:
      return {
        actionId: action.id,
        ok: false,
        exitCode: 1,
        stdout: '[DRY-RUN] Unsupported action.',
        stderr: `Unsupported dry-run action type: ${action.type}`,
        filesChanged: [],
        durationMs: 1,
        completedAt: new Date().toISOString(),
        metadata: { dryRun: true }
      }
  }
}

function createDryRunAdapter() {
  return { execute, emergencyStop: () => ({ ok: true, dryRun: true }) }
}

module.exports = { createDryRunAdapter, execute, planTask }
