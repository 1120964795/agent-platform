import { useEffect, useState } from 'react'
import Sidebar from './Sidebar.jsx'
import MainArea from './MainArea.jsx'
import RightDrawer from './RightDrawer.jsx'

export default function Layout({
  currentUser,
  onLogout,
  conversations,
  activeConversationId,
  activeConversation,
  onNewConversation,
  onSelectConversation,
  onConversationSaved
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(null)

  useEffect(() => {
    const unsubscribe = window.electronAPI?.on?.('app-menu:action', (payload = {}) => {
      switch (payload.action) {
        case 'new-chat':
          onNewConversation?.()
          setDrawer(null)
          break
        case 'open-settings':
          setDrawer('settings')
          break
        case 'open-files':
          setDrawer('files')
          break
        case 'open-artifacts':
          setDrawer('artifacts')
          break
        case 'toggle-sidebar':
          setSidebarCollapsed(value => !value)
          break
        case 'logout':
          onLogout?.()
          break
        default:
          break
      }
    })

    return () => unsubscribe?.()
  }, [onLogout, onNewConversation])

  return (
    <div className="flex h-full w-full bg-[color:var(--bg-primary)] text-[color:var(--text-primary)]">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(v => !v)}
        onOpenDrawer={setDrawer}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onNewConversation={onNewConversation}
        onSelectConversation={onSelectConversation}
      />
      <MainArea
        onOpenDrawer={setDrawer}
        currentUser={currentUser}
        onLogout={onLogout}
        conversationId={activeConversationId}
        activeConversation={activeConversation}
        onConversationSaved={onConversationSaved}
      />
      <RightDrawer view={drawer} onClose={() => setDrawer(null)} currentUser={currentUser} />
    </div>
  )
}
