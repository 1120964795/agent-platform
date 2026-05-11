import { useCallback, useEffect, useState } from 'react'
import { deleteConversation, listConversations, renameConversation } from '../lib/api.js'

export function useConversations() {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (search = '') => {
    setLoading(true)
    try {
      const result = await listConversations(search)
      setConversations(result.conversations || [])
    } catch (error) {
      console.error('[useConversations] 加载失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const remove = useCallback(async (id) => {
    await deleteConversation(id)
    setConversations(prev => prev.filter(c => c.id !== id))
  }, [])

  const rename = useCallback(async (id, title) => {
    const result = await renameConversation(id, title)
    const nextTitle = result.conversation?.title || title
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: nextTitle } : c))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const handler = () => refresh()
    window.addEventListener('agentdev:conversations-changed', handler)
    return () => window.removeEventListener('agentdev:conversations-changed', handler)
  }, [refresh])

  return { conversations, loading, refresh, remove, rename }
}
