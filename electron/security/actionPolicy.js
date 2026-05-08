const { ACTION_TYPES, RISK_LEVELS } = require('./actionTypes')

const LOW_SHELL_PREFIXES = [
  'pwd', 'cd', 'dir', 'ls', 'type', 'cat', 'where', 'which', 'echo',
  'git status', 'git diff', 'git log', 'npm --version', 'node --version',
  'python --version', 'pip --version'
]

const INSTALL_PATTERN = /\b(npm|pnpm|yarn|pip|pip3|uv|winget|choco|scoop)\s+(install|add|i)\b|\bsetup\.exe\b|\bmsiexec\b/i
const DELETE_PATTERN = /\b(rm|del|erase|rd|rmdir|remove-item)\b/i
const FORMAT_PATTERN = /\b(format|diskpart|mkfs|dd)\b/i
const SECURITY_DISABLE_PATTERN = /\b(Set-MpPreference|DisableRealtimeMonitoring|Add-MpPreference|netsh\s+advfirewall|sc\s+stop|Stop-Service)\b/i
const CREDENTIAL_PATTERN = /\b(api[_-]?key|secret|token|password|passwd|credential|authorization|bearer)\b/i
const EXFIL_PATTERN = /\b(curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod)\b/i
const HIDDEN_PATTERN = /\b(-WindowStyle\s+Hidden|Start-Process\b.*\bHidden\b|nohup\b|setsid\b|schtasks\s+\/create|Start-Job\b)\b/i
const UNBOUNDED_DELETE_PATTERN = /\b(rm\s+(-[a-z]*r[a-z]*f|-rf|-fr)\s+([\\/]|\.|\*)|del\s+\/s\s+\/q\s+([A-Z]:\\|\\|\*)|remove-item\b.*\b-recurse\b.*\b-force\b.*([A-Z]:\\|\\|\*))\b/i

function commandText(action) {
  return String(action?.payload?.command || action?.payload?.script || '').trim()
}

function lower(value) {
  return String(value || '').trim().toLowerCase()
}

function isLowShell(command) {
  const cmd = lower(command)
  return LOW_SHELL_PREFIXES.some((prefix) => cmd === prefix || cmd.startsWith(`${prefix} `))
}

function blockedShellReason(command) {
  if (!command) return '缺少 Shell 命令。'
  if (FORMAT_PATTERN.test(command)) return '磁盘格式化和原始磁盘工具已被阻止。'
  if (SECURITY_DISABLE_PATTERN.test(command)) return '禁用安全工具的操作已被阻止。'
  if (HIDDEN_PATTERN.test(command)) return '隐藏后台执行已被阻止。'
  if (/\brm\s+-[a-z]*r[a-z]*f\b/i.test(command) && /(\s\/\s*$|\s\\\s*$|\s\*\s*$|\s\.\s*$)/.test(command)) return '无边界递归删除已被阻止。'
  if (UNBOUNDED_DELETE_PATTERN.test(command)) return '无边界递归删除已被阻止。'
  if (CREDENTIAL_PATTERN.test(command) && EXFIL_PATTERN.test(command)) return '疑似凭据外传已被阻止。'
  return ''
}

function shellRisk(command) {
  const blocked = blockedShellReason(command)
  if (blocked) return { risk: RISK_LEVELS.BLOCKED, reason: blocked }
  if (INSTALL_PATTERN.test(command)) return { risk: RISK_LEVELS.HIGH, reason: '安装或设置命令需要明确确认。' }
  if (DELETE_PATTERN.test(command)) return { risk: RISK_LEVELS.HIGH, reason: '删除命令需要明确确认。' }
  if (isLowShell(command)) return { risk: RISK_LEVELS.LOW, reason: '只读 Shell 命令。' }
  return { risk: RISK_LEVELS.MEDIUM, reason: 'Shell 命令可能影响本地环境。' }
}

function fileRisk(action) {
  const type = action.type
  if (type === ACTION_TYPES.FILE_READ) return { risk: RISK_LEVELS.LOW, reason: '读取文件。' }
  if (type === ACTION_TYPES.FILE_DELETE) return { risk: RISK_LEVELS.HIGH, reason: '删除文件需要确认。' }
  if (type === ACTION_TYPES.FILE_WRITE) {
    if (action.payload?.overwrite) return { risk: RISK_LEVELS.HIGH, reason: '覆盖文件需要确认。' }
    return { risk: RISK_LEVELS.MEDIUM, reason: '写入文件会修改工作区。' }
  }
  if (type === ACTION_TYPES.FILE_MOVE) return { risk: RISK_LEVELS.HIGH, reason: '移动或重命名文件需要确认。' }
  return null
}

function uiRisk(action, config = {}) {
  if (action.runtime === 'aionui-dry-run') {
    if (action.type === ACTION_TYPES.SCREEN_OBSERVE || action.type === ACTION_TYPES.SCREEN_REGION_SELECT) return { risk: RISK_LEVELS.LOW, reason: '演示模式屏幕模拟。' }
    return { risk: RISK_LEVELS.HIGH, reason: '演示模式的图形界面输入仍需确认。' }
  }
  if (action.type === ACTION_TYPES.SCREEN_OBSERVE || action.type === ACTION_TYPES.SCREEN_REGION_SELECT) {
    if (!config.uiTarsScreenAuthorized) return { risk: RISK_LEVELS.HIGH, reason: '观察屏幕前需要先完成屏幕授权。' }
    return { risk: RISK_LEVELS.LOW, reason: '已授权的屏幕观察。' }
  }
  if ([ACTION_TYPES.MOUSE_MOVE, ACTION_TYPES.MOUSE_CLICK, ACTION_TYPES.KEYBOARD_TYPE, ACTION_TYPES.KEYBOARD_SHORTCUT].includes(action.type)) {
    if (!config.uiTarsScreenAuthorized) return { risk: RISK_LEVELS.BLOCKED, reason: '屏幕授权启用前，图形界面输入会被阻止。' }
    return { risk: RISK_LEVELS.HIGH, reason: '鼠标和键盘动作需要确认。' }
  }
  return null
}

function codeRisk(action) {
  const code = String(action?.payload?.code || '')
  const blocked = blockedShellReason(code)
  if (blocked) return { risk: RISK_LEVELS.BLOCKED, reason: blocked }
  if (EXFIL_PATTERN.test(code) && CREDENTIAL_PATTERN.test(code)) return { risk: RISK_LEVELS.BLOCKED, reason: '疑似凭据外传已被阻止。' }
  if (/writeFile|unlink|rm\s|Remove-Item|child_process|subprocess|os\.system/i.test(code)) return { risk: RISK_LEVELS.HIGH, reason: '代码可能修改文件或启动命令。' }
  return { risk: RISK_LEVELS.MEDIUM, reason: '代码执行需要确认，除非能证明为只读。' }
}

function evaluateAction(action = {}, config = {}) {
  let classification
  if (action.type === ACTION_TYPES.SHELL_COMMAND) classification = shellRisk(commandText(action))
  else if ([ACTION_TYPES.FILE_READ, ACTION_TYPES.FILE_WRITE, ACTION_TYPES.FILE_DELETE, ACTION_TYPES.FILE_MOVE].includes(action.type)) classification = fileRisk(action)
  else if (action.type === ACTION_TYPES.CODE_EXECUTE) classification = codeRisk(action)
  else if ([ACTION_TYPES.SCREEN_OBSERVE, ACTION_TYPES.SCREEN_REGION_SELECT, ACTION_TYPES.MOUSE_MOVE, ACTION_TYPES.MOUSE_CLICK, ACTION_TYPES.KEYBOARD_TYPE, ACTION_TYPES.KEYBOARD_SHORTCUT].includes(action.type)) classification = uiRisk(action, config)
  else if (action.type === ACTION_TYPES.RUNTIME_SETUP) classification = { risk: RISK_LEVELS.HIGH, reason: '运行时设置可能安装或修改本地软件。' }
  else if ([ACTION_TYPES.RUNTIME_START, ACTION_TYPES.RUNTIME_STOP, ACTION_TYPES.OUTPUT_OPEN, ACTION_TYPES.AUDIT_EXPORT].includes(action.type)) classification = { risk: RISK_LEVELS.LOW, reason: '运行时控制或本地界面动作。' }
  else classification = { risk: RISK_LEVELS.BLOCKED, reason: `未知动作类型：${action.type}` }

  const risk = classification.risk
  return {
    allowed: risk !== RISK_LEVELS.BLOCKED,
    blocked: risk === RISK_LEVELS.BLOCKED,
    risk,
    requiresConfirmation: risk === RISK_LEVELS.MEDIUM || risk === RISK_LEVELS.HIGH,
    reasons: [classification.reason].filter(Boolean)
  }
}

module.exports = {
  evaluateAction,
  shellRisk,
  blockedShellReason
}
