import { useChat } from '../../hooks/useChat.js'
import MessageList from './MessageList.jsx'
import InputBar from './InputBar.jsx'

export default function ChatArea() {
  const { messages, streaming, sendUserMessage, addCard, updateCard, addFileCard } = useChat()

  function handleCommand(cmd) {
    addCard(cmd.cardType)
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
