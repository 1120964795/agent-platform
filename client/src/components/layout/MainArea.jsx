import TopBar from './TopBar.jsx'
import ChatArea from '../chat/ChatArea.jsx'

export default function MainArea({
  onOpenDrawer,
  currentUser,
  onLogout,
  conversationId,
  activeConversation,
  onConversationSaved,
  diagnosticsState
}) {
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <TopBar
        title={activeConversation?.title || '新对话'}
        onOpenDrawer={onOpenDrawer}
        currentUser={currentUser}
        onLogout={onLogout}
        diagnosticsState={diagnosticsState}
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
