import TopBar from './TopBar.jsx'
import ChatArea from '../chat/ChatArea.jsx'

export default function MainArea({ conversationId, onOpenDrawer, currentUser, onLogout }) {
  return (
    <main className="flex-1 flex flex-col min-w-0">
      <TopBar
        title="新对话"
        onOpenDrawer={onOpenDrawer}
        currentUser={currentUser}
        onLogout={onLogout}
      />
      <ChatArea conversationId={conversationId} currentUser={currentUser} />
    </main>
  )
}
