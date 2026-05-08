const { spawn } = require('child_process')
const { store } = require('../store')
const { requestConfirm } = require('../confirm')
const { register } = require('./index')

const DEFAULT_WHITELIST = ['npm', 'pnpm', 'yarn', 'npx', 'pip', 'pip3', 'python', 'python3', 'node', 'git', 'curl', 'wget', 'winget', 'choco', 'scoop', 'where', 'echo', 'dir', 'type', 'ls', 'cat']
const DEFAULT_BLACKLIST = ['rm', 'rmdir', 'rd', 'del', 'erase', 'format', 'diskpart', 'shutdown', 'reboot', 'taskkill', 'reg', 'regedit', 'mkfs', 'dd', 'fdisk']
const MAX_OUTPUT_BYTES = 1024 * 1024

function firstToken(command = '') {
  return String(command).trim().split(/\s+/)[0]?.replace(/^['"]|['"]$/g, '').toLowerCase() || ''
}

function appendOutput(target, chunk) {
  if (target.bytes >= MAX_OUTPUT_BYTES) {
    target.truncated = true
    return
  }
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8')
  const remaining = MAX_OUTPUT_BYTES - target.bytes
  if (buffer.length <= remaining) {
    target.text += buffer.toString('utf8')
    target.bytes += buffer.length
    return
  }
  target.text += buffer.subarray(0, remaining).toString('utf8')
  target.bytes += remaining
  target.truncated = true
}

async function runShellCommand({ command, cwd, timeout_ms = 120000 }, { onLog } = {}) {
  if (!command || typeof command !== 'string') return { error: { code: 'INVALID_ARGS', message: '需要提供命令。' } }
  const config = store.getConfig()
  const token = firstToken(command)
  const blacklist = new Set([...DEFAULT_BLACKLIST, ...(config.shell_blacklist_extra || []).map((item) => String(item).toLowerCase())])
  const whitelist = new Set([...DEFAULT_WHITELIST, ...(config.shell_whitelist_extra || []).map((item) => String(item).toLowerCase())])
  if (blacklist.has(token)) return { error: { code: 'PERMISSION_DENIED', message: `命令已被阻止：${token}` } }
  if (!whitelist.has(token)) {
    const allowed = await requestConfirm({ kind: 'shell-command', payload: { command, cwd } })
    if (!allowed) return { error: { code: 'USER_CANCELLED', message: '用户已取消命令。' } }
  }

  const workingDir = cwd || config.workspace_root || process.cwd()
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const stdout = { text: '', bytes: 0, truncated: false }
    const stderr = { text: '', bytes: 0, truncated: false }
    let timedOut = false
    const child = process.platform === 'win32'
      ? spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', command], { cwd: workingDir, windowsHide: true })
      : spawn('/bin/bash', ['-lc', command], { cwd: workingDir })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => { if (!child.killed) child.kill('SIGKILL') }, 2000)
    }, Number(timeout_ms) || 120000)

    child.stdout.on('data', (chunk) => {
      appendOutput(stdout, chunk)
      onLog?.('stdout', chunk.toString('utf8'))
    })
    child.stderr.on('data', (chunk) => {
      appendOutput(stderr, chunk)
      onLog?.('stderr', chunk.toString('utf8'))
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ error: { code: error.code === 'ENOENT' ? 'COMMAND_NOT_FOUND' : 'INTERNAL', message: error.message } })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) resolve({ error: { code: 'COMMAND_TIMEOUT', message: `命令在 ${timeout_ms}ms 后超时。` }, stdout: stdout.text, stderr: stderr.text, exit_code: code, truncated: stdout.truncated || stderr.truncated, duration_ms: Date.now() - startedAt })
      else resolve({ stdout: stdout.text, stderr: stderr.text, exit_code: code, truncated: stdout.truncated || stderr.truncated, duration_ms: Date.now() - startedAt })
    })
  })
}

register({ name: 'run_shell_command', description: 'Run a local shell command using the configured three-tier shell policy.', parameters: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' }, timeout_ms: { type: 'number' } }, required: ['command'] } }, runShellCommand)

module.exports = { runShellCommand, firstToken, DEFAULT_WHITELIST, DEFAULT_BLACKLIST }
