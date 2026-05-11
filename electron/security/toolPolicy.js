const { RISK_LEVELS } = require('./actionTypes')
const {
  INSTALL_PATTERN,
  DELETE_PATTERN,
  FORMAT_PATTERN,
  SECURITY_DISABLE_PATTERN,
  CREDENTIAL_PATTERN,
  EXFIL_PATTERN,
  HIDDEN_PATTERN,
  UNBOUNDED_DELETE_PATTERN,
  PS_INVOKE_EXPRESSION,
  LOW_SHELL_PREFIXES,
  CODE_EXFIL_PATTERN
} = require('./policyPatterns')
const { validatePath } = require('./pathSafety')
const os = require('os')

function shellRisk(command) {
  if (!command || typeof command !== 'string') {
    return { risk: RISK_LEVELS.BLOCKED, reason: '缺少 Shell 命令。' }
  }
  if (FORMAT_PATTERN.test(command)) return { risk: RISK_LEVELS.BLOCKED, reason: '磁盘格式化和原始磁盘工具已被阻止。' }
  if (SECURITY_DISABLE_PATTERN.test(command)) return { risk: RISK_LEVELS.BLOCKED, reason: '禁用安全工具的操作已被阻止。' }
  if (HIDDEN_PATTERN.test(command)) return { risk: RISK_LEVELS.BLOCKED, reason: '隐藏后台执行已被阻止。' }
  if (/\brm\s+-[a-z]*r[a-z]*f\b/i.test(command) && /(\s\/\s*$|\s\\\s*$|\s\*\s*$|\s\.\s*$)/.test(command)) return { risk: RISK_LEVELS.BLOCKED, reason: '无边界递归删除已被阻止。' }
  if (UNBOUNDED_DELETE_PATTERN.test(command)) return { risk: RISK_LEVELS.BLOCKED, reason: '无边界递归删除已被阻止。' }
  if (CREDENTIAL_PATTERN.test(command) && EXFIL_PATTERN.test(command)) return { risk: RISK_LEVELS.BLOCKED, reason: '疑似凭据外传已被阻止。' }
  if (PS_INVOKE_EXPRESSION.test(command)) return { risk: RISK_LEVELS.HIGH, reason: 'PowerShell Invoke-Expression 需要明确确认。' }
  if (INSTALL_PATTERN.test(command)) return { risk: RISK_LEVELS.HIGH, reason: '安装或设置命令需要明确确认。' }
  if (DELETE_PATTERN.test(command)) return { risk: RISK_LEVELS.HIGH, reason: '删除命令需要明确确认。' }
  if (LOW_SHELL_PREFIXES.some((prefix) => {
    const cmd = String(command).trim().toLowerCase()
    return cmd === prefix || cmd.startsWith(prefix + ' ')
  })) {
    return { risk: RISK_LEVELS.LOW, reason: '只读 Shell 命令。' }
  }
  return { risk: RISK_LEVELS.MEDIUM, reason: 'Shell 命令可能影响本地环境。' }
}

function codeRisk(code) {
  if (!code || typeof code !== 'string') {
    return { risk: RISK_LEVELS.BLOCKED, reason: '缺少代码。' }
  }
  const blocked = shellRisk(code)
  if (blocked.risk === RISK_LEVELS.BLOCKED) return blocked
  if ((EXFIL_PATTERN.test(code) || CODE_EXFIL_PATTERN.test(code)) && CREDENTIAL_PATTERN.test(code)) return { risk: RISK_LEVELS.BLOCKED, reason: '疑似凭据外传已被阻止。' }
  if (/writeFile|unlink|rm\s|Remove-Item|child_process|subprocess|os\.system/i.test(code)) return { risk: RISK_LEVELS.HIGH, reason: '代码可能修改文件或启动命令。' }
  return { risk: RISK_LEVELS.MEDIUM, reason: '代码执行可能影响本地环境。' }
}

function fileRisk(toolName, args, ctx) {
  const writableRoots = ctx.writableRoots || [os.homedir()]

  if (toolName === 'move_path') {
    const srcPath = args.src
    const destPath = args.dest
    if (!srcPath || !destPath) return { risk: RISK_LEVELS.BLOCKED, reason: 'move_path 需要提供 src 和 dest。' }
    const srcResult = validatePath(srcPath, 'write', { writableRoots })
    if (!srcResult.safe) return { risk: RISK_LEVELS.BLOCKED, reason: `源路径: ${srcResult.reason}` }
    const destResult = validatePath(destPath, 'write', { writableRoots })
    if (!destResult.safe) return { risk: RISK_LEVELS.BLOCKED, reason: `目标路径: ${destResult.reason}` }
    return { risk: RISK_LEVELS.HIGH, reason: '移动或重命名文件需要确认。' }
  }

  const filePath = args.path || args.root || args.src || args.dest
  if (!filePath) return { risk: RISK_LEVELS.BLOCKED, reason: '缺少路径参数。' }

  const isWrite = ['write_file', 'edit_file', 'create_dir', 'delete_path'].includes(toolName)
  const mode = isWrite ? 'write' : 'read'
  const pathResult = validatePath(filePath, mode, { writableRoots })
  if (!pathResult.safe) return { risk: RISK_LEVELS.BLOCKED, reason: pathResult.reason }

  if (toolName === 'read_file' || toolName === 'list_dir' || toolName === 'search_files') {
    return { risk: RISK_LEVELS.LOW, reason: '读取文件或目录。' }
  }
  if (toolName === 'write_file' && args.overwrite) {
    return { risk: RISK_LEVELS.HIGH, reason: '覆盖文件需要确认。' }
  }
  if (toolName === 'delete_path') return { risk: RISK_LEVELS.HIGH, reason: '删除文件需要确认。' }
  if (toolName === 'move_path') return { risk: RISK_LEVELS.HIGH, reason: '移动或重命名文件需要确认。' }
  return { risk: RISK_LEVELS.MEDIUM, reason: '写入文件会修改工作区。' }
}

function evaluateToolCall(name, args = {}, ctx = {}) {
  switch (name) {
    case 'read_file':
    case 'list_dir':
    case 'search_files':
    case 'write_file':
    case 'edit_file':
    case 'create_dir':
    case 'delete_path':
    case 'move_path':
      return fileRisk(name, args, ctx)

    case 'run_shell_command':
      return shellRisk(args.command)

    case 'code_execute':
      return codeRisk(args.code)

    case 'get_os_info':
    case 'which':
      return { risk: RISK_LEVELS.LOW, reason: '只读系统信息查询。' }

    case 'load_skill':
    case 'remember_user_rule':
    case 'forget_user_rule':
      return { risk: RISK_LEVELS.LOW, reason: '技能和规则管理。' }

    case 'generate_docx':
    case 'generate_pptx':
      return { risk: RISK_LEVELS.MEDIUM, reason: '文档生成会写入文件。' }

    case 'browser_task':
      return { risk: RISK_LEVELS.MEDIUM, reason: '浏览器自动化任务会操作真实网页。' }

    case 'desktop_observe':
      return { risk: RISK_LEVELS.LOW, reason: '桌面截图（只读）。' }

    case 'desktop_click':
      return { risk: RISK_LEVELS.HIGH, reason: '桌面点击会操作真实应用程序。' }

    case 'desktop_type':
      return { risk: RISK_LEVELS.MEDIUM, reason: '桌面输入会在当前焦点处输入文本。' }

    default:
      return { risk: RISK_LEVELS.BLOCKED, reason: `未知工具：${name}` }
  }
}

function evaluateToolCallWithMeta(name, args, ctx) {
  const classification = evaluateToolCall(name, args, ctx)
  const risk = classification.risk
  return {
    risk,
    reason: classification.reason,
    allowed: risk !== RISK_LEVELS.BLOCKED,
    requiresApproval: risk === RISK_LEVELS.HIGH
  }
}

module.exports = { evaluateToolCall: evaluateToolCallWithMeta, shellRisk, codeRisk, fileRisk }
