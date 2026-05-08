function firstToken(command = '') {
  return String(command || '').trim().split(/\s+/)[0]?.replace(/^['"]|['"]$/g, '').toLowerCase() || ''
}

function normalizeCommand(value = '') {
  return String(value || '').trim()
}

function extractUrl(command) {
  return command.match(/https?:\/\/[^\s'"]+/i)?.[0] || ''
}

function extractDownloadTarget(command) {
  return command.match(/(?:-OutFile|--output|-o)\s+([^\s;|&]+)/i)?.[1] || ''
}

function detectExtension(value = '') {
  const match = String(value || '').match(/\.([A-Za-z0-9]+)(?:$|[?#])/)
  return match ? `.${match[1].toLowerCase()}` : ''
}

function isExtremeRisk(command) {
  const value = command.toLowerCase()
  return /\bformat\b|\bdiskpart\b|remove-item\s+.*c:\\windows|del\s+.*c:\\windows|rm\s+-rf\s+\/|reg\s+delete\s+hklm/i.test(value)
}

function containsDownload(command) {
  return /\bcurl\b|\bwget\b|invoke-webrequest/i.test(command)
}

function containsChain(command) {
  return /\&\&|;|\|/.test(command)
}

function containsExecuteAfterDownload(command) {
  const parts = String(command).split(/\&\&|;|\|/).map((part) => part.trim()).filter(Boolean)
  if (parts.length <= 1) return false
  return parts.slice(1).some((part) => /(^\.\\|\.exe\b|\.msi\b|\.bat\b|\.ps1\b|\bstart\b|\bpowershell\b|\bcmd\b|\bmsiexec\b)/i.test(part))
}

function classifyRisk(command, options = {}) {
  const advancedRiskExecutionEnabled = options.advancedRiskExecutionEnabled === true
  const token = firstToken(command)
  const url = extractUrl(command)
  const targetPath = extractDownloadTarget(command) || url
  const extension = detectExtension(targetPath)
  const download = containsDownload(command) || Boolean(url)
  const executesAfterDownload = download && containsChain(command) && containsExecuteAfterDownload(command)
  const requiresNetwork = download || /\bpip(3)?\s+install\b|\bnpm\s+install\b|\bwinget\s+install\b|\bchoco\s+install\b|\bscoop\s+install\b/i.test(command)
  const willDeleteFiles = /\bdel\b|\berase\b|\brmdir\b|\brd\b|remove-item\b|\brm\b/i.test(command)
  const willModifySystemConfig = /\breg\b|\bsetx\b|PATH=|environment variable/i.test(command)
  const requiresAdmin = /\bwinget\b|\bchoco\b|\breg\b|program files|system32/i.test(command)

  if (isExtremeRisk(command)) {
    return {
      riskLevel: 'extreme',
      blocked: true,
      blockReason: 'EXTREME_RISK',
      riskExplanation: '该命令包含系统级破坏风险，始终阻止执行。'
    }
  }

  if (executesAfterDownload) {
    return {
      riskLevel: 'high',
      blocked: true,
      blockReason: 'SPLIT_DOWNLOAD_EXECUTE',
      riskExplanation: '下载后立即执行的链式命令必须拆分为两步。'
    }
  }

  if (download) {
    const isHttps = /^https:\/\//i.test(url)
    if (!advancedRiskExecutionEnabled && url && !isHttps) {
      return {
        riskLevel: 'high',
        blocked: true,
        blockReason: 'NON_HTTPS_DOWNLOAD_BLOCKED',
        riskExplanation: '高级风险模式关闭时，非 HTTPS 下载会被阻止。'
      }
    }
    if (!advancedRiskExecutionEnabled && (extension === '.bat' || extension === '.ps1')) {
      return {
        riskLevel: 'high',
        blocked: true,
        blockReason: 'SCRIPT_DOWNLOAD_BLOCKED',
        riskExplanation: '高级风险模式关闭时，脚本下载会被阻止。'
      }
    }
  }

  const lower = command.toLowerCase()
  if (
    /^pip(3)?\s+install\s+[\w@./:-]+$/i.test(command) ||
    /^npm\s+install(\s+[\w@./:-]+)?$/i.test(command) ||
    /^npm\s+run\s+dev$/i.test(command) ||
    /^python(3)?\s+.+$/i.test(command) ||
    /^git\s+status$/i.test(command) ||
    /^(java|javac|mvn|gradle)\s+-version$/i.test(command)
  ) {
    return {
      riskLevel: 'low',
      blocked: false,
      blockReason: '',
      riskExplanation: '该命令属于常见开发命令，风险较低。'
    }
  }

  if (
    /^git\s+pull$/i.test(command) ||
    /^npm\s+audit\s+fix$/i.test(command) ||
    /^pip(3)?\s+install\s+-r\s+/i.test(command) ||
    /^npx\s+/i.test(command) ||
    /^winget\s+install\s+/i.test(command)
  ) {
    return {
      riskLevel: 'medium',
      blocked: false,
      blockReason: '',
      riskExplanation: '该命令会修改依赖或本地环境，需要用户确认。'
    }
  }

  if (
    download ||
    token === 'taskkill' ||
    token === 'del' ||
    token === 'erase' ||
    token === 'rmdir' ||
    token === 'rd' ||
    token === 'rm' ||
    token === 'move' ||
    token === 'copy' ||
    token === 'reg' ||
    token === 'setx'
  ) {
    return {
      riskLevel: 'high',
      blocked: false,
      blockReason: '',
      riskExplanation: '该命令可能下载、删除文件或修改系统配置，需要更强确认。'
    }
  }

  return {
    riskLevel: 'medium',
    blocked: false,
    blockReason: '',
    riskExplanation: '该命令不在低风险白名单内，需要用户确认。'
  }
}

function buildExecutionPlan(input, options = {}) {
  const source = typeof input === 'string' ? { command: input } : { ...(input || {}) }
  const command = normalizeCommand(source.command)
  const url = extractUrl(command)
  const downloadTarget = extractDownloadTarget(command)
  const extension = detectExtension(downloadTarget || url)
  const risk = classifyRisk(command, options)

  return {
    id: source.id || '',
    label: source.label || command,
    command,
    cwd: source.cwd || '',
    reason: source.reason || '',
    riskLevel: risk.riskLevel,
    blocked: risk.blocked,
    blockReason: risk.blockReason,
    riskExplanation: risk.riskExplanation,
    requiresNetwork: containsDownload(command) || /\bpip(3)?\s+install\b|\bnpm\s+install\b|\bwinget\s+install\b|\bchoco\s+install\b|\bscoop\s+install\b/i.test(command),
    willDeleteFiles: /\bdel\b|\berase\b|\brmdir\b|\brd\b|remove-item\b|\brm\b/i.test(command),
    willModifySystemConfig: /\breg\b|\bsetx\b|PATH=|environment variable/i.test(command),
    requiresAdmin: /\bwinget\b|\bchoco\b|\breg\b|program files|system32/i.test(command),
    requiresStrongYesNo: risk.riskLevel === 'high' && !risk.blocked,
    downloadUrl: url || '',
    downloadTarget: downloadTarget || '',
    downloadExtension: extension || '',
    executesAfterDownload: containsDownload(command) && containsChain(command) && containsExecuteAfterDownload(command)
  }
}

module.exports = {
  buildExecutionPlan,
  classifyRisk,
  firstToken,
  extractUrl,
  extractDownloadTarget,
  detectExtension
}
