import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble.jsx'
import WordCard from '../cards/WordCard.jsx'
import PptCard from '../cards/PptCard.jsx'
import FileCard from '../cards/FileCard.jsx'

export default function MessageList({ messages, onUpdateCard, onFileGenerated }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {messages.length === 0 && (
        <div className="h-full flex items-center justify-center text-[color:var(--text-muted)] text-sm">
          输入消息开始对话。输入 "/" 触发命令面板。
        </div>
      )}
      {messages.map(m => {
        if (m.role === 'user' || m.role === 'assistant') {
          return <MessageBubble key={m.id} role={m.role} content={m.content} streaming={m.streaming} />
        }
        if (m.role === 'card') {
          if (m.cardType === 'word') {
            return <WordCard key={m.id} msg={m} onUpdate={onUpdateCard} onFileGenerated={onFileGenerated} />
          }
          if (m.cardType === 'ppt') {
            return <PptCard key={m.id} msg={m} onUpdate={onUpdateCard} onFileGenerated={onFileGenerated} />
          }
          if (m.cardType === 'file') {
            return <FileCard key={m.id} artifact={m.cardData} />
          }
          return <div key={m.id} className="text-xs text-[color:var(--text-muted)] my-2">[card: {m.cardType}]</div>
        }
        return null
      })}
      <div ref={endRef} />
    </div>
  )
}
