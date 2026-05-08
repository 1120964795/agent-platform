import { useState } from 'react'
import TopBar from './TopBar.jsx'
import ChatArea from '../chat/ChatArea.jsx'

export default function MainArea({ conversationId, onOpenDrawer }) {
  const [mode, setMode] = useState('chat')

  return (
    <main className="flex-1 flex flex-col min-w-0">
      <TopBar title="新任务" onOpenDrawer={onOpenDrawer} executionMode={mode} />
      <ChatArea conversationId={conversationId} mode={mode} onModeChange={setMode} />
    </main>
  )
}
