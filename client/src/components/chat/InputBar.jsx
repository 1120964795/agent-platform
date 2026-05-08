import { useEffect, useState } from 'react'
import { MessageSquare, Paperclip, Play, Send } from 'lucide-react'

function insertPath(current, filePath) {
  const trimmed = current.trim()
  return `"${filePath}" ${trimmed}`.trim()
}

export default function InputBar({ mode = 'chat', onModeChange, onSend, disabled }) {
  const [text, setText] = useState('')

  useEffect(() => {
    function handleFileSelected(event) {
      const filePath = event.detail?.path
      if (filePath) setText((current) => insertPath(current, filePath))
    }
    window.addEventListener('agentdev:file-selected', handleFileSelected)
    return () => window.removeEventListener('agentdev:file-selected', handleFileSelected)
  }, [])

  async function handleAttachFile() {
    const filePath = window.electronAPI?.selectFile
      ? await window.electronAPI.selectFile()
      : window.prompt('Enter an absolute file path:')
    if (filePath) setText((current) => insertPath(current, filePath))
  }

  function handleSubmit(event) {
    event.preventDefault()
    const value = text.trim()
    if (!value || disabled) return
    onSend(value)
    setText('')
  }

  function handleKey(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit(event)
    }
  }

  const isExecute = mode === 'execute'

  return (
    <form onSubmit={handleSubmit} className="border-t border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-6 py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] p-1">
          <button type="button" onClick={() => onModeChange?.('chat')} className={`h-8 px-3 rounded text-sm inline-flex items-center gap-1 ${!isExecute ? 'bg-[color:var(--accent)] text-white' : 'text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)]'}`}>
            <MessageSquare size={14} /> Chat
          </button>
          <button type="button" onClick={() => onModeChange?.('execute')} className={`h-8 px-3 rounded text-sm inline-flex items-center gap-1 ${isExecute ? 'bg-[color:var(--accent)] text-white' : 'text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)]'}`}>
            <Play size={14} /> Execute
          </button>
        </div>
        <div className="text-xs text-[color:var(--text-muted)]">{isExecute ? 'Qwen plans. AionUi asks before risky actions.' : 'Plain chat. No action is executed from this input.'}</div>
      </div>
      <div className="flex items-end gap-3 bg-[color:var(--bg-primary)] border border-[color:var(--border)] rounded-md px-3 py-2 focus-within:border-[color:var(--accent)]">
        <button type="button" onClick={handleAttachFile} className="h-8 w-8 flex items-center justify-center rounded-md text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-tertiary)]" aria-label="Attach file" title="Attach local file path">
          <Paperclip size={14} />
        </button>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKey}
          placeholder={isExecute ? 'Describe the task AionUi should plan and broker.' : 'Send a message. Shift+Enter for newline.'}
          rows={1}
          className="flex-1 resize-none bg-transparent outline-none text-sm max-h-40 py-1"
        />
        <button type="submit" disabled={disabled || !text.trim()} className="h-8 w-8 flex items-center justify-center rounded-md bg-[color:var(--accent)] text-white disabled:opacity-40" aria-label="send">
          <Send size={14} />
        </button>
      </div>
    </form>
  )
}
