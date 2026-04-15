import { useState } from 'react'
import Sidebar from './Sidebar.jsx'
import MainArea from './MainArea.jsx'
import RightDrawer from './RightDrawer.jsx'

const ACTIVE_CONVERSATION_KEY = 'agentdev-active-conversation-id'

function createConversationId() {
  if (window.crypto?.randomUUID) return `conv_${window.crypto.randomUUID()}`
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function getInitialConversationId() {
  const saved = localStorage.getItem(ACTIVE_CONVERSATION_KEY)
  if (saved) return saved
  const next = createConversationId()
  localStorage.setItem(ACTIVE_CONVERSATION_KEY, next)
  return next
}

export default function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(null)
  const [conversationId, setConversationId] = useState(getInitialConversationId)

  function handleNewConversation() {
    const next = createConversationId()
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, next)
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
      <MainArea conversationId={conversationId} onOpenDrawer={setDrawer} />
      <RightDrawer view={drawer} onClose={() => setDrawer(null)} />
    </div>
  )
}
