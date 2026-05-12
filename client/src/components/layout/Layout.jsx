import { useCallback, useState } from 'react'
import Sidebar from './Sidebar.jsx'
import MainArea from './MainArea.jsx'
import BridgeStatusBar from '../BridgeStatusBar.jsx'
import SettingsPage from '../../pages/SettingsPage.jsx'
import { useConversations } from '../../hooks/useConversations.js'

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

export default function Layout({ onLogout, username }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState('models')
  const [conversationId, setConversationId] = useState(getInitialConversationId)
  const { conversations, refresh, remove, rename } = useConversations()

  const openSettings = useCallback((initialTab = 'models') => {
    setSettingsInitialTab(initialTab)
    setSettingsOpen(true)
  }, [])

  const handleNewConversation = useCallback(() => {
    const next = createConversationId()
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, next)
    setConversationId(next)
    setTimeout(() => refresh(), 500)
  }, [refresh])

  const handleSelectConversation = useCallback((id) => {
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, id)
    setConversationId(id)
  }, [])

  const handleDelete = useCallback(async (id) => {
    await remove(id)
    if (id === conversationId) handleNewConversation()
  }, [conversationId, handleNewConversation, remove])

  return (
    <div className="flex flex-col h-full w-full bg-[color:var(--bg-primary)] text-[color:var(--text-primary)]">
      <div className="flex flex-1 min-h-0">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(v => !v)}
          onNewConversation={handleNewConversation}
          onSelectConversation={handleSelectConversation}
          activeConversationId={conversationId}
          conversations={conversations}
          onDelete={handleDelete}
          onRename={rename}
          onSearch={refresh}
          onOpenSettings={() => openSettings('models')}
          onLogout={onLogout}
          username={username}
        />
        <MainArea conversationId={conversationId} />
      </div>
      <BridgeStatusBar onNavigateToSettings={(initialTab) => openSettings(initialTab)} />
      {settingsOpen && <SettingsPage initialTab={settingsInitialTab} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
