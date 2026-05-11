export default function MessageBubble({ message, role, content, streaming, onRespondConfirmation }) {
  const isToolProgressStream = message?.type === 'tool_progress' || message?.type?.startsWith('tool_')

  if (message?.type === 'confirmation') {
    const disabled = message.confirmationStatus !== 'pending'
    return (
      <div className="flex justify-start mb-4">
        <div className="max-w-[75%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap break-words bg-[color:var(--bg-secondary)] text-[color:var(--text-primary)] rounded-bl-sm border border-[color:var(--border)]">
          <div>{content}</div>
          <div className="mt-3 flex gap-3">
            <button type="button" disabled={disabled} onClick={() => onRespondConfirmation?.(true)} className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent)] px-3 py-1 text-xs disabled:opacity-60">
              <span className="h-3 w-3 rounded-full border border-current" />
              确定
            </button>
            <button type="button" disabled={disabled} onClick={() => onRespondConfirmation?.(false)} className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] px-3 py-1 text-xs disabled:opacity-60">
              <span className="h-3 w-3 rounded-full border border-current" />
              取消
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (message?.stream && message.type === 'reasoning_summary') {
    return (
      <div className="mb-2 px-3 py-2 text-xs text-[color:var(--text-muted)]">
        {message.content}
      </div>
    )
  }

  if (message?.stream && isToolProgressStream) {
    return (
      <div className="mb-2 px-3 py-2 text-xs text-[color:var(--text-muted)]">
        <span className="font-medium text-[color:var(--text-primary)]">{message.tool}</span>
        <span className="ml-2">{message.content}</span>
      </div>
    )
  }

  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-[color:var(--accent)] text-white rounded-br-sm'
            : 'bg-[color:var(--bg-secondary)] text-[color:var(--text-primary)] rounded-bl-sm border border-[color:var(--border)]'
        }`}
      >
        {content}
        {streaming && <span className="inline-block w-1 h-4 bg-current ml-1 animate-pulse align-middle" />}
      </div>
    </div>
  )
}
