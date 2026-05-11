import { useEffect, useState } from 'react'
import Layout from './components/layout/Layout.jsx'
import WelcomeSetupDialog from './components/WelcomeSetupDialog.jsx'

export default function App() {
  const [welcomeOpen, setWelcomeOpen] = useState(false)

  useEffect(() => {
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

    // Listen for main-process first-run welcome event
    const ipcCleanup = window.electronAPI?.on?.('app:show-welcome', () => {
      setWelcomeOpen(true)
    })

    return () => {
      ignored = true
      window.removeEventListener('aionui:open-welcome', openWelcome)
      ipcCleanup?.()
    }
  }, [])

  async function handleMarkSeen(checked) {
    if (!checked) return
    try {
      await window.electronAPI?.invoke?.('setup:mark-welcome-shown')
    } catch {
      // Ignore in browser-only dev sessions.
    }
  }

  return (
    <>
      <Layout />
      <WelcomeSetupDialog open={welcomeOpen} onClose={() => setWelcomeOpen(false)} onMarkSeen={handleMarkSeen} />
    </>
  )
}
