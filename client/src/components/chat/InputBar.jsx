import { useState } from 'react'
import { Send } from 'lucide-react'

export default function InputBar({ onSend, disabled }) {
  const [text, setText] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const v = text.trim()
    if (!v || disabled) return
    onSend(v)
    setText('')
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-6 py-4">
      <div className="flex items-end gap-3 bg-[color:var(--bg-primary)] border border-[color:var(--border)] rounded-xl px-3 py-2 focus-within:border-[color:var(--accent)]">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="发送消息，Shift+Enter 换行..."
          rows={1}
          className="flex-1 resize-none bg-transparent outline-none text-sm max-h-40 py-1"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="h-8 w-8 flex items-center justify-center rounded-lg bg-[color:var(--accent)] text-white disabled:opacity-40"
          aria-label="send"
        >
          <Send size={14} />
        </button>
      </div>
    </form>
  )
}
