export class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function electronAPI() {
  const electron = window.electronAPI
  if (!electron?.invoke) throw new ApiError('NOT_SUPPORTED', '当前环境无法使用 Electron 通信。')
  return electron
}

function unwrap(result) {
  if (result?.ok === false) {
    const error = result.error || { code: 'IPC_ERROR', message: '请求失败。' }
    throw new ApiError(error.code || 'IPC_ERROR', error.message || '请求失败。')
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
  if (url === '/api/conversations') return invoke('conversations:list')
  if (url.startsWith('/api/conversations/')) return invoke('conversations:get', { id: decodeURIComponent(url.slice('/api/conversations/'.length)) })
  if (url.startsWith('/api/files/list')) {
    const parsed = parseUrl(url)
    return invoke('files:list', { dir: parsed.searchParams.get('dir') })
  }
  if (url.startsWith('/api/files/search')) {
    const parsed = parseUrl(url)
    return invoke('files:search', { query: parsed.searchParams.get('query'), dir: parsed.searchParams.get('dir') })
  }
  throw new ApiError('UNSUPPORTED_ROUTE', `暂不支持 GET ${url}`)
}

async function post(url, body) {
  if (url === '/api/config') return invoke('config:set', body)
  if (url === '/api/conversations') return invoke('conversations:upsert', body)
  throw new ApiError('UNSUPPORTED_ROUTE', `暂不支持 POST ${url}`)
}

function stream(arg, legacyBody, legacyOnDelta, legacyOnDone, legacyOnError) {
  const options = typeof arg === 'string'
    ? { channel: arg === '/api/chat' ? 'chat:send' : arg, payload: legacyBody, onDelta: legacyOnDelta, onDone: legacyOnDone, onError: legacyOnError }
    : arg

  const { channel, payload, onDelta, onDone, onError, onToolStart, onToolLog, onToolResult, onToolError, onSkillLoaded } = options
  const electron = electronAPI()
  const cleanupFns = []
  let closed = false

  const cancelRemote = () => {
    if (!payload?.convId) return
    electron.invoke('chat:cancel', { convId: payload.convId }).catch((error) => {
      console.error('[api] cancel chat failed:', error)
    })
  }

  const cleanup = ({ cancel = false } = {}) => {
    if (closed) return
    if (cancel) cancelRemote()
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
  listen('chat:cancelled', () => { cleanup(); onDone?.() })
  listen('chat:error', (data) => {
    cleanup()
    const error = data.error || { code: 'CHAT_ERROR', message: '对话失败。' }
    onError?.(new ApiError(error.code, error.message))
  })

  electron.invoke(channel, payload).catch((error) => {
    if (closed) return
    cleanup()
    onError?.(error)
  })

  const unsubscribe = () => cleanup()
  const cancel = () => cleanup({ cancel: true })
  cancel.unsubscribe = unsubscribe
  cancel.cancel = cancel

  return cancel
}

export const api = {
  get,
  post,
  del: async (url) => { throw new ApiError('UNSUPPORTED_ROUTE', `暂不支持 DELETE ${url}`) },
  patch: async (url) => { throw new ApiError('UNSUPPORTED_ROUTE', `暂不支持 PATCH ${url}`) },
  stream,
  invoke
}

export function getConfig(username) { return invoke('config:get', username ? { username } : undefined) }
export function setConfig(patch, username) { return invoke('config:set', username ? { ...patch, username } : patch) }
export function listSkills() { return invoke('skills:list') }
export function reloadSkills() { return invoke('skills:reload') }
export function createSkill(payload) { return invoke('skills:create', payload) }
export function deleteSkill(name) { return invoke('skills:delete', { name }) }
export function copyBuiltinSkill(payload) { return invoke('skills:copyBuiltin', payload) }
export function openSkillsFolder() { return invoke('skills:openFolder') }
export function listRules(username) { return invoke('rules:list', username ? { username } : undefined) }
export function deleteRule(payload, username) { return invoke('rules:delete', username ? { ...payload, username } : payload) }

export async function openFile(filePath) {
  if (window.electronAPI?.openPath) return unwrap(await window.electronAPI.openPath(filePath))
  return invoke('shell:openPath', filePath)
}

export async function saveFileAs(payload) {
  if (window.electronAPI?.saveFileAs) return unwrap(await window.electronAPI.saveFileAs(payload))
  return invoke('dialog:saveFileAs', payload)
}

export function exportBackup(payload = {}) { return invoke('backup:export', payload) }
export function previewBackup(packagePath) { return invoke('backup:preview', { packagePath }) }
export function restoreBackup(packagePath, options = {}) { return invoke('backup:restore', { packagePath, ...options }) }

export function listFiles(dir, username) { return invoke('files:list', username ? { dir, username } : { dir }) }
export function searchFiles(query, dir, username) { return invoke('files:search', username ? { query, dir, username } : { query, dir }) }
export function listDiagnostics(username) { return invoke('diagnostics:list', { username: username || 'guest' }) }
export function getDiagnosis(diagnosisId, username) { return invoke('diagnostics:get', { diagnosisId, username: username || 'guest' }) }
export function getDiagnosticsStatus(username) { return invoke('diagnostics:status', { username: username || 'guest' }) }
export function listDiagnosticTargets() { return invoke('diagnostics:targets') }
export function selectDiagnosticsRegion() { return invoke('diagnostics:selectRegion') }
export function startDiagnostics(payload) { return invoke('diagnostics:start', payload) }
export function stopDiagnostics() { return invoke('diagnostics:stop') }
export function resumeDiagnosticsNow() { return invoke('diagnostics:resumeNow') }
export function ignoreDiagnosisSignature(signature, username) { return invoke('diagnostics:ignore', { signature, username: username || 'guest' }) }
export function executeDiagnosisFix(payload) { return invoke('diagnostics:executeFix', payload) }
export function explainDiagnosis(diagnosisId, username) { return invoke('diagnostics:explain', { diagnosisId, username: username || 'guest' }) }
export function rewriteDiagnosisPlan(diagnosisId, experienceId, username) { return invoke('diagnostics:rewritePlan', { diagnosisId, experienceId, username: username || 'guest' }) }
export function sendPopupAction(payload) { return invoke('diagnostics:popup-action', payload) }
export function listExperiences(username, status) { return invoke('experiences:list', { username: username || 'guest', status }) }
export function getExperience(id, username) { return invoke('experiences:get', { id, username: username || 'guest' }) }
export function updateExperience(payload, username) { return invoke('experiences:update', { ...payload, username: username || 'guest' }) }
export function deleteExperience(id, username) { return invoke('experiences:delete', { id, username: username || 'guest' }) }
export function searchExperiences(query, username, status) { return invoke('experiences:search', { query, username: username || 'guest', status }) }
export function exportExperiences(username) { return invoke('experiences:export', { username: username || 'guest' }) }
export function listProjects(username) { return invoke('projects:list', { username: username || 'guest' }) }
export function addProject(payload, username) { return invoke('projects:add', { ...(payload || {}), username: username || 'guest' }) }
export function getProject(projectId, username) { return invoke('projects:get', { projectId, username: username || 'guest' }) }
export function removeProject(projectId, username) { return invoke('projects:remove', { projectId, username: username || 'guest' }) }
export function getProjectSettings(projectId, username) { return invoke('projects:settings:get', { projectId, username: username || 'guest' }) }
export function updateProjectSettings(projectId, patch, username) { return invoke('projects:settings:update', { projectId, patch, username: username || 'guest' }) }
export function refreshProjectProfile(projectId, username) { return invoke('projects:profile:refresh', { projectId, username: username || 'guest' }) }
export function startProjectIndex(projectId, username) { return invoke('projects:index:start', { projectId, username: username || 'guest' }) }
export function pauseProjectIndex(projectId, username) { return invoke('projects:index:pause', { projectId, username: username || 'guest' }) }
export function clearProjectIndex(projectId, username) { return invoke('projects:index:clear', { projectId, username: username || 'guest' }) }
export function getProjectIndexStatus(projectId, username) { return invoke('projects:index:status', { projectId, username: username || 'guest' }) }
export function searchProject(projectId, query, username, filters) { return invoke('projects:search', { projectId, query, filters, username: username || 'guest' }) }
export function askProject(projectId, question, username) { return invoke('projects:ask', { projectId, question, username: username || 'guest' }) }
export function previewProjectPatch(projectId, payload, username) { return invoke('projects:patch:preview', { ...(payload || {}), projectId, username: username || 'guest' }) }
export function applyProjectPatch(projectId, patchId, username) { return invoke('projects:patch:apply', { projectId, patchId, confirmed: true, username: username || 'guest' }) }
export function listProjectPatches(projectId, username) { return invoke('projects:patch:list', { projectId, username: username || 'guest' }) }
export function matchProjectExperiences(projectId, payload, username) { return invoke('projects:experiences:match', { ...(payload || {}), projectId, username: username || 'guest' }) }
export function getProjectEmbeddingStatus(projectId, username) { return invoke('projects:embedding:status', { projectId, username: username || 'guest' }) }
export function refreshProjectEmbedding(projectId, username) { return invoke('projects:embedding:refresh', { projectId, username: username || 'guest' }) }
