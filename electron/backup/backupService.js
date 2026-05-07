const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const JSZip = require('jszip')
const { store } = require('../store')
const userRules = require('../services/userRules')
const skillRegistry = require('../skills/registry')
const registry = require('../workflows/registry')
const { workflowSkillsRoot, ensureDir, readJson, writeJson, workflowDir, workflowPath, versionPath } = require('../workflows/storage')
const { calculateRiskSummary, validateDraft } = require('../workflows/schema')

const BACKUP_ROOT = 'aion-backup'
const BACKUP_SCHEMA_VERSION = 1
const MAX_BACKUP_BYTES = 10 * 1024 * 1024
const FORBIDDEN_EXTENSIONS = new Set(['.env', '.exe', '.bat', '.ps1', '.cmd', '.dll', '.sh', '.jar', '.msi', '.db', '.sqlite', '.sqlite3', '.pem', '.key', '.pfx', '.crt'])
const REQUIRED_FILES = [
  'manifest.json',
  'experiences.json',
  'projects.json',
  'project-profiles.json',
  'workflow-runs-summary.json',
  'template-sources.json',
  'user-settings.json',
  'security-settings.json'
]

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function backupBaseDir() {
  return path.dirname(store.DATA_DIR)
}

function backupOutputDir() {
  return path.join(backupBaseDir(), 'backups')
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function defaultBackupPath() {
  return path.join(backupOutputDir(), `aion-backup-${timestampForFile()}.aionbackup`)
}

function normalizeZipPath(filePath) {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
}

function relativeBackupPath(filePath) {
  const normalized = normalizeZipPath(filePath)
  if (!normalized.startsWith(`${BACKUP_ROOT}/`)) throw new Error(`backup entry must be under ${BACKUP_ROOT}: ${filePath}`)
  return normalized.slice(BACKUP_ROOT.length + 1)
}

function assertSafeZipPath(filePath) {
  const normalized = normalizeZipPath(filePath)
  if (!normalized || normalized.includes('\0')) throw new Error('backup entry path is invalid')
  if (normalized.split('/').some((part) => part === '..')) throw new Error(`path traversal is not allowed in backup: ${filePath}`)
  const basename = path.posix.basename(normalized).toLowerCase()
  const ext = path.posix.extname(normalized).toLowerCase()
  if (FORBIDDEN_EXTENSIONS.has(basename) || FORBIDDEN_EXTENSIONS.has(ext)) {
    throw new Error(`forbidden backup file: ${normalized}`)
  }
  return normalized
}

function assertAllowedBackupFile(relativePath) {
  if (REQUIRED_FILES.includes(relativePath)) return
  if (/^workflow-skills\/[^/]+\/workflow\.json$/.test(relativePath)) return
  if (/^workflow-skills\/[^/]+\/SKILL\.md$/.test(relativePath)) return
  if (/^workflow-skills\/[^/]+\/versions\/[^/]+\.json$/.test(relativePath)) return
  throw new Error(`backup file is not allowed: ${relativePath}`)
}

function backupConfig() {
  const config = store.getConfig()
  const { apiKey, minimaxApiKey, ...rest } = config
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    settings: rest,
    userRules: userRules.readRules()
  }
}

function securitySettings() {
  const config = store.getConfig()
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    permissionMode: config.permissionMode,
    shellWhitelistExtra: config.shell_whitelist_extra || [],
    shellBlacklistExtra: config.shell_blacklist_extra || [],
    sessionConfirmCacheEnabled: config.session_confirm_cache_enabled,
    excludes: ['project_source', 'raw_screenshots', 'raw_ocr_text', 'embeddings', 'secrets', 'api_key']
  }
}

function summarizeRun(run) {
  return {
    runId: run.runId,
    workflowId: run.workflowId,
    version: run.version,
    status: run.status,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    currentStepId: run.currentStepId,
    stepResults: (run.stepResults || []).map((result) => ({
      stepId: result.stepId,
      status: result.status,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      exitCode: result.exitCode,
      confirmedByUser: Boolean(result.confirmedByUser)
    }))
  }
}

function listWorkflowRunSummaries(workflowId) {
  const runsDir = path.join(workflowDir(workflowId), 'runs')
  if (!fs.existsSync(runsDir)) return []
  return fs.readdirSync(runsDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      try {
        return summarizeRun(readJson(path.join(runsDir, file)))
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

function addJson(zip, relativePath, value) {
  zip.file(`${BACKUP_ROOT}/${relativePath}`, JSON.stringify(value, null, 2))
}

function addWorkflowFiles(zip, workflowId) {
  const { workflow, version } = registry.getWorkflow(workflowId)
  const skillPath = registry.skillPath(workflowId)
  addJson(zip, `workflow-skills/${workflowId}/workflow.json`, workflow)
  if (fs.existsSync(skillPath)) zip.file(`${BACKUP_ROOT}/workflow-skills/${workflowId}/SKILL.md`, fs.readFileSync(skillPath, 'utf-8'))

  const versionsDir = path.join(workflowDir(workflowId), 'versions')
  if (fs.existsSync(versionsDir)) {
    for (const file of fs.readdirSync(versionsDir).filter((item) => item.endsWith('.json'))) {
      zip.file(`${BACKUP_ROOT}/workflow-skills/${workflowId}/versions/${file}`, fs.readFileSync(path.join(versionsDir, file), 'utf-8'))
    }
  } else {
    addJson(zip, `workflow-skills/${workflowId}/versions/${version.version}.json`, version)
  }
}

function collectBackupData(options = {}) {
  const data = store.getData()
  const experiencesData = store.getExperiencesData()
  const projectsData = store.getProjectsData()
  const workflows = registry.listWorkflows()
  const experiences = mergeByKey(experiencesData.experiences || [], data.experiences || [])
  const projects = mergeByKey(projectsData.projects || [], data.projects || [])
  const projectProfiles = mergeByKey(projectsData.profiles || [], data.projectProfiles || [], ['projectId', 'id'])
  const projectSettings = mergeByKey(projectsData.settings || [], data.projectSettings || [], ['projectId'])
  const templateSources = data.workflowTemplateSources || []
  return {
    manifest: {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      appVersion: options.appVersion || '0.1.0',
      createdAt: new Date().toISOString(),
      username: options.username || os.userInfo().username,
      contents: {
        experiences: experiences.length,
        projects: projects.length,
        projectProfiles: projectProfiles.length,
        projectSettings: projectSettings.length,
        workflowSkills: workflows.length,
        templateSources: templateSources.length
      },
      excludes: ['project_source', 'raw_screenshots', 'raw_ocr_text', 'embeddings', 'secrets']
    },
    experiences: { schemaVersion: BACKUP_SCHEMA_VERSION, items: experiences },
    projects: { schemaVersion: BACKUP_SCHEMA_VERSION, items: projects, settings: projectSettings },
    projectProfiles: { schemaVersion: BACKUP_SCHEMA_VERSION, items: projectProfiles },
    workflowRunsSummary: {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      workflows: workflows.map((workflow) => ({ workflowId: workflow.id, runs: listWorkflowRunSummaries(workflow.id) }))
    },
    templateSources: { schemaVersion: BACKUP_SCHEMA_VERSION, items: templateSources },
    userSettings: backupConfig(),
    securitySettings: securitySettings(),
    workflows
  }
}

async function exportBackup(options = {}) {
  const zip = new JSZip()
  const backup = collectBackupData(options)
  addJson(zip, 'manifest.json', backup.manifest)
  addJson(zip, 'experiences.json', backup.experiences)
  addJson(zip, 'projects.json', backup.projects)
  addJson(zip, 'project-profiles.json', backup.projectProfiles)
  addJson(zip, 'workflow-runs-summary.json', backup.workflowRunsSummary)
  addJson(zip, 'template-sources.json', backup.templateSources)
  addJson(zip, 'user-settings.json', backup.userSettings)
  addJson(zip, 'security-settings.json', backup.securitySettings)
  for (const workflow of backup.workflows) addWorkflowFiles(zip, workflow.id)

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  if (buffer.length > MAX_BACKUP_BYTES) throw new Error('backup package exceeds 10MB limit')
  const packagePath = options.packagePath || options.targetPath || defaultBackupPath()
  ensureDir(path.dirname(packagePath))
  fs.writeFileSync(packagePath, buffer)
  return { packagePath, sizeBytes: buffer.length, sha256: sha256(buffer), manifest: backup.manifest }
}

async function readBackup(packagePath) {
  const stat = fs.statSync(packagePath)
  if (stat.size > MAX_BACKUP_BYTES) throw new Error('backup package exceeds 10MB limit')
  const buffer = fs.readFileSync(packagePath)
  const zip = await JSZip.loadAsync(buffer)
  const files = []
  for (const fileName of Object.keys(zip.files)) {
    const entry = zip.files[fileName]
    if (entry.dir) continue
    const normalized = assertSafeZipPath(fileName)
    const relativePath = relativeBackupPath(normalized)
    assertAllowedBackupFile(relativePath)
    files.push(relativePath)
  }
  for (const required of REQUIRED_FILES) {
    if (!files.includes(required)) throw new Error(`backup is missing required file: ${required}`)
  }
  return { zip, files, sizeBytes: stat.size, sha256: sha256(buffer) }
}

async function readJsonEntry(zip, relativePath, fallback = null) {
  const entry = zip.file(`${BACKUP_ROOT}/${relativePath}`)
  if (!entry) return fallback
  return JSON.parse(await entry.async('string'))
}

async function previewBackup(packagePath) {
  const backup = await readBackup(packagePath)
  const manifest = await readJsonEntry(backup.zip, 'manifest.json')
  if (manifest.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new Error(`unsupported backup schema: ${manifest.schemaVersion}`)
  const userSettings = await readJsonEntry(backup.zip, 'user-settings.json', {})
  if (userSettings.settings?.apiKey || userSettings.apiKey) throw new Error('backup must not contain apiKey')
  const workflowIds = [...new Set(backup.files.map((file) => file.match(/^workflow-skills\/([^/]+)\//)?.[1]).filter(Boolean))]
  return {
    packagePath,
    manifest,
    sizeBytes: backup.sizeBytes,
    sha256: backup.sha256,
    files: backup.files,
    summary: {
      experiences: manifest.contents?.experiences || 0,
      projects: manifest.contents?.projects || 0,
      projectProfiles: manifest.contents?.projectProfiles || 0,
      workflowSkills: workflowIds.length,
      templateSources: manifest.contents?.templateSources || 0
    },
    restorePolicy: {
      defaultMode: 'merge',
      overwritesProjectSource: false,
      restoresSecrets: false,
      requiresReindex: true
    }
  }
}

function mergeByKey(existing = [], incoming = [], keyCandidates = ['id', 'projectId', 'sourceId', 'name']) {
  const next = [...existing]
  for (const item of incoming) {
    const key = keyCandidates.find((candidate) => item && item[candidate])
    if (!key) {
      next.push(item)
      continue
    }
    const index = next.findIndex((current) => current && current[key] === item[key])
    if (index === -1) next.push(item)
  }
  return next
}

function appendMissingRules(rules = []) {
  if (!Array.isArray(rules) || rules.length === 0) return 0
  const existing = new Set(userRules.readRules().map((rule) => rule.text))
  let count = 0
  for (const rule of rules) {
    if (!rule?.text || existing.has(rule.text)) continue
    userRules.appendRule(rule.text)
    existing.add(rule.text)
    count += 1
  }
  return count
}

function copyWorkflowIdIfNeeded(workflowId) {
  if (!fs.existsSync(workflowPath(workflowId))) return workflowId
  return `${workflowId}_restored_${Date.now()}`
}

async function restoreWorkflow(zip, workflowId) {
  const restoredId = copyWorkflowIdIfNeeded(workflowId)
  const hadConflict = restoredId !== workflowId
  const workflow = await readJsonEntry(zip, `workflow-skills/${workflowId}/workflow.json`)
  const workflowNext = {
    ...workflow,
    id: restoredId,
    name: hadConflict ? `${workflow.name} (restored)` : workflow.name,
    source: workflow.source || { kind: 'backup_restore' },
    updatedAt: new Date().toISOString()
  }
  const files = Object.keys(zip.files).filter((file) => normalizeZipPath(file).startsWith(`${BACKUP_ROOT}/workflow-skills/${workflowId}/versions/`) && file.endsWith('.json'))
  if (files.length === 0) throw new Error(`workflow backup has no versions: ${workflowId}`)

  ensureDir(path.join(workflowDir(restoredId), 'versions'))
  ensureDir(path.join(workflowDir(restoredId), 'runs'))
  ensureDir(path.join(workflowDir(restoredId), 'exports'))
  const versions = []
  for (const file of files) {
    const relative = relativeBackupPath(normalizeZipPath(file))
    const version = await readJsonEntry(zip, relative)
    const versionNext = { ...version, workflowId: restoredId }
    validateDraft({ ...workflowNext, steps: versionNext.steps })
    writeJson(versionPath(restoredId, versionNext.version), versionNext)
    versions.push(versionNext)
  }
  const current = versions.find((version) => version.version === workflow.currentVersion) || versions[0]
  workflowNext.currentVersion = current.version
  workflowNext.riskSummary = calculateRiskSummary(current.steps)
  writeJson(workflowPath(restoredId), workflowNext)

  const skillEntry = zip.file(`${BACKUP_ROOT}/workflow-skills/${workflowId}/SKILL.md`)
  if (skillEntry && !hadConflict) {
    fs.writeFileSync(registry.skillPath(restoredId), await skillEntry.async('string'), 'utf-8')
  } else {
    registry.writeSkill(workflowNext, current)
  }
  return { workflowId, restoredId }
}

async function restoreBackup(packagePath, options = {}) {
  const backup = await readBackup(packagePath)
  await previewBackup(packagePath)
  const data = store.getData()
  const experiencesData = store.getExperiencesData()
  const projectsData = store.getProjectsData()
  const experiences = await readJsonEntry(backup.zip, 'experiences.json', { items: [] })
  const projects = await readJsonEntry(backup.zip, 'projects.json', { items: [] })
  const profiles = await readJsonEntry(backup.zip, 'project-profiles.json', { items: [] })
  const templateSources = await readJsonEntry(backup.zip, 'template-sources.json', { items: [] })
  const userSettings = await readJsonEntry(backup.zip, 'user-settings.json', { settings: {}, userRules: [] })

  experiencesData.experiences = mergeByKey(experiencesData.experiences || [], experiences.items || [])
  projectsData.projects = mergeByKey(projectsData.projects || [], projects.items || [])
  projectsData.settings = mergeByKey(projectsData.settings || [], projects.settings || [], ['projectId'])
  projectsData.profiles = mergeByKey(projectsData.profiles || [], profiles.items || [], ['projectId', 'id'])
  data.workflowTemplateSources = mergeByKey(data.workflowTemplateSources || [], templateSources.items || [], ['sourceId', 'url', 'name'])
  store.saveExperiencesData(experiencesData)
  store.saveProjectsData(projectsData)
  store.saveData(data)

  if (options.overwriteSettings === true && userSettings.settings) {
    const { apiKey, minimaxApiKey, ...settings } = userSettings.settings
    store.setConfig(settings)
  }
  const restoredRules = appendMissingRules(userSettings.userRules)

  const workflowIds = [...new Set(backup.files.map((file) => file.match(/^workflow-skills\/([^/]+)\//)?.[1]).filter(Boolean))]
  const restoredWorkflows = []
  for (const workflowId of workflowIds) {
    restoredWorkflows.push(await restoreWorkflow(backup.zip, workflowId))
  }
  skillRegistry.reload()
  return {
    ok: true,
    restored: {
      experiences: (experiences.items || []).length,
      projects: (projects.items || []).length,
      projectProfiles: (profiles.items || []).length,
      templateSources: (templateSources.items || []).length,
      workflowSkills: restoredWorkflows.length,
      userRules: restoredRules
    },
    restoredWorkflows,
    requiresReindex: true
  }
}

module.exports = {
  BACKUP_ROOT,
  BACKUP_SCHEMA_VERSION,
  MAX_BACKUP_BYTES,
  backupOutputDir,
  exportBackup,
  previewBackup,
  restoreBackup
}
