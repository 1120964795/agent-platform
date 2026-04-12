import { useState } from 'react'
import { Send, Paperclip } from 'lucide-react'
import { useCommand } from '../../hooks/useCommand.js'
import { parseCommandLine } from '../../lib/commands.js'
import CommandPalette from './CommandPalette.jsx'

export default function InputBar({ onSend, onCommand, disabled }) {
  const [text, setText] = useState('')
  const command = useCommand()

  function handleSelectCommand(cmd) {
    // 选中命令后，插入 "/word " 到输入框让用户继续输入参数
    setText(`/${cmd.id} `)
    command.close()
  }

  function handleChange(e) {
    const nextText = e.target.value
    setText(nextText)

    // 只在输入纯 /xxx 时显示 palette（没有空格说明还在选命令）
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
        // 如果已经有 /command 前缀，在命令后插入文件路径
        if (trimmed.startsWith('/') && trimmed.includes(' ')) {
          const spaceIdx = trimmed.indexOf(' ')
          return `${trimmed.slice(0, spaceIdx + 1)}"${filePath}" ${trimmed.slice(spaceIdx + 1)}`
        }
        if (trimmed.startsWith('/')) {
          return `${trimmed} "${filePath}" `
        }
        // 否则直接插入
        return `${trimmed} "${filePath}" `.trim()
      })
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (command.active && command.choose(handleSelectCommand)) return

    const v = text.trim()
    if (!v || disabled) return

    // 检测是否是 /word ... 或 /ppt ... 命令
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
        <button
          type="button"
          onClick={handleAttachFile}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-tertiary)]"
          aria-label="附件"
          title="选择本地文件"
        >
          <Paperclip size={14} />
        </button>
        <textarea
          value={text}
          onChange={handleChange}
          onKeyDown={handleKey}
          placeholder='发送消息，输入 "/" 触发命令（如 /word 写报告），Shift+Enter 换行...'
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
