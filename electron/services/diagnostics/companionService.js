const crypto = require('crypto')
const { store } = require('../../store')
const {
  detectError,
  createDiagnosisFromError,
  createDiagnosisFromModelResult,
  upsertExperienceFromDiagnosis,
  recordFixExecution,
  createModelClient,
  buildExecutionPlan,
  ObserverSessionManager
} = require('./index')
const { WindowTargetService } = require('./windowTargetService')
const { RegionSelectionService } = require('./regionSelectionService')
const { UiaCollector } = require('./uiaCollector')
const { OcrCollector } = require('./ocrCollector')
const { CompanionPopupManager } = require('./companionPopupManager')

function hashText(value = '') {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex')
}

function uniqueStrings(items = []) {
  return [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))]
}

function buildProjectContext(storeRef, username, errorEvent) {
  if (!errorEvent.projectDir || typeof storeRef.findProjectByRoot !== 'function') {
    return {}
  }

  const project = storeRef.findProjectByRoot(username, errorEvent.projectDir)
  if (!project) return {}

  const profile = storeRef.getProjectProfile(project.id) || null
  const packageName = String(errorEvent.signature || '').split('.').pop()
  const evidence = [
    ...(profile?.dependencyFiles || []),
    ...(profile?.entryFiles || [])
  ]

  const chunks = typeof storeRef.listProjectChunks === 'function'
    ? storeRef.listProjectChunks(project.id)
    : []
  for (const chunk of chunks) {
    const haystack = `${chunk.relativePath}\n${chunk.text}`.toLowerCase()
    if (!haystack.includes(packageName.toLowerCase())) continue
    evidence.push({
      path: chunk.relativePath,
      lineStart: chunk.lineStart,
      lineEnd: chunk.lineEnd,
      chunkType: chunk.chunkType,
      reason: `Project index mentions ${packageName}.`
    })
  }

  return {
    project,
    projectProfile: profile,
    projectEvidence: evidence.slice(0, 6)
  }
}

function buildProjectContextForText(storeRef, username, projectDir, capturedText = '') {
  if (!projectDir || typeof storeRef.findProjectByRoot !== 'function') return {}
  const project = storeRef.findProjectByRoot(username, projectDir)
  if (!project) return {}
  const profile = storeRef.getProjectProfile(project.id) || null
  const evidence = [
    ...(profile?.dependencyFiles || []),
    ...(profile?.entryFiles || [])
  ]
  const tokens = uniqueStrings(String(capturedText || '')
    .split(/[^A-Za-z0-9_.@/-]+/)
    .filter((item) => item.length >= 3)
    .slice(0, 24))
    .map((item) => item.toLowerCase())
  const chunks = typeof storeRef.listProjectChunks === 'function'
    ? storeRef.listProjectChunks(project.id)
    : []
  for (const chunk of chunks) {
    const haystack = `${chunk.relativePath}\n${chunk.text}`.toLowerCase()
    if (!tokens.some((token) => haystack.includes(token))) continue
    evidence.push({
      path: chunk.relativePath,
      lineStart: chunk.lineStart,
      lineEnd: chunk.lineEnd,
      chunkType: chunk.chunkType,
      reason: 'Captured error text overlaps with this project file.'
    })
    if (evidence.length >= 8) break
  }
  return {
    project,
    projectProfile: profile,
    projectEvidence: evidence.slice(0, 8)
  }
}

class CompanionService {
  constructor(options = {}) {
    this.storeRef = options.storeRef || store
    this.windowTargetService = options.windowTargetService
    this.regionSelectionService = options.regionSelectionService
    this.uiaCollector = options.uiaCollector
    this.ocrCollector = options.ocrCollector
    this.popupManager = options.popupManager
    this.sessionManager = options.sessionManager || new ObserverSessionManager()
    this.modelClient = options.modelClient || createModelClient(this.storeRef)
    this.mainWindow = options.mainWindow || null
    this.getFocusedWindow = options.getFocusedWindow || (() => null)
    this.emitToWindow = options.emitToWindow || ((channel, payload) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(channel, payload)
      }
    })
    this.libraryNotice = ''
  }

  setMainWindow(window) {
    this.mainWindow = window
  }

  cleanupExperiencesIfNeeded(username) {
    const today = new Date().toISOString().slice(0, 10)
    const config = this.storeRef.getUserConfig(username)
    if (config.lastExperienceCleanupDate === today) return { removed: 0 }
    const result = this.storeRef.cleanupExpiredExperiences({ username, now: new Date() })
    this.storeRef.setUserConfig(username, { lastExperienceCleanupDate: today })
    this.libraryNotice = result.removed > 0 ? `已清理 ${result.removed} 条过期草稿经验。` : ''
    return result
  }

  async listTargets() {
    return this.windowTargetService.listTargets()
  }

  async selectRegion() {
    return this.regionSelectionService.selectRegion()
  }

  shouldShowPopup() {
    const focused = this.getFocusedWindow()
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return false
    if (focused === this.mainWindow && !this.mainWindow.isMinimized?.()) return false
    return true
  }

  async captureTarget(session) {
    if (session.target?.type === 'region') {
      return this.ocrCollector.collect(session.target)
    }

    const uia = await this.uiaCollector.collect(session.target)
    if (uia.ok && String(uia.text || '').trim().length >= 20) return uia
    const ocr = await this.ocrCollector.collect(session.target)
    return ocr.ok ? ocr : uia.ok ? uia : ocr
  }

  async collectOnce(session) {
    const collected = await this.captureTarget(session)
    if (!collected?.ok || !collected.text) return null

    if (this.sessionManager.activeSession) {
      const nextHash = hashText(collected.text)
      if (this.sessionManager.activeSession.lastContentHash === nextHash) {
        return null
      }
      this.sessionManager.activeSession.lastContentHash = nextHash
      this.sessionManager.activeSession.lastCaptureSource = collected.source
      this.sessionManager.activeSession.lastSnippet = String(collected.text).trim().slice(0, 200)
    }

    const context = {
      appName: session.target?.appName || '',
      windowTitle: session.target?.title || '',
      projectDir: session.projectDir || '',
      captureSource: collected.source
    }
    const experiences = this.storeRef.listExperiences(session.username)
    const textProjectContext = buildProjectContextForText(this.storeRef, session.username, session.projectDir || '', collected.text)
    let modelUnavailable = false

    if (typeof this.modelClient?.diagnoseCapturedError === 'function') {
      try {
        const modelResult = await this.modelClient.diagnoseCapturedError({
          username: session.username,
          text: collected.text,
          context,
          experiences,
          ...textProjectContext,
          advancedRiskExecutionEnabled: this.storeRef.getUserConfig(session.username).advancedRiskExecutionEnabled === true
        })
        const modelDiagnosis = createDiagnosisFromModelResult(modelResult, {
          username: session.username,
          rawSnippet: collected.text,
          context,
          experiences,
          ...textProjectContext,
          advancedRiskExecutionEnabled: this.storeRef.getUserConfig(session.username).advancedRiskExecutionEnabled === true
        })
        if (!modelDiagnosis) return null
        if (this.sessionManager.isIgnored(modelDiagnosis.errorSignature) || this.sessionManager.isDuplicate(modelDiagnosis.errorSignature)) return null

        const savedDiagnosis = this.storeRef.upsertDiagnosis(modelDiagnosis)
        const experience = upsertExperienceFromDiagnosis(this.storeRef, savedDiagnosis, {
          signature: savedDiagnosis.errorSignature,
          type: savedDiagnosis.errorType,
          rawSnippet: savedDiagnosis.rawSnippet,
          captureSource: context.captureSource,
          keywords: [savedDiagnosis.title, savedDiagnosis.errorType, ...(savedDiagnosis.possibleCauses || [])]
        })
        if (experience?.id) {
          savedDiagnosis.experienceId = experience.id
          this.storeRef.upsertDiagnosis(savedDiagnosis)
        }

        this.sessionManager.noteDetection(savedDiagnosis.errorSignature)
        const eventPayload = {
          type: 'diagnosis-created',
          diagnosis: savedDiagnosis,
          experience
        }
        this.emitToWindow('diagnostics:event', eventPayload)

        if (this.shouldShowPopup()) {
          await this.popupManager.showDiagnosis({
            username: session.username,
            diagnosis: savedDiagnosis
          })
        }

        return eventPayload
      } catch (error) {
        modelUnavailable = true
        if (this.sessionManager.activeSession) {
          this.sessionManager.activeSession.lastModelError = error.code || error.message || 'MODEL_DIAGNOSIS_FAILED'
        }
      }
    }

    const errorEvent = detectError({
      text: collected.text,
      context
    })

    if (!errorEvent) return null
    if (this.sessionManager.isIgnored(errorEvent.signature) || this.sessionManager.isDuplicate(errorEvent.signature)) return null

    const projectContext = buildProjectContext(this.storeRef, session.username, errorEvent)
    const diagnosis = createDiagnosisFromError(errorEvent, {
      username: session.username,
      experiences,
      ...projectContext,
      advancedRiskExecutionEnabled: this.storeRef.getUserConfig(session.username).advancedRiskExecutionEnabled === true
    })
    if (modelUnavailable) {
      diagnosis.modelFallbackReason = this.sessionManager.activeSession?.lastModelError || 'MODEL_DIAGNOSIS_FAILED'
    }
    const savedDiagnosis = this.storeRef.upsertDiagnosis(diagnosis)
    const experience = upsertExperienceFromDiagnosis(this.storeRef, savedDiagnosis, errorEvent)
    if (experience?.id) {
      savedDiagnosis.experienceId = experience.id
      this.storeRef.upsertDiagnosis(savedDiagnosis)
    }

    this.sessionManager.noteDetection(errorEvent.signature)
    const eventPayload = {
      type: 'diagnosis-created',
      diagnosis: savedDiagnosis,
      experience
    }
    this.emitToWindow('diagnostics:event', eventPayload)

    if (this.shouldShowPopup()) {
      await this.popupManager.showDiagnosis({
        username: session.username,
        diagnosis: savedDiagnosis
      })
    }

    return eventPayload
  }

  async start(payload = {}) {
    const username = payload.username || 'guest'
    this.cleanupExperiencesIfNeeded(username)
    return this.sessionManager.start({
      username,
      target: payload.target,
      projectDir: payload.projectDir || '',
      intervalMs: payload.intervalMs,
      onTick: (session) => this.collectOnce(session)
    })
  }

  stop() {
    return this.sessionManager.stop()
  }

  resumeNow() {
    return this.sessionManager.resumeNow()
  }

  ignore(signature) {
    return this.sessionManager.ignore(signature)
  }

  status(username) {
    this.cleanupExperiencesIfNeeded(username || 'guest')
    const session = this.sessionManager.getStatus()
    const config = this.storeRef.getUserConfig(username || 'guest')
    return {
      session,
      hasModel: Boolean(config.apiKey),
      advancedRiskExecutionEnabled: config.advancedRiskExecutionEnabled === true,
      libraryNotice: this.libraryNotice
    }
  }

  listDiagnostics(username) {
    return this.storeRef.listDiagnostics(username)
  }

  getDiagnosis(id, username) {
    return this.storeRef.getDiagnosis(id, username)
  }

  async explainDiagnosis(username, diagnosisId) {
    const diagnosis = this.getDiagnosis(diagnosisId, username)
    if (!diagnosis) return null
    const explanation = await this.modelClient.explainDiagnosis({ diagnosis, username })
    const next = this.storeRef.upsertDiagnosis({
      ...diagnosis,
      modelExplanation: String(explanation || '').trim()
    })
    return next
  }

  async rewritePlan(username, diagnosisId, experienceId) {
    const diagnosis = this.getDiagnosis(diagnosisId, username)
    const experience = this.storeRef.getExperience(experienceId, username)
    if (!diagnosis || !experience) return null
    const rewritten = await this.modelClient.rewritePlan({ diagnosis, experience, username })
    return buildExecutionPlan({
      command: rewritten.command,
      cwd: rewritten.cwd || diagnosis.projectDir || experience.projectDirs?.[0] || '',
      reason: rewritten.reason || '',
      label: rewritten.expectedImpact || rewritten.reason || rewritten.command
    }, {
      advancedRiskExecutionEnabled: this.storeRef.getUserConfig(username).advancedRiskExecutionEnabled === true
    })
  }

  recordExecution(diagnosis, plan, result) {
    return recordFixExecution(this.storeRef, diagnosis, plan, result)
  }

  async dispose() {
    this.stop()
    await this.ocrCollector.dispose?.()
    this.popupManager.close?.()
  }
}

function createCompanionService(options = {}) {
  const windowTargetService = options.windowTargetService || new WindowTargetService({
    desktopCapturer: options.desktopCapturer,
    appTitle: options.appTitle || 'AgentDev Lite'
  })
  const regionSelectionService = options.regionSelectionService || new RegionSelectionService({
    BrowserWindow: options.BrowserWindow,
    screen: options.screen,
    ipcMain: options.ipcMain
  })
  const uiaCollector = options.uiaCollector || new UiaCollector()
  const ocrCollector = options.ocrCollector || new OcrCollector({
    desktopCapturer: options.desktopCapturer,
    screen: options.screen,
    nativeImage: options.nativeImage
  })
  const popupManager = options.popupManager || new CompanionPopupManager({
    BrowserWindow: options.BrowserWindow,
    screen: options.screen,
    popupUrl: options.popupUrl,
    autoCloseMs: 15000
  })

  return new CompanionService({
    ...options,
    windowTargetService,
    regionSelectionService,
    uiaCollector,
    ocrCollector,
    popupManager
  })
}

module.exports = { CompanionService, createCompanionService, hashText, uniqueStrings }
