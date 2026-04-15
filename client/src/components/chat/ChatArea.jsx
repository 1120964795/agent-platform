import { useChat } from '../../hooks/useChat.js'
import MessageList from './MessageList.jsx'
import InputBar from './InputBar.jsx'

export default function ChatArea({ conversationId }) {
  const { messages, streaming, sendUserMessage, sendCommand, updateCard, addFileCard } = useChat(conversationId)

  function handleCommand(parsed) {
    sendCommand(parsed)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <MessageList
        messages={messages}
        onUpdateCard={updateCard}
        onFileGenerated={addFileCard}
      />
      <InputBar onSend={sendUserMessage} onCommand={handleCommand} disabled={streaming} />
    </div>
  )
}
