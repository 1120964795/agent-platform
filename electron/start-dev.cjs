const { spawn } = require('child_process')
const electron = require('electron')

delete process.env.ELECTRON_RUN_AS_NODE

setTimeout(() => {
  const child = spawn(electron, ['.'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  })

  child.on('error', (error) => {
    console.error(error)
    process.exit(1)
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }

    process.exit(code || 0)
  })
}, 3000)
