import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble.jsx'
import SkillBadge from './SkillBadge.jsx'
import WordCard from '../cards/WordCard.jsx'
import PptCard from '../cards/PptCard.jsx'
import FileCard from '../cards/FileCard.jsx'

export default function MessageList({ messages, onRespondConfirmation, onRespondScheduleDraft }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {messages.length === 0 && (
        <div className="h-full flex items-center justify-center text-[color:var(--text-muted)] text-sm text-center">
          从一个问题或任务开始。
        </div>
      )}
      {messages.map((message) => {
        if (message.role === 'user' || message.role === 'assistant') {
          return <MessageBubble key={message.id} message={message} role={message.role} content={message.content} streaming={message.streaming} onRespondConfirmation={onRespondConfirmation} onRespondScheduleDraft={onRespondScheduleDraft} />
        }
        if (message.role === 'skill') {
          return <SkillBadge key={message.id} name={message.skillName} />
        }
        if (message.role === 'card') {
          if (message.cardType === 'word') return <WordCard key={message.id} msg={message} />
          if (message.cardType === 'ppt') return <PptCard key={message.id} msg={message} />
          if (message.cardType === 'file') return <FileCard key={message.id} artifact={message.cardData} />
          return <div key={message.id} className="text-xs text-[color:var(--text-muted)] my-2">[卡片：{message.cardType}]</div>
        }
        return null
      })}
      <div ref={endRef} />
    </div>
  )
}
