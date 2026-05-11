const { spawn } = require('child_process')
const { store } = require('../../store')
const { detect } = require('./bootstrap')

let child = null

function isRunning() {
  return Boolean(child && child.exitCode == null && !child.killed)
}

async function status(config = store.getConfig()) {
  const detected = await detect(config)
  return { ...detected, running: isRunning(), pid: isRunning() ? child.pid : null }
}

async function start(config = store.getConfig()) {
  if (isRunning()) return status(config)
  if (!config.uiTarsCommand) return { ...(await status(config)), running: false, message: '尚未配置 UI-TARS 启动命令。' }
  child = spawn(config.uiTarsCommand, {
    shell: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: config.workspace_root || process.cwd()
  })
  return status(config)
}

async function stop() {
  if (isRunning()) child.kill()
  child = null
  return { runtime: 'ui-tars', running: false }
}

module.exports = { status, start, stop, isRunning }
