export class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function electronAPI() {
  const electron = window.electronAPI
  if (!electron?.invoke) throw new ApiError('NOT_SUPPORTED', 'Electron IPC is not available.')
  return electron
}

function unwrap(result) {
  if (result?.ok === false) {
    const error = result.error || { code: 'IPC_ERROR', message: 'IPC request failed.' }
    throw new ApiError(error.code || 'IPC_ERROR', error.message || 'IPC request failed.')
  }
  return result
}

async function invoke(channel, payload) {
  return unwrap(await electronAPI().invoke(channel, payload))
}

function parseUrl(url) {
  return new URL(url, 'http://agentdev.local')
}

async function get(url) {
  if (url === '/api/config') return invoke('config:get')
  if (url === '/api/artifacts') return invoke('artifacts:list')
  if (url.startsWith('/api/conversations/')) return invoke('conversations:get', { id: decodeURIComponent(url.slice('/api/conversations/'.length)) })
  if (url.startsWith('/api/files/list')) {
    const parsed = parseUrl(url)
    return invoke('files:list', { dir: parsed.searchParams.get('dir') })
  }
  if (url.startsWith('/api/files/search')) {
    const parsed = parseUrl(url)
    return invoke('files:search', { query: parsed.searchParams.get('query'), dir: parsed.searchParams.get('dir') })
  }
  throw new ApiError('UNSUPPORTED_ROUTE', `No IPC mapping for GET ${url}`)
}

async function post(url, body) {
  if (url === '/api/config') return invoke('config:set', body)
  if (url === '/api/conversations') return invoke('conversations:upsert', body)
  throw new ApiError('UNSUPPORTED_ROUTE', `No IPC mapping for POST ${url}`)
}

function stream(arg, legacyBody, legacyOnDelta, legacyOnDone, legacyOnError) {
  const options = typeof arg === 'string'
    ? { channel: arg === '/api/chat' ? 'chat:send' : arg, payload: legacyBody, onDelta: legacyOnDelta, onDone: legacyOnDone, onError: legacyOnError }
    : arg

  const { channel, payload, onDelta, onDone, onError, onToolStart, onToolLog, onToolResult, onToolError, onSkillLoaded } = options
  const electron = electronAPI()
  const cleanupFns = []
  let closed = false

  const cleanup = () => {
    if (closed) return
    closed = true
    while (cleanupFns.length) cleanupFns.pop()()
  }
  const listen = (event, handler) => {
    cleanupFns.push(electron.on(event, (data) => {
      if (!closed && data.convId === payload.convId) handler(data)
    }))
  }

  listen('chat:delta', (data) => onDelta?.(data.text))
  listen('chat:tool-start', (data) => onToolStart?.(data))
  listen('chat:tool-log', (data) => onToolLog?.(data))
  listen('chat:tool-result', (data) => onToolResult?.(data))
  listen('chat:tool-error', (data) => onToolError?.(data))
  listen('chat:skill-loaded', (data) => onSkillLoaded?.(data))
  listen('chat:done', () => { cleanup(); onDone?.() })
  listen('chat:error', (data) => {
    cleanup()
    const error = data.error || { code: 'CHAT_ERROR', message: 'Chat failed.' }
    onError?.(new ApiError(error.code, error.message))
  })

  electron.invoke(channel, payload).catch((error) => {
    cleanup()
    onError?.(error)
  })

  return cleanup
}

export const api = {
  get,
  post,
  del: async (url) => { throw new ApiError('UNSUPPORTED_ROUTE', `No IPC mapping for DELETE ${url}`) },
  patch: async (url) => { throw new ApiError('UNSUPPORTED_ROUTE', `No IPC mapping for PATCH ${url}`) },
  stream,
  invoke
}

export function getConfig() { return invoke('config:get') }
export function setConfig(patch) { return invoke('config:set', patch) }
export function listSkills() { return invoke('skills:list') }
export function reloadSkills() { return invoke('skills:reload') }
export function createSkill(payload) { return invoke('skills:create', payload) }
export function deleteSkill(name) { return invoke('skills:delete', { name }) }
export function copyBuiltinSkill(payload) { return invoke('skills:copyBuiltin', payload) }
export function openSkillsFolder() { return invoke('skills:openFolder') }
export function listRules() { return invoke('rules:list') }
export function deleteRule(payload) { return invoke('rules:delete', payload) }
export function listWorkflowSkills() { return invoke('workflow-skills:list') }
export function saveWorkflowDraft(payload) { return invoke('workflow-skills:saveDraft', payload) }
export function disableWorkflowSkill(workflowId) { return invoke('workflow-skills:disable', { workflowId }) }
export function deleteWorkflowSkill(workflowId) { return invoke('workflow-skills:delete', { workflowId }) }
export function exportWorkflowSkill(workflowId) { return invoke('workflow-skills:export', { workflowId }) }
export function startWorkflowRun(workflowId) { return invoke('workflow-runs:start', { workflowId }) }
export function confirmWorkflowStep(runId, accepted) { return invoke('workflow-runs:confirmStep', { runId, accepted }) }
export function terminateWorkflowRun(runId) { return invoke('workflow-runs:terminate', { runId }) }
export function listWorkflowTemplateSources() { return invoke('workflow-template-sources:list') }
export function addWorkflowTemplateSource(payload) { return invoke('workflow-template-sources:add', payload) }
export function listWorkflowTemplates() { return invoke('workflow-templates:list') }
export function exportBackup(payload = {}) { return invoke('backup:export', payload) }
export function previewBackup(packagePath) { return invoke('backup:preview', { packagePath }) }
export function restoreBackup(packagePath, options = {}) { return invoke('backup:restore', { packagePath, options }) }
export function listProjects(username) { return invoke('projects:list', { username: username || 'guest' }) }
export function addProject(payload, username) { return invoke('projects:add', { ...(payload || {}), username: username || 'guest' }) }
export function getProject(projectId, username) { return invoke('projects:get', { projectId, username: username || 'guest' }) }
export function removeProject(projectId, username) { return invoke('projects:remove', { projectId, username: username || 'guest' }) }
export function refreshProjectProfile(projectId, username) { return invoke('projects:profile:refresh', { projectId, username: username || 'guest' }) }
export function startProjectIndex(projectId, username) { return invoke('projects:index:start', { projectId, username: username || 'guest' }) }
export function pauseProjectIndex(projectId, username) { return invoke('projects:index:pause', { projectId, username: username || 'guest' }) }
export function clearProjectIndex(projectId, username) { return invoke('projects:index:clear', { projectId, username: username || 'guest' }) }
export function searchProject(projectId, query, username) { return invoke('projects:search', { projectId, query, username: username || 'guest' }) }
export function askProject(projectId, question, username) { return invoke('projects:ask', { projectId, question, username: username || 'guest' }) }
export function previewProjectPatch(projectId, payload, username) { return invoke('projects:patch:preview', { ...(payload || {}), projectId, username: username || 'guest' }) }
export function applyProjectPatch(projectId, patchId, username) { return invoke('projects:patch:apply', { projectId, patchId, confirmed: true, username: username || 'guest' }) }
export function getDiagnosticsStatus(username) { return invoke('diagnostics:status', { username: username || 'guest' }) }
export function listDiagnosticTargets() { return invoke('diagnostics:targets') }
export function selectDiagnosticsRegion(region) { return invoke('diagnostics:selectRegion', { region }) }
export function startDiagnostics(payload = {}, username) { return invoke('diagnostics:start', { ...(payload || {}), username: username || 'guest' }) }
export function stopDiagnostics(username) { return invoke('diagnostics:stop', { username: username || 'guest' }) }
export function ingestDiagnosticText(text, username, projectId) { return invoke('diagnostics:ingestText', { text, username: username || 'guest', projectId }) }
export function listDiagnostics(username) { return invoke('diagnostics:list', { username: username || 'guest' }) }
export function explainDiagnosis(diagnosisId, username) { return invoke('diagnostics:explain', { diagnosisId, username: username || 'guest' }) }
export function executeDiagnosisFix(diagnosisId, fixId, cwd, username) { return invoke('diagnostics:executeFix', { diagnosisId, fixId, cwd, username: username || 'guest' }) }
export function listExperiences(username, status) { return invoke('experiences:list', { username: username || 'guest', status }) }
export function searchExperiences(query, username, status) { return invoke('experiences:search', { query, username: username || 'guest', status }) }
export function updateExperience(payload, username) { return invoke('experiences:update', { ...(payload || {}), username: username || 'guest' }) }
export function deleteExperience(id, username) { return invoke('experiences:delete', { id, username: username || 'guest' }) }
export function exportExperiences(username) { return invoke('experiences:export', { username: username || 'guest' }) }

export async function openFile(filePath) {
  if (window.electronAPI?.openPath) return unwrap(await window.electronAPI.openPath(filePath))
  return invoke('shell:openPath', filePath)
}

export function listFiles(dir) { return invoke('files:list', { dir }) }
export function searchFiles(query, dir) { return invoke('files:search', { query, dir }) }
