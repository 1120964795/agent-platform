// Renderer-side auth client. Talks to the Electron main process via IPC.
// Falls back to a localStorage-backed mock when window.electronAPI is absent
// so `npm run dev` works in a plain browser (no real password protection there).

const TOKEN_KEYS = {
  remembered: 'agentdev.auth.token',       // localStorage (persistent)
  ephemeral: 'agentdev.auth.token.session' // sessionStorage (this window only)
}
const MOCK_DB_KEY = 'agentdev.auth.mockdb'

function hasElectron() {
  return typeof window !== 'undefined' && !!window.electronAPI?.invoke
}

export function getStoredToken() {
  if (typeof window === 'undefined') return null
  return (
    window.sessionStorage?.getItem(TOKEN_KEYS.ephemeral) ||
    window.localStorage?.getItem(TOKEN_KEYS.remembered) ||
    null
  )
}

export function storeToken(token, remember) {
  if (typeof window === 'undefined' || !token) return
  if (remember) {
    window.localStorage?.setItem(TOKEN_KEYS.remembered, token)
    window.sessionStorage?.removeItem(TOKEN_KEYS.ephemeral)
  } else {
    window.sessionStorage?.setItem(TOKEN_KEYS.ephemeral, token)
    window.localStorage?.removeItem(TOKEN_KEYS.remembered)
  }
}

export function clearStoredToken() {
  if (typeof window === 'undefined') return
  window.localStorage?.removeItem(TOKEN_KEYS.remembered)
  window.sessionStorage?.removeItem(TOKEN_KEYS.ephemeral)
}

/* ── Browser-only mock implementation ─────────────────────────────
   Mirrors the main-process contract closely enough for UI dev.
   Not for production. Plain-text passwords; do not run with real creds. */
function readMockDb() {
  try {
    return JSON.parse(window.localStorage.getItem(MOCK_DB_KEY)) || { users: [], sessions: [] }
  } catch {
    return { users: [], sessions: [] }
  }
}
function writeMockDb(db) {
  window.localStorage.setItem(MOCK_DB_KEY, JSON.stringify(db))
}
function mockToken() {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('')
}
const USERNAME_RE = /^[A-Za-z0-9_-]{3,32}$/
function passwordOk(p) {
  if (typeof p !== 'string' || p.length < 8) return false
  let n = 0
  if (/[a-z]/.test(p)) n++
  if (/[A-Z]/.test(p)) n++
  if (/[0-9]/.test(p)) n++
  if (/[^A-Za-z0-9]/.test(p)) n++
  return n >= 2
}

async function mockInvoke(channel, payload = {}) {
  const db = readMockDb()
  if (channel === 'auth:get-status') {
    const needsSetup = db.users.length === 0
    const token = payload.token
    if (!token) return { needsSetup, hasSession: false }
    const now = Date.now()
    db.sessions = db.sessions.filter(s => !s.expiresAt || s.expiresAt > now)
    writeMockDb(db)
    const session = db.sessions.find(s => s.token === token)
    return session
      ? { needsSetup, hasSession: true, username: session.username }
      : { needsSetup, hasSession: false }
  }
  if (channel === 'auth:setup') {
    if (!USERNAME_RE.test(payload.username || '')) return { ok: false, error: 'INVALID_USERNAME' }
    if (!passwordOk(payload.password)) return { ok: false, error: 'WEAK_PASSWORD' }
    if (db.users.some(u => u.username === payload.username)) return { ok: false, error: 'USERNAME_TAKEN' }
    db.users.push({ username: payload.username, password: payload.password })
    const token = mockToken()
    db.sessions.push({ token, username: payload.username, expiresAt: Date.now() + 30 * 86400000 })
    writeMockDb(db)
    return { ok: true, token, user: { username: payload.username } }
  }
  if (channel === 'auth:login') {
    const u = db.users.find(x => x.username === payload.username && x.password === payload.password)
    if (!u) return { ok: false, error: 'BAD_CREDENTIALS' }
    const token = mockToken()
    if (payload.remember) {
      db.sessions.push({ token, username: u.username, expiresAt: Date.now() + 30 * 86400000 })
      writeMockDb(db)
    }
    return { ok: true, token, user: { username: u.username } }
  }
  if (channel === 'auth:logout') {
    db.sessions = db.sessions.filter(s => s.token !== payload.token)
    writeMockDb(db)
    return { ok: true }
  }
  throw new Error(`unknown channel ${channel}`)
}

function invoke(channel, payload) {
  return hasElectron() ? window.electronAPI.invoke(channel, payload) : mockInvoke(channel, payload)
}

export async function getStatus(token) {
  return invoke('auth:get-status', { token })
}
export async function setup(username, password) {
  return invoke('auth:setup', { username, password })
}
export async function login(username, password, remember) {
  return invoke('auth:login', { username, password, remember })
}
export async function logout(token) {
  return invoke('auth:logout', { token })
}

export const ERROR_MESSAGES = {
  USERNAME_TAKEN: '该用户名已被使用,请换一个',
  INVALID_USERNAME: '用户名格式无效:3–32 位字母、数字、下划线或短横线',
  WEAK_PASSWORD: '密码至少 8 位,且包含至少两类字符(大写/小写/数字/符号)',
  BAD_CREDENTIALS: '用户名或密码错误',
  LOCKED: '登录失败次数过多,请 15 分钟后再试',
  NETWORK: '本地服务无响应,请重启应用'
}
