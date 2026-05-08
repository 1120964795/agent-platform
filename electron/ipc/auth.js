const crypto = require('crypto')
const { store, DEFAULT_AUTH } = require('../store')

const PASSWORD_ITERATIONS = 120000
const PASSWORD_KEYLEN = 32
const PASSWORD_DIGEST = 'sha256'
const MAX_LOGIN_HISTORY = 8

function normalizeUsername(username) {
  return String(username || '').trim()
}

function usernameKey(username) {
  return normalizeUsername(username).toLowerCase()
}

function normalizeLoginPrefs(prefs = {}) {
  const rememberPassword = Boolean(prefs.rememberPassword || prefs.autoLogin)
  const autoLogin = Boolean(prefs.autoLogin)

  return {
    username: rememberPassword && typeof prefs.username === 'string' ? prefs.username : '',
    password: rememberPassword && typeof prefs.password === 'string' ? prefs.password : '',
    rememberPassword,
    autoLogin
  }
}

function normalizeSession(session) {
  if (!session || typeof session !== 'object') return null
  const username = normalizeUsername(session.username)
  return session.autoLogin && username ? { username, autoLogin: true } : null
}

function normalizeAccount(account) {
  const username = normalizeUsername(account?.username)
  if (!username) return null

  return {
    username,
    salt: typeof account.salt === 'string' ? account.salt : '',
    passwordHash: typeof account.passwordHash === 'string' ? account.passwordHash : '',
    createdAt: typeof account.createdAt === 'string' ? account.createdAt : new Date().toISOString(),
    updatedAt: typeof account.updatedAt === 'string' ? account.updatedAt : new Date().toISOString()
  }
}

function normalizeAuth(raw = {}) {
  const accounts = []
  const seen = new Set()

  for (const rawAccount of Array.isArray(raw.accounts) ? raw.accounts : []) {
    const account = normalizeAccount(rawAccount)
    if (!account) continue
    const key = usernameKey(account.username)
    if (seen.has(key)) continue
    seen.add(key)
    accounts.push(account)
  }

  const loginHistory = []
  for (const item of Array.isArray(raw.loginHistory) ? raw.loginHistory : []) {
    const username = normalizeUsername(item)
    const key = usernameKey(username)
    if (!username || loginHistory.some((name) => usernameKey(name) === key)) continue
    loginHistory.push(username)
    if (loginHistory.length >= MAX_LOGIN_HISTORY) break
  }

  return {
    ...DEFAULT_AUTH,
    version: 1,
    accounts,
    loginHistory,
    loginPrefs: normalizeLoginPrefs(raw.loginPrefs),
    session: normalizeSession(raw.session)
  }
}

function getAuth() {
  return normalizeAuth(store.getAuth())
}

function saveAuth(auth) {
  const normalized = normalizeAuth(auth)
  store.saveAuth(normalized)
  return normalized
}

function error(code, message) {
  return { ok: false, error: { code, message } }
}

function createCredentials(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  return {
    salt,
    passwordHash: hashPassword(password, salt)
  }
}

function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(String(password), salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST)
    .toString('hex')
}

function safeEqualHex(left, right) {
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')
  if (leftBuffer.length !== rightBuffer.length) return false
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function verifyPassword(account, password) {
  if (!account?.salt || !account?.passwordHash) return false
  const candidate = hashPassword(password, account.salt)
  return safeEqualHex(candidate, account.passwordHash)
}

function findAccount(auth, username) {
  const key = usernameKey(username)
  return auth.accounts.find((account) => usernameKey(account.username) === key) || null
}

function addLoginHistory(auth, username) {
  const normalized = normalizeUsername(username)
  if (!normalized) return auth
  auth.loginHistory = [
    normalized,
    ...auth.loginHistory.filter((item) => usernameKey(item) !== usernameKey(normalized))
  ].slice(0, MAX_LOGIN_HISTORY)
  return auth
}

function publicState(auth) {
  const state = normalizeAuth(auth)
  const session = state.session
  return {
    loginPrefs: state.loginPrefs,
    usernameOptions: state.loginHistory,
    currentUser: session?.autoLogin && session.username ? { username: session.username } : null
  }
}

function createAccount(username, password) {
  const now = new Date().toISOString()
  return {
    username,
    ...createCredentials(password),
    createdAt: now,
    updatedAt: now
  }
}

function mergeLegacyAccounts(auth, accounts) {
  for (const rawAccount of Array.isArray(accounts) ? accounts : []) {
    const username = normalizeUsername(rawAccount?.username)
    const password = typeof rawAccount?.password === 'string' ? rawAccount.password : ''
    if (!username || !password || findAccount(auth, username)) continue
    auth.accounts.push(createAccount(username, password))
  }
}

function mergeLegacyHistory(auth, history) {
  const items = Array.isArray(history) ? [...history].reverse() : []
  for (const username of items) addLoginHistory(auth, username)
}

function mergeLegacyPrefs(auth, prefs) {
  const nextPrefs = normalizeLoginPrefs(prefs)
  if (!nextPrefs.rememberPassword || !findAccount(auth, nextPrefs.username)) return
  auth.loginPrefs = nextPrefs
}

function mergeLegacySession(auth, session) {
  const nextSession = normalizeSession(session)
  if (!nextSession || !findAccount(auth, nextSession.username)) return
  auth.session = nextSession
  addLoginHistory(auth, nextSession.username)
}

function register(ipcMain) {
  ipcMain.handle('auth:getState', async () => {
    const auth = saveAuth(getAuth())
    return { ok: true, ...publicState(auth) }
  })

  ipcMain.handle('auth:register', async (_event, payload = {}) => {
    const username = normalizeUsername(payload.username)
    const password = String(payload.password || '')

    if (!username) return error('AUTH_USERNAME_REQUIRED', '请输入用户名')
    if (password.length < 6) return error('AUTH_PASSWORD_TOO_SHORT', '密码长度不能少于 6 位')

    const auth = getAuth()
    if (findAccount(auth, username)) {
      return error('AUTH_ACCOUNT_EXISTS', '该用户名已被注册，请换一个用户名')
    }

    auth.accounts.push(createAccount(username, password))
    const saved = saveAuth(auth)
    return { ok: true, ...publicState(saved) }
  })

  ipcMain.handle('auth:login', async (_event, payload = {}) => {
    const username = normalizeUsername(payload.username)
    const password = String(payload.password || '')
    const auth = getAuth()
    const account = findAccount(auth, username)

    if (!account) return error('AUTH_ACCOUNT_NOT_FOUND', '账号不存在，请先注册')
    if (!verifyPassword(account, password)) {
      return error('AUTH_PASSWORD_INVALID', '密码不正确，请重新输入')
    }

    const shouldRememberPassword = Boolean(payload.rememberPassword || payload.autoLogin)
    const shouldAutoLogin = Boolean(payload.autoLogin)

    auth.loginPrefs = {
      username: shouldRememberPassword ? account.username : '',
      password: shouldRememberPassword ? password : '',
      rememberPassword: shouldRememberPassword,
      autoLogin: shouldAutoLogin
    }
    auth.session = shouldAutoLogin ? { username: account.username, autoLogin: true } : null
    addLoginHistory(auth, account.username)

    const saved = saveAuth(auth)
    return { ok: true, user: { username: account.username }, ...publicState(saved) }
  })

  ipcMain.handle('auth:logout', async () => {
    const auth = getAuth()
    auth.session = null
    auth.loginPrefs = {
      ...auth.loginPrefs,
      autoLogin: false
    }
    const saved = saveAuth(auth)
    return { ok: true, ...publicState(saved) }
  })

  ipcMain.handle('auth:migrateLocalStorage', async (_event, payload = {}) => {
    const auth = getAuth()
    mergeLegacyAccounts(auth, payload.accounts)
    mergeLegacyHistory(auth, payload.loginHistory)
    mergeLegacyPrefs(auth, payload.loginPrefs)
    mergeLegacySession(auth, payload.session)
    const saved = saveAuth(auth)
    return { ok: true, ...publicState(saved) }
  })
}

module.exports = {
  register,
  normalizeAuth,
  verifyPassword,
  publicState
}
