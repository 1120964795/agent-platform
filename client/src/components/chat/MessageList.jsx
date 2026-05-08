import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble.jsx'
import ToolCard from './ToolCard.jsx'
import ShellCard from './ShellCard.jsx'
import SkillBadge from './SkillBadge.jsx'
import WordCard from '../cards/WordCard.jsx'
import PptCard from '../cards/PptCard.jsx'
import FileCard from '../cards/FileCard.jsx'
import ActionCard from '../actions/ActionCard.jsx'

export default function MessageList({ messages }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {messages.length === 0 && (
        <div className="h-full flex items-center justify-center text-[color:var(--text-muted)] text-sm text-center">
          直接描述你的问题或任务。普通聊天只回复内容，执行模式会先生成动作计划并请求必要确认。
        </div>
      )}
      {messages.map((message) => {
        if (message.role === 'user' || message.role === 'assistant') {
          return <MessageBubble key={message.id} role={message.role} content={message.content} streaming={message.streaming} />
        }
        if (message.role === 'tool') {
          return message.toolName === 'run_shell_command'
            ? <ShellCard key={message.id} message={message} />
            : <ToolCard key={message.id} message={message} />
        }
        if (message.role === 'skill') {
          return <SkillBadge key={message.id} name={message.skillName} />
        }
        if (message.role === 'actions') {
          return (
            <div key={message.id} className="my-3 max-w-[820px] space-y-2">
              <div className="text-xs font-medium uppercase text-[color:var(--text-muted)]">{message.title || '动作'}</div>
              {(message.actions || []).map((action) => <ActionCard key={action.id} action={action} compact={false} />)}
            </div>
          )
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
