import { useEffect, useState } from 'react'
import Sidebar from './Sidebar.jsx'
import MainArea from './MainArea.jsx'
import RightDrawer from './RightDrawer.jsx'

const ACTIVE_CONVERSATION_KEY = 'agentdev-active-conversation-id'

function conversationStorageKey(username) {
  return `${ACTIVE_CONVERSATION_KEY}:${username || 'guest'}`
}

function createConversationId(username) {
  if (window.crypto?.randomUUID) return `conv_${window.crypto.randomUUID()}`
  const userKey = encodeURIComponent(username || 'guest')
  return `conv_${userKey}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function getInitialConversationId(username) {
  const key = conversationStorageKey(username)
  const saved = localStorage.getItem(key)
  if (saved) return saved
  const next = createConversationId(username)
  localStorage.setItem(key, next)
  return next
}

export default function Layout({ currentUser, onLogout }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(null)
  const [conversationId, setConversationId] = useState(() => getInitialConversationId(currentUser?.username))

  useEffect(() => {
    setConversationId(getInitialConversationId(currentUser?.username))
  }, [currentUser?.username])

  function handleNewConversation() {
    const next = createConversationId(currentUser?.username)
    localStorage.setItem(conversationStorageKey(currentUser?.username), next)
    setConversationId(next)
  }

  return (
    <div className="flex h-full w-full bg-[color:var(--bg-primary)] text-[color:var(--text-primary)]">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(v => !v)}
        onOpenDrawer={setDrawer}
        onNewConversation={handleNewConversation}
      />
      <MainArea
        conversationId={conversationId}
        onOpenDrawer={setDrawer}
        currentUser={currentUser}
        onLogout={onLogout}
      />
      <RightDrawer view={drawer} onClose={() => setDrawer(null)} currentUser={currentUser} />
    </div>
  )
}
