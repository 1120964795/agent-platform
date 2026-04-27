import TopBar from './TopBar.jsx'
import ChatArea from '../chat/ChatArea.jsx'

export default function MainArea({
  onOpenDrawer,
  currentUser,
  onLogout,
  conversationId,
  activeConversation,
  onConversationSaved
}) {
  return (
    <main className="flex-1 flex flex-col min-w-0">
      <TopBar
        title={activeConversation?.title || '新对话'}
        onOpenDrawer={onOpenDrawer}
        currentUser={currentUser}
        onLogout={onLogout}
      />
      <ChatArea
        currentUser={currentUser}
        assistant="general"
        conversationId={conversationId}
        onOpenDrawer={onOpenDrawer}
        onConversationSaved={onConversationSaved}
      />
    </main>
  )
}
