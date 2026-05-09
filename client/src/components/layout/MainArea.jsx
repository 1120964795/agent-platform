import { useState } from 'react'
import TopBar from './TopBar.jsx'
import ChatArea from '../chat/ChatArea.jsx'

export default function MainArea({ conversationId, title, onOpenDrawer, onConversationUpdated }) {
  const [mode, setMode] = useState('chat')

  return (
    <main className="flex-1 flex flex-col min-w-0">
      <TopBar title={title || '新对话'} onOpenDrawer={onOpenDrawer} executionMode={mode} />
      <ChatArea conversationId={conversationId} mode={mode} onModeChange={setMode} onConversationUpdated={onConversationUpdated} />
    </main>
  )
}
