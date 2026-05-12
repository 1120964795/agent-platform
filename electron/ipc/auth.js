const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { store } = require('../store')

const AUTH_FILE = path.join(store.DATA_DIR, 'auth.json')
const SCRYPT_KEYLEN = 64
const SCRYPT_COST = 16384
const TOKEN_BYTES = 32
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000  // 30 days
const USERNAME_RE = /^[A-Za-z0-9_-]{3,32}$/
const LOCKOUT_THRESHOLD = 5
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000

// Per-username failed-login counters. In-memory only; cleared on restart.
const failures = new Map()

function ensureDir() {
  if (!fs.existsSync(store.DATA_DIR)) fs.mkdirSync(store.DATA_DIR, { recursive: true })
}

function readDb() {
  ensureDir()
  if (!fs.existsSync(AUTH_FILE)) return { users: [], sessions: [] }
  try {
    let raw = fs.readFileSync(AUTH_FILE, 'utf8')
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
    const parsed = JSON.parse(raw)
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : []
    }
  } catch {
    return { users: [], sessions: [] }
  }
}

function writeDb(db) {
  ensureDir()
  fs.writeFileSync(AUTH_FILE, JSON.stringify(db, null, 2), 'utf8')
}

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, useSalt, SCRYPT_KEYLEN, { N: SCRYPT_COST }).toString('hex')
  return { salt: useSalt, hash }
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt)
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(expectedHash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function passwordStrengthOk(password) {
  if (typeof password !== 'string' || password.length < 8) return false
  let classes = 0
  if (/[a-z]/.test(password)) classes++
  if (/[A-Z]/.test(password)) classes++
  if (/[0-9]/.test(password)) classes++
  if (/[^A-Za-z0-9]/.test(password)) classes++
  return classes >= 2
}

function newToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex')
}

function pruneSessions(db) {
  const now = Date.now()
  const before = db.sessions.length
  db.sessions = db.sessions.filter(s => !s.expiresAt || s.expiresAt > now)
  return before !== db.sessions.length
}

function isLocked(username) {
  const entry = failures.get(username)
  if (!entry) return false
  if (Date.now() - entry.firstAt > LOCKOUT_WINDOW_MS) {
    failures.delete(username)
    return false
  }
  return entry.count >= LOCKOUT_THRESHOLD
}

function recordFailure(username) {
  const now = Date.now()
  const entry = failures.get(username)
  if (!entry || now - entry.firstAt > LOCKOUT_WINDOW_MS) {
    failures.set(username, { count: 1, firstAt: now })
  } else {
    entry.count++
  }
}

function clearFailures(username) {
  failures.delete(username)
}

async function handleGetStatus(_evt, payload = {}) {
  const db = readDb()
  const needsSetup = db.users.length === 0
  const token = payload && typeof payload.token === 'string' ? payload.token : null
  if (!token) return { needsSetup, hasSession: false }

  if (pruneSessions(db)) writeDb(db)
  const session = db.sessions.find(s => s.token === token)
  if (!session) return { needsSetup, hasSession: false }
  return { needsSetup, hasSession: true, username: session.username }
}

async function handleSetup(_evt, { username, password } = {}) {
  const db = readDb()
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return { ok: false, error: 'INVALID_USERNAME' }
  }
  if (!passwordStrengthOk(password)) return { ok: false, error: 'WEAK_PASSWORD' }
  if (db.users.some(u => u.username === username)) {
    return { ok: false, error: 'USERNAME_TAKEN' }
  }

  const { salt, hash } = hashPassword(password)
  db.users.push({ username, salt, passwordHash: hash, createdAt: Date.now() })

  // Setup always grants a persistent session (user just proved identity).
  const token = newToken()
  db.sessions.push({ token, username, expiresAt: Date.now() + SESSION_TTL_MS })
  writeDb(db)
  return { ok: true, token, user: { username } }
}

async function handleLogin(_evt, { username, password, remember } = {}) {
  const db = readDb()
  if (typeof username !== 'string' || typeof password !== 'string') {
    return { ok: false, error: 'BAD_CREDENTIALS' }
  }
  if (isLocked(username)) return { ok: false, error: 'LOCKED' }

  const user = db.users.find(u => u.username === username)
  if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
    recordFailure(username)
    return { ok: false, error: 'BAD_CREDENTIALS' }
  }

  clearFailures(username)
  const token = newToken()
  if (remember) {
    db.sessions.push({ token, username, expiresAt: Date.now() + SESSION_TTL_MS })
    pruneSessions(db)
    writeDb(db)
  }
  // For non-remember, return token without persisting — renderer keeps it in sessionStorage.
  return { ok: true, token, user: { username } }
}

async function handleLogout(_evt, { token } = {}) {
  if (!token) return { ok: true }
  const db = readDb()
  const before = db.sessions.length
  db.sessions = db.sessions.filter(s => s.token !== token)
  if (db.sessions.length !== before) writeDb(db)
  return { ok: true }
}

function register(ipcMain) {
  ipcMain.handle('auth:get-status', handleGetStatus)
  ipcMain.handle('auth:setup', handleSetup)
  ipcMain.handle('auth:login', handleLogin)
  ipcMain.handle('auth:logout', handleLogout)
}

module.exports = {
  register,
  // Exposed for tests
  _internal: { readDb, writeDb, passwordStrengthOk, hashPassword, verifyPassword, AUTH_FILE }
}
