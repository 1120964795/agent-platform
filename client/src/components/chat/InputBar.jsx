import { useEffect, useState } from 'react'
import { Send, Paperclip } from 'lucide-react'
import { useCommand } from '../../hooks/useCommand.js'
import { parseCommandLine } from '../../lib/commands.js'
import CommandPalette from './CommandPalette.jsx'

function usePermissionMode() {
  const [mode, setMode] = useState(() => localStorage.getItem('agentdev-permission-mode') || 'default')
  useEffect(() => {
    function handleChange(event) {
      setMode(event.detail?.mode || 'default')
    }
    window.addEventListener('agentdev:permission-changed', handleChange)
    return () => window.removeEventListener('agentdev:permission-changed', handleChange)
  }, [])
  return mode
}

function insertPath(current, filePath) {
  const trimmed = current.trim()
  if (trimmed.startsWith('/') && trimmed.includes(' ')) {
    const spaceIdx = trimmed.indexOf(' ')
    return `${trimmed.slice(0, spaceIdx + 1)}"${filePath}" ${trimmed.slice(spaceIdx + 1)}`
  }
  if (trimmed.startsWith('/')) return `${trimmed} "${filePath}" `
  return `"${filePath}" ${trimmed}`.trim()
}

export default function InputBar({ onSend, onCommand, disabled }) {
  const [text, setText] = useState('')
  const command = useCommand()
  const permissionMode = usePermissionMode()
  const isFull = permissionMode === 'full'

  useEffect(() => {
    function handleFileSelected(event) {
      const filePath = event.detail?.path
      if (filePath) setText((current) => insertPath(current, filePath))
    }
    window.addEventListener('agentdev:file-selected', handleFileSelected)
    return () => window.removeEventListener('agentdev:file-selected', handleFileSelected)
  }, [])

  function handleSelectCommand(cmd) {
    setText(`/${cmd.id} `)
    command.close()
  }

  function handleChange(event) {
    const nextText = event.target.value
    setText(nextText)
    if (nextText.startsWith('/') && !nextText.includes(' ')) command.update(nextText)
    else command.close()
  }

  async function handleAttachFile() {
    const filePath = window.electronAPI?.selectFile
      ? await window.electronAPI.selectFile()
      : window.prompt('Enter an absolute file path:')
    if (filePath) setText((current) => insertPath(current, filePath))
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (command.active && command.choose(handleSelectCommand)) return
    const value = text.trim()
    if (!value || disabled) return
    const parsed = parseCommandLine(value)
    if (parsed) onCommand?.(parsed)
    else onSend(value)
    setText('')
    command.close()
  }

  function handleKey(event) {
    if (command.handleKeyDown(event, handleSelectCommand)) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit(event)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-6 py-4">
      <div className="relative flex items-end gap-3 bg-[color:var(--bg-primary)] border border-[color:var(--border)] rounded-lg px-3 py-2 focus-within:border-[color:var(--accent)]">
        {command.active && <CommandPalette matches={command.matches} index={command.index} onSelect={handleSelectCommand} onHover={command.setIndex} />}
        {isFull && (
          <button type="button" onClick={handleAttachFile} className="h-8 w-8 flex items-center justify-center rounded-md text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-tertiary)]" aria-label="Attach file" title="Attach local file path">
            <Paperclip size={14} />
          </button>
        )}
        <textarea
          value={text}
          onChange={handleChange}
          onKeyDown={handleKey}
          placeholder={isFull ? 'Describe the task naturally, e.g. summarize "D:\\docs\\paper.pdf" or install uv. Shift+Enter for newline.' : 'Send a message. Shift+Enter for newline.'}
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