import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble.jsx'

export default function MessageList({ messages }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {messages.length === 0 && (
        <div className="h-full flex items-center justify-center text-[color:var(--text-muted)] text-sm">
          输入消息开始对话。
        </div>
      )}
      {messages.map(m => {
        if (m.role === 'user' || m.role === 'assistant') {
          return <MessageBubble key={m.id} role={m.role} content={m.content} streaming={m.streaming} />
        }
        // cards 在 Day 1-4 补
        return <div key={m.id} className="text-xs text-[color:var(--text-muted)] my-2">[card: {m.cardType}]</div>
      })}
      <div ref={endRef} />
    </div>
  )
}
