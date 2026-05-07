const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { validateDraft, calculateRiskSummary, makeSkillMarkdown, nowIso, sanitizeId } = require('./schema')
const { workflowSkillsRoot, ensureDir, readJson, writeJson, workflowDir, workflowPath, versionPath } = require('./storage')

function newWorkflowId(name) {
  return `workflow_${sanitizeId(name, 'skill')}_${crypto.randomUUID().slice(0, 8)}`
}

function skillPath(workflowId) {
  return path.join(workflowDir(workflowId), 'SKILL.md')
}

function ensureWorkflowExists(workflowId) {
  const filePath = workflowPath(workflowId)
  if (!fs.existsSync(filePath)) throw new Error(`workflow not found: ${workflowId}`)
}

function readWorkflow(workflowId) {
  ensureWorkflowExists(workflowId)
  return readJson(workflowPath(workflowId))
}

function writeWorkflow(workflow) {
  writeJson(workflowPath(workflow.id), workflow)
}

function readVersion(workflowId, version) {
  const filePath = versionPath(workflowId, version)
  if (!fs.existsSync(filePath)) throw new Error(`workflow version not found: ${workflowId}@${version}`)
  return readJson(filePath)
}

function writeSkill(workflow, version) {
  ensureDir(workflowDir(workflow.id))
  fs.writeFileSync(skillPath(workflow.id), makeSkillMarkdown(workflow, version), 'utf-8')
}

function saveDraft(draft, options = {}) {
  const normalized = validateDraft(draft)
  const createdAt = nowIso()
  const id = normalized.id || newWorkflowId(normalized.name)
  const version = {
    workflowId: id,
    version: options.version || '1.0.0',
    changelog: options.changelog || 'Initial workflow.',
    createdAt,
    createdFromRunId: options.createdFromRunId || null,
    steps: normalized.steps
  }
  const workflow = {
    id,
    name: normalized.name,
    description: normalized.description,
    status: normalized.status,
    currentVersion: version.version,
    source: normalized.source || { kind: 'manual' },
    technologyStack: normalized.technologyStack,
    riskSummary: calculateRiskSummary(version.steps),
    autoRunLowRiskSteps: normalized.autoRunLowRiskSteps,
    createdAt,
    updatedAt: createdAt
  }

  ensureDir(path.join(workflowDir(id), 'versions'))
  ensureDir(path.join(workflowDir(id), 'runs'))
  ensureDir(path.join(workflowDir(id), 'exports'))
  writeWorkflow(workflow)
  writeJson(versionPath(id, version.version), version)
  writeSkill(workflow, version)
  return { workflow, version }
}

function getWorkflow(workflowId, version = null) {
  const workflow = readWorkflow(workflowId)
  const resolvedVersion = readVersion(workflowId, version || workflow.currentVersion)
  const markdownPath = skillPath(workflowId)
  return {
    workflow,
    version: resolvedVersion,
    skillMarkdown: fs.existsSync(markdownPath) ? fs.readFileSync(markdownPath, 'utf-8') : ''
  }
}

function listWorkflows() {
  const root = workflowSkillsRoot()
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      try {
        const workflow = readWorkflow(entry.name)
        const version = readVersion(workflow.id, workflow.currentVersion)
        const runsDir = path.join(workflowDir(workflow.id), 'runs')
        const lastRunAt = fs.existsSync(runsDir)
          ? fs.readdirSync(runsDir).map((file) => {
              try { return readJson(path.join(runsDir, file)).startedAt } catch { return null }
            }).filter(Boolean).sort().at(-1) || null
          : null
        return { ...workflow, stepCount: version.steps.length, lastRunAt }
      } catch (error) {
        console.warn('[workflow] failed to list workflow', entry.name, error.message)
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

function setStatus(workflowId, status) {
  const workflow = readWorkflow(workflowId)
  workflow.status = status === 'disabled' ? 'disabled' : 'enabled'
  workflow.updatedAt = nowIso()
  writeWorkflow(workflow)
  return workflow
}

function deleteWorkflow(workflowId) {
  ensureWorkflowExists(workflowId)
  fs.rmSync(workflowDir(workflowId), { recursive: true, force: true })
}

module.exports = {
  workflowSkillsRoot,
  skillPath,
  saveDraft,
  getWorkflow,
  listWorkflows,
  readWorkflow,
  writeWorkflow,
  readVersion,
  writeSkill,
  setStatus,
  deleteWorkflow
}
