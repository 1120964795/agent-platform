const { execSync } = require('child_process')

function findCommand(cmd) {
  try {
    const whereCmd = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`
    const output = execSync(whereCmd, { encoding: 'utf8', timeout: 5000 }).trim()
    return output.split('\n')[0].trim() || null
  } catch {
    return null
  }
}

async function detect() {
  const result = {
    python: null,
    pythonVersion: null,
    uv: null,
    browserUse: null,
    playwright: null,
    ready: false,
    issues: []
  }

  const pythonPath = findCommand('python')
  if (!pythonPath) {
    result.issues.push('Python 未安装。请安装 Python 3.11+ (https://python.org)')
    return result
  }
  result.python = pythonPath

  try {
    const versionOutput = execSync('python --version 2>&1', { encoding: 'utf8', timeout: 5000 }).trim()
    result.pythonVersion = versionOutput
    const match = versionOutput.match(/Python (\d+)\.(\d+)/)
    if (!match || parseInt(match[1]) < 3 || (parseInt(match[1]) === 3 && parseInt(match[2]) < 11)) {
      result.issues.push(`Python 3.11+ 需要，当前为 ${versionOutput}`)
      return result
    }
  } catch {
    result.issues.push('无法检测 Python 版本。')
    return result
  }

  try { result.uv = findCommand('uv') } catch {}

  try {
    execSync('python -c "import browser_use"', { encoding: 'utf8', timeout: 10000 })
    result.browserUse = true
  } catch {
    result.issues.push('browser-use 未安装。运行: pip install browser-use')
  }

  try {
    execSync('python -c "from playwright.sync_api import sync_playwright"', { encoding: 'utf8', timeout: 10000 })
    result.playwright = true
  } catch {
    result.issues.push('playwright 未安装。运行: playwright install chromium')
  }

  result.ready = result.issues.length === 0
  return result
}

function getSetupGuide(detection) {
  const steps = []
  if (!detection.python) {
    steps.push('1. 安装 Python 3.11+: https://python.org/downloads/')
    steps.push('2. 确保 Python 已添加到 PATH')
  }
  if (!detection.browserUse) {
    steps.push('3. 运行: pip install browser-use')
  }
  if (!detection.playwright) {
    steps.push('4. 运行: playwright install chromium')
  }
  if (detection.uv) {
    steps.push('提示: 检测到 uv，可用 `uv pip install browser-use` 加速安装')
  }
  return steps.length ? steps : ['Python 环境已就绪。']
}

module.exports = { detect, getSetupGuide }
