const crypto = require('crypto')

class ObserverSessionManager {
  constructor(options = {}) {
    this.now = options.now || (() => Date.now())
    this.setInterval = options.setInterval || global.setInterval
    this.clearInterval = options.clearInterval || global.clearInterval
    this.activeSession = null
    this.dedupeCache = new Map()
    this.ignoreCache = new Map()
    this.timer = null
    this.tickInFlight = false
  }

  createId() {
    return `obs_${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10)}`
  }

  getStatus() {
    return this.activeSession ? { ...this.activeSession } : null
  }

  clearTimer() {
    if (!this.timer) return
    this.clearInterval(this.timer)
    this.timer = null
  }

  start(options = {}) {
    this.stop()
    const intervalMs = [500, 1000, 1500, 3000, 5000, 10000].includes(Number(options.intervalMs)) ? Number(options.intervalMs) : 1000
    const nowIso = new Date(this.now()).toISOString()
    this.activeSession = {
      id: this.createId(),
      username: options.username || 'guest',
      status: 'running',
      continuous: Boolean(options.continuous),
      target: options.target || null,
      projectDir: options.projectDir || '',
      captureMode: options.target?.type === 'region' ? 'ocr-only' : 'uia-first',
      intervalMs,
      startedAt: nowIso,
      lastCaptureAt: '',
      lastErrorSignature: '',
      cooldownUntil: '',
      failureCount: 0,
      targetLabel: options.target?.title || options.target?.appName || options.target?.displayId || ''
    }

    const runner = typeof options.onTick === 'function' ? options.onTick : null
    if (runner) {
      this.timer = this.setInterval(() => {
        this.runTick(runner).catch(() => {})
      }, intervalMs)
      void this.runTick(runner)
    }

    return this.getStatus()
  }

  stop() {
    this.clearTimer()
    const previous = this.activeSession ? { ...this.activeSession, status: 'stopped' } : null
    this.activeSession = null
    this.tickInFlight = false
    return previous
  }

  pause(reason = '') {
    if (!this.activeSession) return null
    this.activeSession.status = 'paused'
    if (reason) this.activeSession.pauseReason = reason
    return this.getStatus()
  }

  resume() {
    if (!this.activeSession) return null
    this.activeSession.status = 'running'
    delete this.activeSession.pauseReason
    return this.getStatus()
  }

  resumeNow() {
    if (!this.activeSession) return null
    this.activeSession.cooldownUntil = ''
    return this.resume()
  }

  enterCooldown(ms = 30000) {
    if (!this.activeSession) return null
    this.activeSession.cooldownUntil = new Date(this.now() + ms).toISOString()
    return this.getStatus()
  }

  inCooldown() {
    if (!this.activeSession?.cooldownUntil) return false
    return this.now() < new Date(this.activeSession.cooldownUntil).getTime()
  }

  ignore(signature, ttlMs = 30 * 60 * 1000) {
    const expiresAt = this.now() + ttlMs
    this.ignoreCache.set(signature, expiresAt)
    this.enterCooldown()
    return expiresAt
  }

  isIgnored(signature) {
    const expiresAt = this.ignoreCache.get(signature)
    if (!expiresAt) return false
    if (expiresAt <= this.now()) {
      this.ignoreCache.delete(signature)
      return false
    }
    return true
  }

  isDuplicate(signature) {
    const expiresAt = this.dedupeCache.get(signature)
    if (!expiresAt) return false
    if (expiresAt <= this.now()) {
      this.dedupeCache.delete(signature)
      return false
    }
    return true
  }

  noteDetection(signature, options = {}) {
    const normalizedOptions = typeof options === 'number' ? { ttlMs: options } : options
    const ttlMs = Number(normalizedOptions.ttlMs) || 10 * 60 * 1000
    this.dedupeCache.set(signature, this.now() + ttlMs)
    if (this.activeSession) this.activeSession.lastErrorSignature = signature
    if (!normalizedOptions.keepListening) this.enterCooldown()
  }

  async runTick(runner) {
    if (!this.activeSession || this.activeSession.status !== 'running' || this.inCooldown() || this.tickInFlight) return null
    this.tickInFlight = true
    try {
      const result = await runner(this.getStatus())
      if (this.activeSession) {
        this.activeSession.failureCount = 0
        this.activeSession.lastCaptureAt = new Date(this.now()).toISOString()
      }
      return result
    } catch (error) {
      if (this.activeSession) {
        this.activeSession.failureCount = Number(this.activeSession.failureCount || 0) + 1
        if (!this.activeSession.continuous && this.activeSession.target?.type !== 'region' && this.activeSession.failureCount >= 10) {
          this.pause('too-many-failures')
        }
      }
      throw error
    } finally {
      this.tickInFlight = false
    }
  }
}

module.exports = { ObserverSessionManager }
