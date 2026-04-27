import { useCallback, useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useChat } from '../../hooks/useChat.js'
import { getConfig } from '../../lib/api.js'
import MessageList from './MessageList.jsx'
import InputBar from './InputBar.jsx'

export default function ChatArea({
  currentUser,
  assistant = 'general',
  conversationId,
  onOpenDrawer,
  onConversationSaved
}) {
  const username = currentUser?.username || 'guest'
  const [apiKeyStatus, setApiKeyStatus] = useState('loading')
  const { messages, streaming, sendUserMessage, cancelStream, addCard, updateCard, addFileCard } = useChat({
    username: currentUser?.username,
    assistant,
    conversationId,
    onConversationSaved
  })

  const loadApiKeyStatus = useCallback(async () => {
    try {
      const result = await getConfig(username)
      setApiKeyStatus(result.config?.apiKey ? 'ready' : 'missing')
    } catch (error) {
      console.error('[chat] load api key status failed:', error)
      setApiKeyStatus('missing')
    }
  }, [username])

  useEffect(() => {
    loadApiKeyStatus()
  }, [loadApiKeyStatus])

  useEffect(() => {
    function handleConfigChanged(event) {
      if (event.detail?.username && event.detail.username !== username) return
      if (typeof event.detail?.apiKeyConfigured === 'boolean') {
        setApiKeyStatus(event.detail.apiKeyConfigured ? 'ready' : 'missing')
        return
      }
      loadApiKeyStatus()
    }

    window.addEventListener('agentdev:config-changed', handleConfigChanged)
    return () => window.removeEventListener('agentdev:config-changed', handleConfigChanged)
  }, [loadApiKeyStatus, username])

  const apiKeyMissing = apiKeyStatus === 'missing'
  const apiKeyUnavailable = apiKeyStatus !== 'ready'

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {apiKeyMissing && (
        <div className="mx-6 mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <KeyRound size={17} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">需要先配置 DeepSeek API Key</div>
            <div className="mt-1 text-xs leading-5 text-amber-800">
              配置完成后即可开始对话；Key 只保存在本机配置中。
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenDrawer?.('settings')}
            className="h-8 shrink-0 rounded-md bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700"
          >
            去设置
          </button>
        </div>
      )}
      <MessageList
        messages={messages}
        onUpdateCard={updateCard}
        onFileGenerated={addFileCard}
      />
      <InputBar
        onSend={sendUserMessage}
        onCancel={cancelStream}
        disabled={apiKeyUnavailable}
        streaming={streaming}
        apiKeyMissing={apiKeyMissing}
        currentUser={currentUser}
      />
    </div>
  )
}
