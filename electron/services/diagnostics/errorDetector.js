function normalizeText(text) {
  return String(text || '').replace(/\r\n/g, '\n').trim()
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match
  }
  return null
}

function detectError(rawText) {
  const text = normalizeText(rawText)
  if (!text) return null

  const moduleMissing = firstMatch(text, [
    /ModuleNotFoundError:\s*No module named ['"]([^'"]+)['"]/i,
    /ImportError:\s*No module named ['"]?([^'"\s]+)['"]?/i
  ])
  if (moduleMissing) {
    const moduleName = moduleMissing[1]
    return {
      category: 'python',
      title: `Python 缺少模块：${moduleName}`,
      errorSignature: `python:module-not-found:${moduleName.toLowerCase()}`,
      summary: `当前 Python 环境缺少 ${moduleName} 模块。`,
      projectType: 'Python',
      riskLevel: 'medium',
      commands: [`pip install ${moduleName}`],
      keywords: ['python', 'module', moduleName]
    }
  }

  const portInUse = firstMatch(text, [
    /EADDRINUSE.*?(?::|port\s+)(\d{2,5})/i,
    /address already in use.*?(?::|port\s+)(\d{2,5})/i,
    /listen EADDRINUSE[^\n]*(\d{2,5})/i
  ])
  if (portInUse) {
    const port = portInUse[1]
    return {
      category: 'port',
      title: `端口被占用：${port}`,
      errorSignature: `port:in-use:${port}`,
      summary: `${port} 端口已经被其他进程占用。`,
      projectType: 'Node/Python',
      riskLevel: 'medium',
      commands: process.platform === 'win32'
        ? [`netstat -ano | findstr :${port}`]
        : [`lsof -i :${port}`],
      keywords: ['port', port, 'EADDRINUSE']
    }
  }

  const npmError = firstMatch(text, [/npm ERR![\s\S]*?code\s+([A-Z0-9_-]+)/i])
  if (npmError) {
    const code = npmError[1]
    return {
      category: 'node',
      title: `NPM 错误：${code}`,
      errorSignature: `node:npm:${code.toLowerCase()}`,
      summary: `npm 执行失败，错误码为 ${code}。`,
      projectType: 'Node',
      riskLevel: 'low',
      commands: ['npm install'],
      keywords: ['npm', code]
    }
  }

  const gitError = firstMatch(text, [/fatal:\s+(.+)/i, /error:\s+pathspec\s+(.+)/i])
  if (gitError && /git|fatal:|pathspec/i.test(text)) {
    const message = gitError[1].slice(0, 80)
    return {
      category: 'git',
      title: `Git 错误：${message}`,
      errorSignature: `git:${message.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 64)}`,
      summary: message,
      projectType: 'Git',
      riskLevel: 'low',
      commands: ['git status'],
      keywords: ['git', 'fatal']
    }
  }

  const javaError = firstMatch(text, [/Exception in thread ".*?"\s+([\w.]+Exception)/, /Caused by:\s+([\w.]+Exception)/])
  if (javaError) {
    const exception = javaError[1]
    return {
      category: 'java',
      title: `Java 异常：${exception}`,
      errorSignature: `java:${exception.toLowerCase()}`,
      summary: `检测到 ${exception}。`,
      projectType: 'Java',
      riskLevel: 'low',
      commands: ['mvn test'],
      keywords: ['java', exception]
    }
  }

  return null
}

module.exports = { detectError, normalizeText }
