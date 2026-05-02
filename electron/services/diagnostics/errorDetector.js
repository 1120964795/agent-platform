const crypto = require('crypto')

function uniqueStrings(items = []) {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))]
}

function normalizePackageName(value = '') {
  return String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/[\\/]/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .toLowerCase()
}

function makeEvent(definition, text, context = {}, extra = {}) {
  const rawSnippet = String(extra.rawSnippet || text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6)
    .join('\n')
    .slice(0, 1000)

  const detectedAt = extra.detectedAt || new Date().toISOString()
  const signature = extra.signature || definition.signature
  const idSeed = `${signature}:${detectedAt}:${rawSnippet}`

  return {
    id: extra.id || `err_${crypto.createHash('md5').update(idSeed).digest('hex').slice(0, 12)}`,
    signature,
    title: extra.title || definition.title,
    type: extra.type || definition.type,
    severity: extra.severity || definition.severity || 'medium',
    appName: context.appName || '',
    windowTitle: context.windowTitle || '',
    projectDir: context.projectDir || '',
    rawSnippet,
    keywords: uniqueStrings(extra.keywords || definition.keywords || []),
    priority: extra.priority || definition.priority || 50,
    detectedAt,
    captureSource: context.captureSource || extra.captureSource || 'unknown'
  }
}

function detectPythonModuleNotFound(text, context) {
  const match = text.match(/ModuleNotFoundError:\s+No module named ['"]?([A-Za-z0-9_.-]+)/i)
  if (!match) return null
  const pkg = normalizePackageName(match[1])
  return makeEvent({
    title: 'Python 依赖缺失',
    type: 'ModuleNotFoundError',
    severity: 'medium',
    priority: 80
  }, text, context, {
    signature: `python.module_not_found.${pkg}`,
    keywords: ['ModuleNotFoundError', pkg, 'Python'],
    rawSnippet: match[0]
  })
}

function detectNodeModuleNotFound(text, context) {
  const match = text.match(/Cannot find module ['"]([^'"]+)['"]/i)
  if (!match) return null
  const pkg = normalizePackageName(match[1].split(/[\\/]/).pop())
  return makeEvent({
    title: 'Node 模块缺失',
    type: 'NodeModuleNotFound',
    severity: 'medium',
    priority: 75
  }, text, context, {
    signature: `node.module_not_found.${pkg}`,
    keywords: ['Cannot find module', pkg, 'Node'],
    rawSnippet: match[0]
  })
}

function detectNpmError(text, context) {
  const match = text.match(/npm ERR!\s+code\s+([A-Z0-9_]+)/i)
  if (!match) return null
  return makeEvent({
    title: 'npm 执行错误',
    type: 'NpmError',
    severity: 'medium',
    priority: 65
  }, text, context, {
    signature: 'node.npm_error',
    keywords: ['npm', 'ERR', match[1]],
    rawSnippet: match[0]
  })
}

function detectPortInUse(text, context) {
  const match = text.match(/(?:EADDRINUSE|address already in use)[^0-9]*(\d{2,5})/i)
  if (!match) return null
  const port = match[1]
  return makeEvent({
    title: '端口被占用',
    type: 'PortInUse',
    severity: 'medium',
    priority: 70
  }, text, context, {
    signature: `network.port_in_use.${port}`,
    keywords: ['EADDRINUSE', port, 'port'],
    rawSnippet: match[0]
  })
}

function detectGitConflict(text, context) {
  const match = text.match(/CONFLICT\s*\(.*?\):.*|merge conflict.*|CONFLICT .*Merge conflict.*/i)
  if (!match) return null
  return makeEvent({
    title: 'Git 合并冲突',
    type: 'GitMergeConflict',
    severity: 'high',
    priority: 85
  }, text, context, {
    signature: 'git.merge_conflict',
    keywords: ['CONFLICT', 'merge', 'git'],
    rawSnippet: match[0]
  })
}

function detectJavaCommandNotFound(text, context) {
  const match = text.match(/['"]?(javac|java|mvn|gradle)['"]?\s+(?:is not recognized as an internal or external command|: command not found)/i)
  if (!match) return null
  const command = match[1].toLowerCase()
  return makeEvent({
    title: 'Java 命令不存在',
    type: 'JavaCommandNotFound',
    severity: 'medium',
    priority: 75
  }, text, context, {
    signature: `java.command_not_found.${command}`,
    keywords: [command, 'Java', 'command not found'],
    rawSnippet: match[0]
  })
}

function detectJavaClassNotFound(text, context) {
  const match = text.match(/ClassNotFoundException:\s+([A-Za-z0-9_.$]+)/i)
  if (!match) return null
  const className = normalizePackageName(match[1]).replace(/\$/g, '.')
  return makeEvent({
    title: 'Java 类找不到',
    type: 'JavaClassNotFound',
    severity: 'medium',
    priority: 75
  }, text, context, {
    signature: `java.class_not_found.${className}`,
    keywords: ['ClassNotFoundException', className, 'Java'],
    rawSnippet: match[0]
  })
}

function detectJavaMainClass(text, context) {
  const match = text.match(/Could not find or load main class\s+([A-Za-z0-9_.$]+)/i)
  if (!match) return null
  const className = normalizePackageName(match[1]).replace(/\$/g, '.')
  return makeEvent({
    title: 'Java 主类找不到',
    type: 'JavaMainClassNotFound',
    severity: 'medium',
    priority: 75
  }, text, context, {
    signature: `java.main_class_not_found.${className}`,
    keywords: ['main class', className, 'Java'],
    rawSnippet: match[0]
  })
}

function detectJavaUnsupportedVersion(text, context) {
  const match = text.match(/UnsupportedClassVersionError:.*?class file version\s+([0-9.]+)/i)
  if (!match) return null
  const version = String(match[1]).toLowerCase()
  return makeEvent({
    title: 'Java 版本不兼容',
    type: 'UnsupportedClassVersionError',
    severity: 'medium',
    priority: 70
  }, text, context, {
    signature: `java.unsupported_class_version.${version}`,
    keywords: ['UnsupportedClassVersionError', version, 'Java'],
    rawSnippet: match[0]
  })
}

function detectMavenFailure(text, context) {
  const match = text.match(/BUILD FAILURE|Failed to execute goal/i)
  if (!match) return null
  return makeEvent({
    title: 'Maven 构建失败',
    type: 'MavenBuildFailure',
    severity: 'medium',
    priority: 70
  }, text, context, {
    signature: 'java.maven_build_failure',
    keywords: ['Maven', 'BUILD FAILURE', 'Java'],
    rawSnippet: match[0]
  })
}

function detectGradleFailure(text, context) {
  const match = text.match(/BUILD FAILED in|Gradle task failed/i)
  if (!match) return null
  return makeEvent({
    title: 'Gradle 构建失败',
    type: 'GradleBuildFailure',
    severity: 'medium',
    priority: 70
  }, text, context, {
    signature: 'java.gradle_build_failure',
    keywords: ['Gradle', 'BUILD FAILED', 'Java'],
    rawSnippet: match[0]
  })
}

function detectShellCommandNotFound(text, context) {
  const winMatch = text.match(/['"]?([A-Za-z0-9_.-]+)['"]?\s+is not recognized as an internal or external command/i)
  const unixMatch = text.match(/([A-Za-z0-9_.-]+): command not found/i)
  const match = winMatch || unixMatch
  if (!match) return null
  const command = normalizePackageName(match[1])
  return makeEvent({
    title: '命令不存在',
    type: 'ShellCommandNotFound',
    severity: 'medium',
    priority: 60
  }, text, context, {
    signature: `shell.command_not_found.${command}`,
    keywords: [command, 'command not found', 'shell'],
    rawSnippet: match[0]
  })
}

function detectEnoent(text, context) {
  const match = text.match(/\bENOENT\b.*$/im)
  if (!match) return null
  return makeEvent({
    title: '文件或路径不存在',
    type: 'ENOENT',
    severity: 'medium',
    priority: 60
  }, text, context, {
    signature: 'fs.enoent',
    keywords: ['ENOENT', 'path', 'file'],
    rawSnippet: match[0]
  })
}

const DETECTORS = [
  detectPythonModuleNotFound,
  detectNodeModuleNotFound,
  detectNpmError,
  detectPortInUse,
  detectGitConflict,
  detectJavaCommandNotFound,
  detectJavaClassNotFound,
  detectJavaMainClass,
  detectJavaUnsupportedVersion,
  detectMavenFailure,
  detectGradleFailure,
  detectShellCommandNotFound,
  detectEnoent
]

function detectError({ text, context = {} } = {}) {
  const normalizedText = String(text || '').trim()
  if (!normalizedText) return null
  for (const detector of DETECTORS) {
    const result = detector(normalizedText, context)
    if (result) return result
  }
  return null
}

module.exports = { detectError, DETECTORS, normalizePackageName, uniqueStrings }
