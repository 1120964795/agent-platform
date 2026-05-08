import { useChat } from '../../hooks/useChat.js'
import MessageList from './MessageList.jsx'
import InputBar from './InputBar.jsx'

export default function ChatArea({ conversationId, mode, onModeChange }) {
  const { messages, streaming, sendUserMessage, updateCard, addFileCard } = useChat(conversationId)

  function handleSend(text) {
    sendUserMessage(text, { mode })
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <MessageList messages={messages} onUpdateCard={updateCard} onFileGenerated={addFileCard} />
      <InputBar mode={mode} onModeChange={onModeChange} onSend={handleSend} disabled={streaming} />
    </div>
  )
}
