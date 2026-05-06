const { spawn } = require('child_process')
const crypto = require('crypto')
const { tail } = require('./stepExecutor')

class ServiceProcessManager {
  constructor(deps = {}) {
    this.processes = new Map()
    this.emit = deps.emit || (() => {})
  }

  async start(step, context = {}) {
    const serviceId = `svc_${crypto.randomUUID().slice(0, 8)}`
    const stdout = []
    const stderr = []
    const child = process.platform === 'win32'
      ? spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', step.command], { cwd: step.cwd || process.cwd(), windowsHide: true })
      : spawn('/bin/bash', ['-lc', step.command], { cwd: step.cwd || process.cwd() })
    const record = {
      serviceId,
      stepId: step.id,
      command: step.command,
      cwd: step.cwd,
      pid: child.pid,
      status: 'running',
      detectedPort: step.detectPort || null,
      lastOutputAt: new Date().toISOString()
    }
    this.processes.set(serviceId, { child, record, stdout, stderr })
    context.serviceProcesses?.push(record)

    child.stdout.on('data', (chunk) => {
      stdout.push(chunk.toString('utf8'))
      record.lastOutputAt = new Date().toISOString()
      this.emit('workflow:event', { kind: 'service-output', serviceId, stream: 'stdout', text: chunk.toString('utf8') })
    })
    child.stderr.on('data', (chunk) => {
      stderr.push(chunk.toString('utf8'))
      record.lastOutputAt = new Date().toISOString()
      this.emit('workflow:event', { kind: 'service-output', serviceId, stream: 'stderr', text: chunk.toString('utf8') })
    })
    child.on('close', (code) => {
      record.status = code === 0 ? 'exited' : 'failed'
      record.exitCode = code
      this.emit('workflow:event', { kind: 'service-close', serviceId, exitCode: code })
    })

    const timeoutMs = Number(step.timeoutMs || 30000)
    await new Promise((resolve) => setTimeout(resolve, Math.min(timeoutMs, 500)))
    const output = `${stdout.join('')}\n${stderr.join('')}`
    const hasError = (step.errorPatterns || []).some((pattern) => output.includes(pattern))
    const hasSuccess = !step.successPatterns?.length || step.successPatterns.some((pattern) => output.includes(pattern))
    return {
      status: hasError ? 'failed' : (hasSuccess ? 'completed' : 'completed'),
      exitCode: null,
      stdoutTail: tail(stdout.join('')),
      stderrTail: tail(stderr.join('')),
      serviceProcess: record
    }
  }

  stop(serviceId) {
    const entry = this.processes.get(serviceId)
    if (!entry) throw new Error(`service not found: ${serviceId}`)
    entry.child.kill('SIGTERM')
    entry.record.status = 'stopping'
    return entry.record
  }

  list() {
    return [...this.processes.values()].map((entry) => entry.record)
  }
}

module.exports = { ServiceProcessManager }
