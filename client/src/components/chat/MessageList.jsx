import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble.jsx'
import ToolCard from './ToolCard.jsx'
import ShellCard from './ShellCard.jsx'
import SkillBadge from './SkillBadge.jsx'
import WordCard from '../cards/WordCard.jsx'
import PptCard from '../cards/PptCard.jsx'
import FileCard from '../cards/FileCard.jsx'
import DiagnosisCard from './DiagnosisCard.jsx'
import ExperienceCard from './ExperienceCard.jsx'

export default function MessageList({ messages, currentUser }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {messages.length === 0 && (
        <div className="flex h-full items-center justify-center text-center text-sm text-[color:var(--text-muted)]">
          直接描述你要做的事。开启完全权限后，可以使用本地文件、Shell 命令和技能工具。
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
        if (message.role === 'card') {
          if (message.cardType === 'word') return <WordCard key={message.id} msg={message} />
          if (message.cardType === 'ppt') return <PptCard key={message.id} msg={message} />
          if (message.cardType === 'file') return <FileCard key={message.id} artifact={message.cardData} />
          if (message.cardType === 'diagnosis') return <DiagnosisCard key={message.id} diagnosis={message.cardData?.diagnosis} currentUser={currentUser} />
          if (message.cardType === 'experience') return <ExperienceCard key={message.id} experience={message.cardData?.experience} compact />
          return <div key={message.id} className="my-2 text-xs text-[color:var(--text-muted)]">[card: {message.cardType}]</div>
        }
        return null
      })}
      <div ref={endRef} />
    </div>
  )
}
