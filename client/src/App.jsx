import { useEffect, useState } from 'react'
import Layout from './components/layout/Layout.jsx'
import WelcomeSetupDialog from './components/WelcomeSetupDialog.jsx'
import AuthPage from './pages/AuthPage.jsx'
import { getStatus, getStoredToken, clearStoredToken, logout as authLogout } from './lib/auth.js'

export default function App() {
  const [authState, setAuthState] = useState({ phase: 'loading', needsSetup: false, username: null })
  const [welcomeOpen, setWelcomeOpen] = useState(false)

  // Resolve initial auth phase from stored token + main process.
  useEffect(() => {
    let cancelled = false
    async function resolve() {
      try {
        const token = getStoredToken()
        const status = await getStatus(token)
        if (cancelled) return
        if (status.hasSession) {
          setAuthState({ phase: 'authed', needsSetup: false, username: status.username })
        } else {
          if (token) clearStoredToken()
          setAuthState({ phase: 'guest', needsSetup: !!status.needsSetup, username: null })
        }
      } catch {
        if (!cancelled) setAuthState({ phase: 'guest', needsSetup: false, username: null })
      }
    }
    resolve()
    return () => { cancelled = true }
  }, [])

  function handleLogin(user) {
    setAuthState({ phase: 'authed', needsSetup: false, username: user?.username || null })
  }

  async function handleLogout() {
    const token = getStoredToken()
    try {
      if (token) await authLogout(token)
    } catch (err) {
      console.error('[auth] logout failed', err)
    } finally {
      clearStoredToken()
      setAuthState({ phase: 'guest', needsSetup: false, username: null })
    }
  }

  useEffect(() => {
    if (authState.phase !== 'authed') return
    let ignored = false
    async function checkWelcome() {
      try {
        if (!window.electronAPI?.invoke) return
        const shown = await window.electronAPI.invoke('setup:get-welcome-shown')
        if (!ignored && !shown) setWelcomeOpen(true)
      } catch {
        // The renderer can still run in a browser-only dev session.
      }
    }
    const openWelcome = () => setWelcomeOpen(true)
    window.addEventListener('aionui:open-welcome', openWelcome)
    checkWelcome()

    const ipcCleanup = window.electronAPI?.on?.('app:show-welcome', () => {
      setWelcomeOpen(true)
    })

    return () => {
      ignored = true
      window.removeEventListener('aionui:open-welcome', openWelcome)
      ipcCleanup?.()
    }
  }, [authState.phase])

  async function handleMarkSeen(checked) {
    if (!checked) return
    try {
      await window.electronAPI?.invoke?.('setup:mark-welcome-shown')
    } catch {
      // Ignore in browser-only dev sessions.
    }
  }

  if (authState.phase === 'loading') return null  // brief blank frame; faster than a flash of login UI
  if (authState.phase !== 'authed') {
    return <AuthPage needsSetup={authState.needsSetup} onLogin={handleLogin} />
  }

  return (
    <>
      <Layout onLogout={handleLogout} username={authState.username} />
      <WelcomeSetupDialog open={welcomeOpen} onClose={() => setWelcomeOpen(false)} onMarkSeen={handleMarkSeen} />
    </>
  )
}
