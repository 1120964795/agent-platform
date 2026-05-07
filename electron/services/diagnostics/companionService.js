const { store } = require('../../store')
const diagnosisService = require('./diagnosisService')
const windowCollector = require('./windowCollector')

class CompanionService {
  constructor(deps = {}) {
    this.collector = deps.collector || windowCollector
    this.intervalMs = deps.intervalMs || 5000
    this.timer = null
    this.lastText = ''
    this.session = null
  }

  start(options = {}) {
    this.stop({ persist: false })
    this.session = {
      username: options.username || 'guest',
      projectId: options.projectId || null,
      target: options.target || { type: 'manual' }
    }
    const status = store.setDiagnosticsSession({
      status: 'running',
      mode: this.session.target.type === 'manual' ? 'manual' : 'collector',
      target: this.session.target,
      startedAt: new Date().toISOString(),
      lastError: ''
    })
    if (this.session.target.type !== 'manual') {
      this.timer = setInterval(() => {
        this.tick().catch((error) => {
          store.setDiagnosticsSession({ lastError: error.message || String(error) })
        })
      }, this.intervalMs)
      this.tick().catch(() => {})
    }
    return status
  }

  stop({ persist = true } = {}) {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.session = null
    this.lastText = ''
    if (persist) return store.setDiagnosticsSession({ status: 'stopped', stoppedAt: new Date().toISOString() })
    return store.getDiagnosticsSession()
  }

  async tick() {
    if (!this.session?.target || this.session.target.type === 'manual') return null
    const text = await this.collector.collectTargetText(this.session.target)
    if (!text || text === this.lastText) return null
    this.lastText = text
    const result = diagnosisService.createDiagnosis({
      text,
      username: this.session.username,
      projectId: this.session.projectId,
      source: this.session.target.type
    })
    if (result?.diagnosis) {
      store.setDiagnosticsSession({
        status: 'running',
        target: this.session.target,
        lastDiagnosisId: result.diagnosis.id,
        lastDetectedAt: new Date().toISOString(),
        lastError: ''
      })
    }
    return result
  }
}

const defaultService = new CompanionService()

module.exports = { CompanionService, defaultService }
