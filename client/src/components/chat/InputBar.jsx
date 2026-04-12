import { useState } from 'react'
import { Send } from 'lucide-react'
import { useCommand } from '../../hooks/useCommand.js'
import CommandPalette from './CommandPalette.jsx'

export default function InputBar({ onSend, onCommand, disabled }) {
  const [text, setText] = useState('')
  const command = useCommand()

  function handleSelectCommand(cmd) {
    onCommand?.(cmd)
    setText('')
    command.close()
  }

  function handleChange(e) {
    const nextText = e.target.value
    setText(nextText)
    command.update(nextText)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (command.active && command.choose(handleSelectCommand)) return

    const v = text.trim()
    if (!v || disabled) return
    onSend(v)
    setText('')
    command.close()
  }

  function handleKey(e) {
    if (command.handleKeyDown(e, handleSelectCommand)) return

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-6 py-4">
      <div className="relative flex items-end gap-3 bg-[color:var(--bg-primary)] border border-[color:var(--border)] rounded-xl px-3 py-2 focus-within:border-[color:var(--accent)]">
        {command.active && (
          <CommandPalette
            matches={command.matches}
            index={command.index}
            onSelect={handleSelectCommand}
            onHover={command.setIndex}
          />
        )}
        <textarea
          value={text}
          onChange={handleChange}
          onKeyDown={handleKey}
          placeholder='发送消息，输入 "/" 触发命令面板，Shift+Enter 换行...'
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
