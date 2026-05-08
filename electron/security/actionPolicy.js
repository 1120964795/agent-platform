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
  if (!command) return 'Missing shell command.'
  if (FORMAT_PATTERN.test(command)) return 'Disk formatting and raw disk tooling are blocked.'
  if (SECURITY_DISABLE_PATTERN.test(command)) return 'Disabling security tooling is blocked.'
  if (HIDDEN_PATTERN.test(command)) return 'Hidden background execution is blocked.'
  if (/\brm\s+-[a-z]*r[a-z]*f\b/i.test(command) && /(\s\/\s*$|\s\\\s*$|\s\*\s*$|\s\.\s*$)/.test(command)) return 'Unbounded recursive delete is blocked.'
  if (UNBOUNDED_DELETE_PATTERN.test(command)) return 'Unbounded recursive delete is blocked.'
  if (CREDENTIAL_PATTERN.test(command) && EXFIL_PATTERN.test(command)) return 'Possible credential exfiltration is blocked.'
  return ''
}

function shellRisk(command) {
  const blocked = blockedShellReason(command)
  if (blocked) return { risk: RISK_LEVELS.BLOCKED, reason: blocked }
  if (INSTALL_PATTERN.test(command)) return { risk: RISK_LEVELS.HIGH, reason: 'Install or setup commands require explicit confirmation.' }
  if (DELETE_PATTERN.test(command)) return { risk: RISK_LEVELS.HIGH, reason: 'Delete commands require explicit confirmation.' }
  if (isLowShell(command)) return { risk: RISK_LEVELS.LOW, reason: 'Read-only shell command.' }
  return { risk: RISK_LEVELS.MEDIUM, reason: 'Shell command can affect the local environment.' }
}

function fileRisk(action) {
  const type = action.type
  if (type === ACTION_TYPES.FILE_READ) return { risk: RISK_LEVELS.LOW, reason: 'File read.' }
  if (type === ACTION_TYPES.FILE_DELETE) return { risk: RISK_LEVELS.HIGH, reason: 'File delete requires confirmation.' }
  if (type === ACTION_TYPES.FILE_WRITE) {
    if (action.payload?.overwrite) return { risk: RISK_LEVELS.HIGH, reason: 'Overwriting files requires confirmation.' }
    return { risk: RISK_LEVELS.MEDIUM, reason: 'File write can change the workspace.' }
  }
  if (type === ACTION_TYPES.FILE_MOVE) return { risk: RISK_LEVELS.HIGH, reason: 'Moving or renaming files requires confirmation.' }
  return null
}

function uiRisk(action, config = {}) {
  if (action.runtime === 'aionui-dry-run') {
    if (action.type === ACTION_TYPES.SCREEN_OBSERVE || action.type === ACTION_TYPES.SCREEN_REGION_SELECT) return { risk: RISK_LEVELS.LOW, reason: 'Dry-run screen simulation.' }
    return { risk: RISK_LEVELS.HIGH, reason: 'Dry-run GUI input simulation still requires confirmation.' }
  }
  if (action.type === ACTION_TYPES.SCREEN_OBSERVE || action.type === ACTION_TYPES.SCREEN_REGION_SELECT) {
    if (!config.uiTarsScreenAuthorized) return { risk: RISK_LEVELS.HIGH, reason: 'Screen authorization is required before observation.' }
    return { risk: RISK_LEVELS.LOW, reason: 'Authorized screen observation.' }
  }
  if ([ACTION_TYPES.MOUSE_MOVE, ACTION_TYPES.MOUSE_CLICK, ACTION_TYPES.KEYBOARD_TYPE, ACTION_TYPES.KEYBOARD_SHORTCUT].includes(action.type)) {
    if (!config.uiTarsScreenAuthorized) return { risk: RISK_LEVELS.BLOCKED, reason: 'GUI input is blocked until screen authorization is active.' }
    return { risk: RISK_LEVELS.HIGH, reason: 'Mouse and keyboard actions require confirmation.' }
  }
  return null
}

function codeRisk(action) {
  const code = String(action?.payload?.code || '')
  const blocked = blockedShellReason(code)
  if (blocked) return { risk: RISK_LEVELS.BLOCKED, reason: blocked }
  if (EXFIL_PATTERN.test(code) && CREDENTIAL_PATTERN.test(code)) return { risk: RISK_LEVELS.BLOCKED, reason: 'Possible credential exfiltration is blocked.' }
  if (/writeFile|unlink|rm\s|Remove-Item|child_process|subprocess|os\.system/i.test(code)) return { risk: RISK_LEVELS.HIGH, reason: 'Code can modify files or spawn commands.' }
  return { risk: RISK_LEVELS.MEDIUM, reason: 'Code execution requires confirmation unless proven read-only.' }
}

function evaluateAction(action = {}, config = {}) {
  let classification
  if (action.type === ACTION_TYPES.SHELL_COMMAND) classification = shellRisk(commandText(action))
  else if ([ACTION_TYPES.FILE_READ, ACTION_TYPES.FILE_WRITE, ACTION_TYPES.FILE_DELETE, ACTION_TYPES.FILE_MOVE].includes(action.type)) classification = fileRisk(action)
  else if (action.type === ACTION_TYPES.CODE_EXECUTE) classification = codeRisk(action)
  else if ([ACTION_TYPES.SCREEN_OBSERVE, ACTION_TYPES.SCREEN_REGION_SELECT, ACTION_TYPES.MOUSE_MOVE, ACTION_TYPES.MOUSE_CLICK, ACTION_TYPES.KEYBOARD_TYPE, ACTION_TYPES.KEYBOARD_SHORTCUT].includes(action.type)) classification = uiRisk(action, config)
  else if (action.type === ACTION_TYPES.RUNTIME_SETUP) classification = { risk: RISK_LEVELS.HIGH, reason: 'Runtime setup can install or change local software.' }
  else if ([ACTION_TYPES.RUNTIME_START, ACTION_TYPES.RUNTIME_STOP, ACTION_TYPES.OUTPUT_OPEN, ACTION_TYPES.AUDIT_EXPORT].includes(action.type)) classification = { risk: RISK_LEVELS.LOW, reason: 'Runtime control or local UI action.' }
  else classification = { risk: RISK_LEVELS.BLOCKED, reason: `Unknown action type: ${action.type}` }

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
