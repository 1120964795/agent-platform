const fs = require('fs')
const path = require('path')
const { normalizeSteps, calculateRiskSummary, nowIso } = require('./schema')
const registry = require('./registry')
const { workflowDir, versionPath, readJson, writeJson, runPath } = require('./storage')

function parseSemver(version) {
  const match = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) throw new Error(`invalid workflow version: ${version}`)
  return match.slice(1).map(Number)
}

function compareSemver(a, b) {
  const left = parseSemver(a)
  const right = parseSemver(b)
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i]
  }
  return 0
}

function nextMinor(version) {
  const [major, minor] = parseSemver(version)
  return `${major}.${minor + 1}.0`
}

function listVersions(workflowId) {
  const versionsDir = path.join(workflowDir(workflowId), 'versions')
  if (!fs.existsSync(versionsDir)) return []
  return fs.readdirSync(versionsDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => readJson(path.join(versionsDir, file)))
    .sort((a, b) => compareSemver(b.version, a.version))
}

function createVersion(workflowId, payload = {}) {
  const workflow = registry.readWorkflow(workflowId)
  const version = payload.version || nextMinor(workflow.currentVersion)
  if (fs.existsSync(versionPath(workflowId, version))) throw new Error(`workflow version already exists: ${version}`)
  if (compareSemver(version, workflow.currentVersion) <= 0) throw new Error('new workflow version must be greater than current version')
  const createdAt = nowIso()
  const record = {
    workflowId,
    version,
    changelog: String(payload.changelog || '').trim() || `Create version ${version}.`,
    createdAt,
    createdFromRunId: payload.createdFromRunId || null,
    steps: normalizeSteps(payload.steps)
  }
  writeJson(versionPath(workflowId, version), record)
  workflow.currentVersion = version
  workflow.riskSummary = calculateRiskSummary(record.steps)
  workflow.updatedAt = createdAt
  registry.writeWorkflow(workflow)
  registry.writeSkill(workflow, record)
  return record
}

function rollback(workflowId, targetVersion, changelog) {
  const target = registry.readVersion(workflowId, targetVersion)
  return createVersion(workflowId, {
    changelog: changelog || `Rollback to ${targetVersion}.`,
    steps: target.steps
  })
}

function createVersionFromRun(workflowId, runId, changelog, options = {}) {
  const run = readJson(runPath(workflowId, runId))
  const steps = options.includeTemporarySteps
    ? [...(run.workflowSteps || []), ...(run.insertedTemporarySteps || []).map((entry) => ({ ...entry.step, temporary: false }))]
    : (run.workflowSteps || [])
  return createVersion(workflowId, {
    changelog,
    createdFromRunId: runId,
    steps
  })
}

module.exports = {
  parseSemver,
  compareSemver,
  nextMinor,
  listVersions,
  createVersion,
  rollback,
  createVersionFromRun
}
