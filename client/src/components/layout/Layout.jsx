import { useCallback, useEffect, useMemo, useState } from 'react'
import Sidebar from './Sidebar.jsx'
import MainArea from './MainArea.jsx'
import RightDrawer from './RightDrawer.jsx'
import { api } from '../../lib/api.js'

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
  const [conversations, setConversations] = useState([])

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === conversationId),
    [conversations, conversationId]
  )

  const rememberActiveConversation = useCallback((id) => {
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, id)
    setConversationId(id)
  }, [])

  const mergeConversation = useCallback((conversation) => {
    if (!conversation?.id) return
    setConversations((current) => [
      conversation,
      ...current.filter((item) => item.id !== conversation.id)
    ])
  }, [])

  useEffect(() => {
    let ignored = false

    async function loadConversations() {
      try {
        const response = await api.get('/api/conversations')
        if (!ignored) setConversations(response.conversations || [])
      } catch (error) {
        if (!ignored) console.error('[layout] 加载会话列表失败:', error)
      }
    }

    loadConversations()
    return () => {
      ignored = true
    }
  }, [])

  async function handleNewConversation() {
    const next = createConversationId()
    const conversation = {
      id: next,
      title: '新对话',
      assistant: 'general',
      messages: []
    }

    rememberActiveConversation(next)
    mergeConversation(conversation)

    try {
      const response = await api.post('/api/conversations', conversation)
      mergeConversation(response.conversation)
    } catch (error) {
      console.error('[layout] 创建新对话失败:', error)
    }
  }

  return (
    <div className="flex h-full w-full bg-[color:var(--bg-primary)] text-[color:var(--text-primary)]">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(v => !v)}
        onOpenDrawer={setDrawer}
        onNewConversation={handleNewConversation}
        conversations={conversations}
        activeConversationId={conversationId}
        onSelectConversation={rememberActiveConversation}
      />
      <MainArea
        key={conversationId}
        conversationId={conversationId}
        title={activeConversation?.title || '新对话'}
        onOpenDrawer={setDrawer}
        onConversationUpdated={mergeConversation}
      />
      <RightDrawer view={drawer} onClose={() => setDrawer(null)} />
    </div>
  )
}
