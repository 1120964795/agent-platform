import { Check, Copy } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

function formatDuration(ms) {
  const safeMs = Math.max(0, Number(ms) || 0)
  if (safeMs < 1000) return '<1 秒'
  const seconds = Math.round(safeMs / 1000)
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const remain = seconds % 60
  return remain ? `${minutes} 分 ${remain} 秒` : `${minutes} 分`
}

function CopyButton({ text, light = false, compact = false }) {
  const [copied, setCopied] = useState(false)
  const copyText = String(text || '')

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(timer)
  }, [copied])

  async function handleCopy() {
    if (!copyText || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
    } catch (error) {
      console.error('[chat] 复制消息失败:', error)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!copyText}
      title={copied ? '已复制' : '复制'}
      aria-label={copied ? '已复制' : '复制消息'}
      className={`${compact ? 'h-7 w-7' : 'h-8 w-8'} inline-flex shrink-0 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-30 ${
        light
          ? 'text-white/80 hover:bg-white/15 hover:text-white'
          : 'text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)] hover:text-[color:var(--text-primary)]'
      }`}
    >
      {copied ? <Check size={compact ? 13 : 14} /> : <Copy size={compact ? 13 : 14} />}
    </button>
  )
}

function RunMetadata({ message, streaming }) {
  const [now, setNow] = useState(Date.now())
  const startedAt = message?.startedAt
  const finishedAt = message?.finishedAt
  const commandCount = message?.commandCount
  const hasRunMetadata = Boolean(startedAt) || typeof commandCount === 'number'

  useEffect(() => {
    if (!streaming || !startedAt) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [startedAt, streaming])

  const elapsedText = useMemo(() => {
    if (!startedAt) return null
    return formatDuration((streaming ? now : finishedAt || now) - startedAt)
  }, [finishedAt, now, startedAt, streaming])

  if (!hasRunMetadata) return null

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-5 text-[color:var(--text-muted)]">
      {streaming ? (
        <span className="chat-thinking-gradient font-medium">思考中</span>
      ) : (
        elapsedText && <span>已处理 {elapsedText}</span>
      )}
      {streaming && elapsedText && <span>已处理 {elapsedText}</span>}
      {typeof commandCount === 'number' && <span>已运行 {commandCount} 条命令</span>}
    </div>
  )
}

export default function MessageBubble({ message, role, content, streaming }) {
  const isUser = role === 'user'
  return (
    <div className={`group flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`relative max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
          isUser
            ? 'bg-[color:var(--accent)] text-white rounded-br-sm'
            : 'bg-[color:var(--bg-secondary)] text-[color:var(--text-primary)] rounded-bl-sm border border-[color:var(--border)]'
        }`}
      >
        <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
          <CopyButton text={content} light={isUser} />
        </div>
        <div className="min-h-5 pr-9 whitespace-pre-wrap break-words">
          {content}
          {streaming && content && <span className="inline-block h-4 w-1 bg-current ml-1 animate-pulse align-middle" />}
        </div>
        <RunMetadata message={message} streaming={streaming} />
      </div>
    </div>
  )
}
