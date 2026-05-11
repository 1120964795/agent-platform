import TopBar from './TopBar.jsx'
import ChatArea from '../chat/ChatArea.jsx'

export default function MainArea({ conversationId }) {
  return (
    <main className="flex-1 flex flex-col min-w-0">
      <TopBar title="新任务" />
      <ChatArea conversationId={conversationId} />
    </main>
  )
}
