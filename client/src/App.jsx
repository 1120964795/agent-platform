import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from './components/layout/Layout.jsx'
import AuthPage from './pages/AuthPage.jsx'
import { api } from './lib/api.js'

const ACCOUNT_STORAGE_KEY = 'agentdev-lite.accounts'
const SESSION_STORAGE_KEY = 'agentdev-lite.session'
const LOGIN_PREFS_STORAGE_KEY = 'agentdev-lite.login-prefs'
const LOGIN_HISTORY_STORAGE_KEY = 'agentdev-lite.login-history'
const LEGACY_AUTH_STORAGE_KEYS = [
  ACCOUNT_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  LOGIN_PREFS_STORAGE_KEY,
  LOGIN_HISTORY_STORAGE_KEY
]
const ASSISTANT_ID = 'general'

const DEFAULT_LOGIN_PREFS = {
  username: '',
  password: '',
  rememberPassword: false,
  autoLogin: false
}

function readStorage(key, fallback) {
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function normalizeLoginPrefs(prefs = DEFAULT_LOGIN_PREFS) {
  const rememberPassword = Boolean(prefs.rememberPassword || prefs.autoLogin)

  return {
    username: rememberPassword && typeof prefs.username === 'string' ? prefs.username : '',
    password: rememberPassword && typeof prefs.password === 'string' ? prefs.password : '',
    rememberPassword,
    autoLogin: Boolean(prefs.autoLogin)
  }
}

function normalizeAuthState(response = {}) {
  return {
    currentUser: response.currentUser?.username ? { username: response.currentUser.username } : null,
    loginPrefs: normalizeLoginPrefs(response.loginPrefs),
    usernameOptions: Array.isArray(response.usernameOptions)
      ? response.usernameOptions.filter(Boolean)
      : []
  }
}

function readLegacyAuthSnapshot() {
  const accounts = readStorage(ACCOUNT_STORAGE_KEY, [])
  const loginHistory = readStorage(LOGIN_HISTORY_STORAGE_KEY, [])
  const loginPrefs = readStorage(LOGIN_PREFS_STORAGE_KEY, DEFAULT_LOGIN_PREFS)
  const session = readStorage(SESSION_STORAGE_KEY, null)

  const payload = {
    accounts: Array.isArray(accounts) ? accounts : [],
    loginHistory: Array.isArray(loginHistory) ? loginHistory.filter(Boolean) : [],
    loginPrefs: normalizeLoginPrefs(loginPrefs),
    session: session && typeof session === 'object' ? session : null
  }

  const hasData =
    payload.accounts.length > 0 ||
    payload.loginHistory.length > 0 ||
    payload.loginPrefs.rememberPassword ||
    Boolean(payload.session?.username)

  return { hasData, payload }
}

function clearLegacyAuthStorage() {
  for (const key of LEGACY_AUTH_STORAGE_KEYS) {
    window.localStorage.removeItem(key)
  }
}

function authErrorMessage(error) {
  return error?.message || '操作失败，请稍后重试'
}

function setAppMenuVisible(visible) {
  window.electronAPI?.invoke?.('app-menu:set-visible', { visible }).catch((error) => {
    console.error('[app] set menu visibility failed:', error)
  })
}

function permissionModeKey(username) {
  return `agentdev-permission-mode:${username || 'guest'}`
}

function createConversationId(username) {
  const userKey = encodeURIComponent(username || 'guest')
  const stamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `${ASSISTANT_ID}:user:${userKey}:${stamp}-${random}`
}

function belongsToUser(conversation, username) {
  const normalizedUsername = username || 'guest'
  const userKey = encodeURIComponent(normalizedUsername)
  const id = conversation?.id || ''

  if (conversation?.username) {
    return conversation.username.toLowerCase() === normalizedUsername.toLowerCase()
  }

  return id.startsWith(`${ASSISTANT_ID}:user:${userKey}:`)
}

function sortConversations(conversations) {
  return [...conversations].sort((a, b) => {
    const left = new Date(a.updatedAt || a.createdAt || 0).getTime()
    const right = new Date(b.updatedAt || b.createdAt || 0).getTime()
    return right - left
  })
}

export default function App() {
  const [authReady, setAuthReady] = useState(false)
  const [authMessage, setAuthMessage] = useState(null)
  const [authState, setAuthState] = useState(() => normalizeAuthState())
  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)

  const activeConversation = useMemo(
    () => conversations.find(conversation => conversation.id === activeConversationId) || null,
    [conversations, activeConversationId]
  )

  const applyAuthState = useCallback((response, options = {}) => {
    const nextState = normalizeAuthState(response)
    setAuthState(nextState)

    if (!options.preserveCurrentUser) {
      setCurrentUser(nextState.currentUser)
    }

    return nextState
  }, [])

  useEffect(() => {
    let ignored = false

    async function loadAuthState() {
      try {
        const legacy = readLegacyAuthSnapshot()
        if (legacy.hasData) {
          await api.invoke('auth:migrateLocalStorage', legacy.payload)
          clearLegacyAuthStorage()
        }

        const response = await api.invoke('auth:getState')
        if (!ignored) applyAuthState(response)
      } catch (error) {
        if (!ignored) {
          console.error('[app] load auth state failed:', error)
          setAuthMessage({ type: 'error', text: authErrorMessage(error) })
        }
      } finally {
        if (!ignored) setAuthReady(true)
      }
    }

    loadAuthState()
    return () => { ignored = true }
  }, [applyAuthState])

  useEffect(() => {
    setAppMenuVisible(Boolean(currentUser))
  }, [currentUser])

  useEffect(() => {
    if (!currentUser?.username) return

    let ignored = false
    async function syncPermissionMode() {
      try {
        const result = await api.invoke('config:get', { username: currentUser.username })
        if (ignored) return
        const mode = result.config?.permissionMode || 'default'
        localStorage.setItem(permissionModeKey(currentUser.username), mode)
        window.dispatchEvent(new CustomEvent('agentdev:permission-changed', {
          detail: { mode, username: currentUser.username }
        }))
      } catch (error) {
        console.error('[app] sync permission mode failed:', error)
      }
    }

    syncPermissionMode()
    return () => { ignored = true }
  }, [currentUser?.username])

  useEffect(() => {
    if (!currentUser?.username) {
      setConversations([])
      setActiveConversationId(null)
      return
    }

    let ignored = false
    const username = currentUser.username
    setConversations([])
    setActiveConversationId(createConversationId(username))

    async function loadConversations() {
      try {
        const response = await api.invoke('conversations:list', { username })
        if (ignored) return

        const userConversations = sortConversations(
          (response.conversations || []).filter(conversation => belongsToUser(conversation, username))
        )

        setConversations(userConversations)
        setActiveConversationId(userConversations[0]?.id || createConversationId(username))
      } catch (error) {
        if (!ignored) {
          console.error('[app] load conversations failed:', error)
          setActiveConversationId(createConversationId(username))
        }
      }
    }

    loadConversations()
    return () => { ignored = true }
  }, [currentUser?.username])

  async function handleRegister({ username, password }) {
    try {
      const response = await api.invoke('auth:register', { username, password })
      applyAuthState(response, { preserveCurrentUser: true })
      return { ok: true }
    } catch (error) {
      return { ok: false, message: authErrorMessage(error) }
    }
  }

  async function handleLogin({ username, password, rememberPassword, autoLogin }) {
    try {
      const response = await api.invoke('auth:login', {
        username,
        password,
        rememberPassword,
        autoLogin
      })

      applyAuthState(response, { preserveCurrentUser: true })
      setCurrentUser(response.user || null)
      setAuthMessage(null)
      return { ok: true }
    } catch (error) {
      return { ok: false, message: authErrorMessage(error) }
    }
  }

  async function handleLogout() {
    try {
      const response = await api.invoke('auth:logout')
      applyAuthState(response)
    } catch (error) {
      console.error('[app] logout failed:', error)
      setCurrentUser(null)
    }

    setAuthMessage({ type: 'success', text: '已退出登录。' })
  }

  const handleNewConversation = useCallback(() => {
    setActiveConversationId(createConversationId(currentUser?.username))
  }, [currentUser?.username])

  const handleSelectConversation = useCallback((conversationId) => {
    setActiveConversationId(conversationId)
  }, [])

  const handleConversationSaved = useCallback((conversation, options = {}) => {
    if (!conversation || !belongsToUser(conversation, currentUser?.username)) return

    setConversations(current => sortConversations([
      conversation,
      ...current.filter(item => item.id !== conversation.id)
    ]))
    if (options.select) setActiveConversationId(conversation.id)
  }, [currentUser?.username])

  if (!authReady) {
    return (
      <main className="flex h-screen items-center justify-center bg-slate-950 text-sm font-semibold text-white">
        正在加载账号数据...
      </main>
    )
  }

  if (!currentUser) {
    return (
      <AuthPage
        initialLoginPrefs={authState.loginPrefs}
        usernameOptions={authState.usernameOptions}
        onLogin={handleLogin}
        onRegister={handleRegister}
        message={authMessage}
      />
    )
  }

  return (
    <Layout
      currentUser={currentUser}
      onLogout={handleLogout}
      conversations={conversations}
      activeConversationId={activeConversationId}
      activeConversation={activeConversation}
      onNewConversation={handleNewConversation}
      onSelectConversation={handleSelectConversation}
      onConversationSaved={handleConversationSaved}
    />
  )
}
