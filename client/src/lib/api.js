export class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function electronAPI() {
  const electron = window.electronAPI
  if (!electron?.invoke) throw new ApiError('NOT_SUPPORTED', '当前环境不可用 Electron IPC。')
  return electron
}

function unwrap(result) {
  if (result?.ok === false) {
    const error = result.error || { code: 'IPC_ERROR', message: 'IPC 请求失败。' }
    throw new ApiError(error.code || 'IPC_ERROR', error.message || 'IPC 请求失败。')
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
  throw new ApiError('UNSUPPORTED_ROUTE', `没有对应的 GET IPC 路由：${url}`)
}

async function post(url, body) {
  if (url === '/api/config') return invoke('config:set', body)
  if (url === '/api/conversations') return invoke('conversations:upsert', body)
  throw new ApiError('UNSUPPORTED_ROUTE', `没有对应的 POST IPC 路由：${url}`)
}

function stream(arg, legacyBody, legacyOnDelta, legacyOnDone, legacyOnError) {
  const options = typeof arg === 'string'
    ? { channel: arg === '/api/chat' ? 'chat:send' : arg, payload: legacyBody, onDelta: legacyOnDelta, onDone: legacyOnDone, onError: legacyOnError }
    : arg

  const {
    channel,
    payload,
    onDelta,
    onDone,
    onError,
    onToolStart,
    onToolLog,
    onToolResult,
    onToolError,
    onSkillLoaded,
    onActionPlan,
    onActionUpdate,
    onConfirmationRequest,
    onConfirmationCleared,
    onDesktopAsk,
    onDesktopAskCleared,
    onDesktopEvent
  } = options
  let electron
  try {
    electron = electronAPI()
  } catch (error) {
    onError?.(error)
    return () => {}
  }
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
  listen('chat:action-plan', (data) => onActionPlan?.(data))
  listen('chat:action-update', (data) => onActionUpdate?.(data))
  listen('chat:confirmation-request', (data) => onConfirmationRequest?.(data))
  listen('chat:confirmation-cleared', (data) => onConfirmationCleared?.(data))
  listen('chat:desktop-ask', (data) => onDesktopAsk?.(data))
  listen('chat:desktop-ask-cleared', (data) => onDesktopAskCleared?.(data))
  listen('chat:desktop-event', (data) => onDesktopEvent?.(data.event))
  listen('chat:done', () => { cleanup(); onDone?.() })
  listen('chat:error', (data) => {
    cleanup()
    const error = data.error || { code: 'CHAT_ERROR', message: '聊天请求失败。' }
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
  del: async (url) => { throw new ApiError('UNSUPPORTED_ROUTE', `没有对应的 DELETE IPC 路由：${url}`) },
  patch: async (url) => { throw new ApiError('UNSUPPORTED_ROUTE', `没有对应的 PATCH IPC 路由：${url}`) },
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
export function appendRule(text) { return invoke('rules:append', { text }) }
export function updateRule(id, text) { return invoke('rules:update', { id, text }) }
export function deleteRule(payload) { return invoke('rules:delete', payload) }
export function emergencyStop() { return invoke('actions:emergencyStop') }
export function getRuntimeStatus() { return invoke('runtime:status') }
export function bootstrapRuntime(runtime) { return invoke('runtime:bootstrap', { runtime }) }
export function startRuntime(runtime) { return invoke('runtime:start', { runtime }) }
export function stopRuntime(runtime) { return invoke('runtime:stop', { runtime }) }
export function listActions(filters = {}) { return invoke('actions:list', filters) }
export function approveAction(id) { return invoke('actions:approve', { id }) }
export function denyAction(id, reason) { return invoke('actions:deny', { id, reason }) }
export function cancelAction(id, reason) { return invoke('actions:cancel', { id, reason }) }
export function listAuditEvents(filters = {}) { return invoke('audit:list', { filters }) }
export function exportAuditEvents(filters = {}, outputPath) { return invoke('audit:export', { filters, outputPath }) }
export function listArtifacts() { return invoke('artifacts:list') }
export function deleteArtifact(id) { return invoke('artifacts:delete', { id }) }
export function listRunOutputs(filters = {}) { return invoke('outputs:list', { filters }) }
export function exportRunOutputs(filters = {}, outputPath) { return invoke('outputs:export', { filters, outputPath }) }
export function openRunOutput(filePath) { return invoke('outputs:open', { path: filePath }) }
export function listConversations(search) { return invoke('conversations:list', search ? { search } : undefined) }
export function deleteConversation(id) { return invoke('conversations:delete', { id }) }
export function renameConversation(id, title) { return invoke('conversations:rename', { id, title }) }
export function approveChatTool(convId, callId) { return invoke('chat:approve-tool', { convId, callId, approved: true }) }
export function denyChatTool(convId, callId) { return invoke('chat:approve-tool', { convId, callId, approved: false }) }
export function abortChat(convId) { return invoke('chat:abort', { convId }) }

export async function openFile(filePath) {
  if (window.electronAPI?.openPath) return unwrap(await window.electronAPI.openPath(filePath))
  return invoke('shell:openPath', filePath)
}

export function listFiles(dir) { return invoke('files:list', { dir }) }
export function searchFiles(query, dir) { return invoke('files:search', { query, dir }) }

// Agent-native API

export function runAgentTurn({ convId, messages, onEvent, onDone, onError }) {
  const electron = electronAPI()
  if (!electron?.agent) throw new ApiError('NOT_SUPPORTED', 'Agent API 不可用。')

  const cleanup = electron.agent.onEvent((data) => {
    if (data.convId !== convId) return
    onEvent?.(data.type, data)
  })

  electron.agent.runTurn({ convId, messages }).then((result) => {
    cleanup()
    if (result.ok || result.error === undefined) onDone?.(result)
    else onError?.(new ApiError(result.error?.code || 'AGENT_ERROR', result.error?.message || 'Agent 执行失败。'))
  }).catch((error) => {
    cleanup()
    onError?.(error)
  })

  return () => {
    cleanup()
    electron.agent.abort({ convId })
  }
}

export function approveTool(convId, callId) {
  return window.electronAPI.agent.approveTool({ convId, callId, approved: true })
}

export function denyTool(convId, callId) {
  return window.electronAPI.agent.approveTool({ convId, callId, approved: false })
}

export function abortAgent(convId) {
  return window.electronAPI.agent.abort({ convId })
}
