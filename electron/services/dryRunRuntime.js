const { RUNTIME_NAMES, ACTION_TYPES } = require('../security/actionTypes')

function makeDryRunAction(sessionId, index, patch) {
  return {
    id: `act_dry_${String(index + 1).padStart(6, '0')}`,
    sessionId,
    runtime: patch.runtime || RUNTIME_NAMES.DRY_RUN,
    type: patch.type,
    title: patch.title,
    summary: `[演示模式] ${patch.summary || patch.title}`,
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
      title: '观察演示屏幕',
      summary: '捕获一份模拟的屏幕状态。'
    }))
    actions.push(makeDryRunAction(sessionId, actions.length, {
      type: ACTION_TYPES.MOUSE_CLICK,
      title: '点击模拟目标',
      summary: '点击演示模式中高亮的目标。',
      payload: { x: 320, y: 240, button: 'left' },
      risk: 'high',
      requiresConfirmation: true
    }))
  }
  actions.push(makeDryRunAction(sessionId, actions.length, {
    type: ACTION_TYPES.SHELL_COMMAND,
    title: '运行演示命令',
    summary: '模拟运行 npm test。',
    payload: { command: 'npm test', cwd: options.cwd || '' },
    risk: 'medium',
    requiresConfirmation: true
  }))
  actions.push(makeDryRunAction(sessionId, actions.length, {
    type: ACTION_TYPES.FILE_WRITE,
    title: '写入演示输出',
    summary: '创建模拟的运行输出元数据。',
    payload: { path: 'dry-run-output.txt', content: '[演示模式] 模拟输出' },
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
    stdout: `[演示模式] ${stdout}`,
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
      return result(action, `将运行命令：${action.payload?.command || ''}`)
    case ACTION_TYPES.FILE_READ:
      return result(action, `将读取文件：${action.payload?.path || ''}`)
    case ACTION_TYPES.FILE_WRITE:
      return result(action, `将写入文件：${action.payload?.path || ''}`, { filesChanged: [action.payload?.path || 'dry-run-output.txt'] })
    case ACTION_TYPES.FILE_DELETE:
      return result(action, `将删除路径：${action.payload?.path || ''}`)
    case ACTION_TYPES.CODE_EXECUTE:
      return result(action, `将执行 ${action.payload?.language || 'code'} 代码片段。`)
    case ACTION_TYPES.SCREEN_OBSERVE:
      return result(action, '将观察模拟屏幕。', { screenshot: 'dry-run-screen.png' })
    case ACTION_TYPES.MOUSE_MOVE:
    case ACTION_TYPES.MOUSE_CLICK:
      return result(action, `将在 ${action.payload?.x ?? '?'}，${action.payload?.y ?? '?'} 执行鼠标动作。`)
    case ACTION_TYPES.KEYBOARD_TYPE:
      return result(action, `将输入 ${String(action.payload?.text || '').length} 个字符。`)
    case ACTION_TYPES.KEYBOARD_SHORTCUT:
      return result(action, `将按下快捷键 ${Array.isArray(action.payload?.keys) ? action.payload.keys.join('+') : action.payload?.keys || ''}。`)
    default:
      return {
        actionId: action.id,
        ok: false,
        exitCode: 1,
        stdout: '[演示模式] 不支持的动作。',
        stderr: `演示模式不支持此动作类型：${action.type}`,
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
