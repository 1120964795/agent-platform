import { useEffect, useState } from 'react'
import { Send, Paperclip } from 'lucide-react'
import { useCommand } from '../../hooks/useCommand.js'
import { parseCommandLine } from '../../lib/commands.js'
import CommandPalette from './CommandPalette.jsx'

function usePermissionMode() {
  const [mode, setMode] = useState(() => localStorage.getItem('agentdev-permission-mode') || 'default')

  useEffect(() => {
    function handleChange(e) {
      setMode(e.detail?.mode || 'default')
    }
    window.addEventListener('agentdev:permission-changed', handleChange)
    return () => window.removeEventListener('agentdev:permission-changed', handleChange)
  }, [])

  return mode
}

export default function InputBar({ onSend, onCommand, disabled }) {
  const [text, setText] = useState('')
  const command = useCommand()
  const permissionMode = usePermissionMode()
  const isFull = permissionMode === 'full'

  // 监听文件浏览器的文件选择事件
  useEffect(() => {
    function handleFileSelected(e) {
      const filePath = e.detail?.path
      if (!filePath) return
      setText(current => {
        const trimmed = current.trim()
        if (trimmed.startsWith('/') && trimmed.includes(' ')) {
          const spaceIdx = trimmed.indexOf(' ')
          return `${trimmed.slice(0, spaceIdx + 1)}"${filePath}" ${trimmed.slice(spaceIdx + 1)}`
        }
        if (trimmed.startsWith('/')) {
          return `${trimmed} "${filePath}" `
        }
        return `"${filePath}" ${trimmed}`.trim()
      })
    }
    window.addEventListener('agentdev:file-selected', handleFileSelected)
    return () => window.removeEventListener('agentdev:file-selected', handleFileSelected)
  }, [])

  function handleSelectCommand(cmd) {
    setText(`/${cmd.id} `)
    command.close()
  }

  function handleChange(e) {
    const nextText = e.target.value
    setText(nextText)

    if (nextText.startsWith('/') && !nextText.includes(' ')) {
      command.update(nextText)
    } else {
      command.close()
    }
  }

  async function handleAttachFile() {
    let filePath = null
    if (window.electronAPI?.selectFile) {
      filePath = await window.electronAPI.selectFile()
    } else {
      filePath = window.prompt('输入文件绝对路径:')
    }
    if (filePath) {
      setText(current => {
        const trimmed = current.trim()
        if (trimmed.startsWith('/') && trimmed.includes(' ')) {
          const spaceIdx = trimmed.indexOf(' ')
          return `${trimmed.slice(0, spaceIdx + 1)}"${filePath}" ${trimmed.slice(spaceIdx + 1)}`
        }
        if (trimmed.startsWith('/')) {
          return `${trimmed} "${filePath}" `
        }
        return `"${filePath}" ${trimmed}`.trim()
      })
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (command.active && command.choose(handleSelectCommand)) return

    const v = text.trim()
    if (!v || disabled) return

    const parsed = parseCommandLine(v)
    if (parsed) {
      onCommand?.(parsed)
    } else {
      onSend(v)
    }
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
        {isFull && (
          <button
            type="button"
            onClick={handleAttachFile}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-tertiary)]"
            aria-label="附件"
            title="选择本地文件"
          >
            <Paperclip size={14} />
          </button>
        )}
        <textarea
          value={text}
          onChange={handleChange}
          onKeyDown={handleKey}
          placeholder={isFull
            ? '发送消息，"/" 触发命令，📎 选择文件，Shift+Enter 换行...'
            : '发送消息，"/" 触发命令，Shift+Enter 换行...'
          }
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
