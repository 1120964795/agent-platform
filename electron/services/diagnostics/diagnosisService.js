const { store } = require('../../store')
const { detectError, normalizeText } = require('./errorDetector')

function nowIso() {
  return new Date().toISOString()
}

function normalizeUsername(username) {
  return String(username || 'guest').trim() || 'guest'
}

function severityForRisk(riskLevel) {
  if (riskLevel === 'high') return 'high'
  if (riskLevel === 'medium') return 'medium'
  return 'low'
}

function buildFixes(event) {
  return (event.commands || []).map((command, index) => ({
    id: `fix_${index + 1}`,
    title: index === 0 ? '推荐修复命令' : `备选命令 ${index + 1}`,
    command,
    riskLevel: event.riskLevel || 'low',
    requiresConfirmation: true
  }))
}

function updateExperienceDraft(username, event, diagnosis) {
  const userKey = normalizeUsername(username)
  const existing = store.findExperienceBySignature(userKey, event.errorSignature)
  const now = nowIso()
  const base = existing || {
    id: store.genId('exp_'),
    username: userKey,
    errorSignature: event.errorSignature,
    title: event.title,
    createdAt: now,
    successCount: 0,
    commands: []
  }
  const commands = [...new Set([...(base.commands || []), ...(event.commands || [])])]
  return store.upsertExperience({
    ...base,
    title: base.title || event.title,
    summary: event.summary,
    status: base.status === 'resolved' ? 'resolved' : 'draft',
    projectType: event.projectType,
    diagnosisIds: [...new Set([...(base.diagnosisIds || []), diagnosis.id])],
    commands,
    updatedAt: now
  })
}

function createDiagnosis({ text, username = 'guest', projectId = null, source = 'manual' } = {}) {
  const event = detectError(text)
  if (!event) return null
  const userKey = normalizeUsername(username)
  const existingExperience = store.findExperienceBySignature(userKey, event.errorSignature)
  const now = nowIso()
  const diagnosis = {
    id: store.genId('diag_'),
    username: userKey,
    projectId,
    source,
    title: event.title,
    category: event.category,
    severity: severityForRisk(event.riskLevel),
    errorSignature: event.errorSignature,
    summary: event.summary,
    rawText: normalizeText(text).slice(0, 4000),
    fixes: buildFixes(event),
    experienceMatches: existingExperience ? [{
      experienceId: existingExperience.id,
      title: existingExperience.title,
      similarity: 1,
      status: existingExperience.status
    }] : [],
    status: 'open',
    createdAt: now,
    updatedAt: now
  }
  const saved = store.upsertDiagnosis(diagnosis)
  const experience = updateExperienceDraft(userKey, event, saved)
  return { diagnosis: { ...saved, experienceId: experience.id }, experience }
}

function explainDiagnosis(diagnosis) {
  if (!diagnosis) throw new Error('diagnosis not found')
  return [
    diagnosis.summary,
    '建议先确认当前项目使用的运行环境和依赖安装位置，再执行推荐命令。',
    '所有修复命令仍需要用户确认后才会运行。'
  ].join('\n')
}

function rewritePlan(diagnosis, experience) {
  if (!diagnosis) throw new Error('diagnosis not found')
  const commands = experience?.commands?.length ? experience.commands : diagnosis.fixes.map((fix) => fix.command)
  return {
    title: `复用经验：${experience?.title || diagnosis.title}`,
    commands,
    riskLevel: diagnosis.severity === 'high' ? 'high' : 'medium',
    requiresConfirmation: true
  }
}

function markExperienceResolved(username, diagnosis, command, result = {}) {
  const existing = store.findExperienceBySignature(username, diagnosis.errorSignature)
  if (!existing) return null
  return store.upsertExperience({
    ...existing,
    status: result.exit_code === 0 || result.exitCode === 0 ? 'resolved' : 'unresolved',
    successCount: result.exit_code === 0 || result.exitCode === 0 ? (existing.successCount || 0) + 1 : existing.successCount || 0,
    commands: [...new Set([...(existing.commands || []), command])],
    lastResult: {
      command,
      exitCode: result.exit_code ?? result.exitCode ?? null,
      updatedAt: nowIso()
    },
    updatedAt: nowIso()
  })
}

module.exports = {
  createDiagnosis,
  explainDiagnosis,
  rewritePlan,
  markExperienceResolved
}
