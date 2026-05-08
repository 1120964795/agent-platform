const path = require('path')

const STEP_TYPES = new Set([
  'check_command',
  'safe_command',
  'confirm_command',
  'start_service',
  'diagnose_error',
  'query_project',
  'apply_patch',
  'wait_for_output',
  'open_file'
])

const RISK_LEVELS = ['low', 'medium', 'high']

const DEFAULT_RISK_BY_TYPE = {
  check_command: 'low',
  safe_command: 'low',
  confirm_command: 'medium',
  start_service: 'medium',
  diagnose_error: 'low',
  query_project: 'low',
  apply_patch: 'medium',
  wait_for_output: 'low',
  open_file: 'low'
}

function nowIso() {
  return new Date().toISOString()
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function sanitizeId(value, fallback = 'workflow') {
  const safe = String(value || fallback).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return safe || fallback
}

function normalizeRisk(type, riskLevel) {
  if (RISK_LEVELS.includes(riskLevel)) return riskLevel
  return DEFAULT_RISK_BY_TYPE[type] || 'medium'
}

function requiresConfirmation(type, riskLevel, explicit) {
  if (typeof explicit === 'boolean') return explicit
  if (type === 'start_service' || type === 'apply_patch' || type === 'confirm_command') return true
  return riskLevel !== 'low'
}

function normalizeStep(step, index = 0) {
  if (!step || typeof step !== 'object') throw new Error('workflow step must be an object')
  if (!STEP_TYPES.has(step.type)) throw new Error(`unsupported workflow step type: ${step.type}`)
  const id = step.id || `step_${String(index + 1).padStart(3, '0')}`
  const riskLevel = normalizeRisk(step.type, step.riskLevel)
  return {
    ...clone(step),
    id,
    title: step.title || id,
    enabled: step.enabled !== false,
    riskLevel,
    requiresConfirmation: requiresConfirmation(step.type, riskLevel, step.requiresConfirmation)
  }
}

function normalizeSteps(steps = []) {
  if (!Array.isArray(steps) || steps.length === 0) throw new Error('workflow steps are required')
  return steps.map(normalizeStep)
}

function riskRank(riskLevel) {
  return RISK_LEVELS.indexOf(riskLevel)
}

function calculateRiskSummary(steps = []) {
  const enabledSteps = steps.filter((step) => step.enabled !== false)
  const maxRiskLevel = enabledSteps.reduce((max, step) => {
    return riskRank(step.riskLevel) > riskRank(max) ? step.riskLevel : max
  }, 'low')
  return {
    maxRiskLevel,
    hasNetworkCommand: enabledSteps.some((step) => Boolean(step.requiresNetwork)),
    hasPatchStep: enabledSteps.some((step) => step.type === 'apply_patch'),
    hasStartService: enabledSteps.some((step) => step.type === 'start_service')
  }
}

function validateDraft(draft = {}) {
  const name = String(draft.name || '').trim()
  const description = String(draft.description || '').trim()
  if (!name) throw new Error('workflow name is required')
  if (!description) throw new Error('workflow description is required')
  const steps = normalizeSteps(draft.steps)
  return {
    ...clone(draft),
    name,
    description,
    status: draft.status === 'disabled' ? 'disabled' : 'enabled',
    technologyStack: Array.isArray(draft.technologyStack) ? draft.technologyStack.map(String) : [],
    autoRunLowRiskSteps: draft.autoRunLowRiskSteps !== false,
    steps
  }
}

function makeSkillMarkdown(workflow, version) {
  const stack = workflow.technologyStack?.length ? workflow.technologyStack.join(', ') : 'General'
  const steps = (version.steps || []).map((step, index) => `${index + 1}. ${step.title} (${step.type}, ${step.riskLevel})`).join('\n')
  return `---\nname: ${workflow.name}\ndescription: ${workflow.description}\ntools: []\n---\n\n# ${workflow.name}\n\n${workflow.description}\n\n## Technology Stack\n\n${stack}\n\n## Workflow Steps\n\n${steps}\n\n## Run Policy\n\nRun this workflow through AionUi Workflow Runner. Do not execute workflow commands silently or automatically outside the runner.\n`
}

function normalizePackagePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
}

function isAllowedPackageFile(filePath) {
  const normalized = normalizePackagePath(filePath)
  if (normalized === 'manifest.json' || normalized === 'workflow.json' || normalized === 'SKILL.md') return true
  return /^assets\/[^/]+\.(png|jpg)$/i.test(normalized)
}

function isForbiddenPackageFile(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return ['.exe', '.bat', '.ps1', '.cmd', '.dll', '.sh', '.jar', '.msi', '.vbs', '.js', '.py', '.zip'].includes(ext)
}

module.exports = {
  STEP_TYPES,
  RISK_LEVELS,
  nowIso,
  clone,
  sanitizeId,
  normalizeStep,
  normalizeSteps,
  validateDraft,
  calculateRiskSummary,
  makeSkillMarkdown,
  normalizePackagePath,
  isAllowedPackageFile,
  isForbiddenPackageFile
}
