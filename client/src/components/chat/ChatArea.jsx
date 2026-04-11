import { useChat } from '../../hooks/useChat.js'
import MessageList from './MessageList.jsx'
import InputBar from './InputBar.jsx'

export default function ChatArea() {
  const { messages, streaming, sendUserMessage } = useChat()

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <MessageList messages={messages} />
      <InputBar onSend={sendUserMessage} disabled={streaming} />
    </div>
  )
}
