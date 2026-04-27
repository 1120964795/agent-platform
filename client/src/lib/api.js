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

export function listFiles(dir, username) { return invoke('files:list', username ? { dir, username } : { dir }) }
export function searchFiles(query, dir, username) { return invoke('files:search', username ? { query, dir, username } : { query, dir }) }
