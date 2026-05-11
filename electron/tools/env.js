const os = require('os')
const { execFileSync } = require('child_process')
const { register } = require('./index')

function whichCommand({ command }) {
  if (!command) {
    const error = new Error('需要提供命令。')
    error.code = 'INVALID_ARGS'
    throw error
  }
  const bin = process.platform === 'win32' ? 'where' : 'which'
  try {
    const stdout = execFileSync(bin, [command], { encoding: 'utf-8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })
    const foundPath = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0]
    return { found: Boolean(foundPath), path: foundPath }
  } catch {
    return { found: false }
  }
}

function getOsInfo() {
  const packageManagers = {}
  for (const name of ['winget', 'choco', 'scoop', 'brew']) {
    packageManagers[name] = whichCommand({ command: name }).found
  }
  return { platform: process.platform, arch: process.arch, shell: process.env.SHELL || process.env.ComSpec || '', package_managers: packageManagers, user_home: os.homedir(), cwd: process.cwd() }
}

register({ name: 'get_os_info', description: '获取操作系统信息和包管理器可用性。', parameters: { type: 'object', properties: {} } }, getOsInfo)
register({ name: 'which', description: '在 PATH 中查找可执行文件。', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } }, whichCommand)

module.exports = { getOsInfo, whichCommand }
