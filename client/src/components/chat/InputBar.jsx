import { useEffect, useState } from 'react'
import { Paperclip, Send, Square } from 'lucide-react'

function permissionModeKey(username) {
  return `agentdev-permission-mode:${username || 'guest'}`
}

function usePermissionMode(currentUser) {
  const username = currentUser?.username || 'guest'
  const [mode, setMode] = useState(() => localStorage.getItem(permissionModeKey(username)) || 'default')

  useEffect(() => {
    setMode(localStorage.getItem(permissionModeKey(username)) || 'default')
  }, [username])

  useEffect(() => {
    function handleChange(event) {
      if (event.detail?.username && event.detail.username !== username) return
      setMode(event.detail?.mode || 'default')
    }
    window.addEventListener('agentdev:permission-changed', handleChange)
    return () => window.removeEventListener('agentdev:permission-changed', handleChange)
  }, [username])
  return mode
}

function insertPath(current, filePath) {
  const trimmed = current.trim()
  return `"${filePath}" ${trimmed}`.trim()
}

export default function InputBar({ onSend, onCancel, disabled, streaming, apiKeyMissing, currentUser }) {
  const [text, setText] = useState('')
  const permissionMode = usePermissionMode(currentUser)
  const isFull = permissionMode === 'full'

  useEffect(() => {
    function handleFileSelected(event) {
      const filePath = event.detail?.path
      if (filePath) setText((current) => insertPath(current, filePath))
    }
    window.addEventListener('agentdev:file-selected', handleFileSelected)
    return () => window.removeEventListener('agentdev:file-selected', handleFileSelected)
  }, [])

  function handleChange(event) {
    setText(event.target.value)
  }

  async function handleAttachFile() {
    const filePath = window.electronAPI?.selectFile
      ? await window.electronAPI.selectFile()
      : window.prompt('请输入文件的绝对路径：')
    if (filePath) setText((current) => insertPath(current, filePath))
  }

  function handleSubmit(event) {
    event.preventDefault()
    const value = text.trim()
    if (!value || disabled || streaming) return
    onSend(value)
    setText('')
  }

  function handleKey(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit(event)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-6 py-4">
      <div className="relative flex items-end gap-3 bg-[color:var(--bg-primary)] border border-[color:var(--border)] rounded-lg px-3 py-2 focus-within:border-[color:var(--accent)]">
        {isFull && (
          <button type="button" onClick={handleAttachFile} className="h-8 w-8 flex items-center justify-center rounded-md text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-tertiary)]" aria-label="附加文件" title="附加本地文件路径">
            <Paperclip size={14} />
          </button>
        )}
        <textarea
          value={text}
          onChange={handleChange}
          onKeyDown={handleKey}
          placeholder={apiKeyMissing ? '请先在设置中配置 DeepSeek API Key' : (isFull ? '直接描述任务，例如：总结 "D:\\docs\\paper.pdf" 或安装 uv。Shift+Enter 换行。' : '输入消息。Shift+Enter 换行。')}
          rows={1}
          disabled={apiKeyMissing}
          className="flex-1 resize-none bg-transparent outline-none text-sm max-h-40 py-1 disabled:cursor-not-allowed"
        />
        {streaming ? (
          <button
            type="button"
            onClick={onCancel}
            className="h-8 w-8 flex items-center justify-center rounded-md bg-[color:var(--error)] text-white"
            aria-label="停止生成"
            title="停止生成"
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button type="submit" disabled={disabled || !text.trim()} className="h-8 w-8 flex items-center justify-center rounded-md bg-[color:var(--accent)] text-white disabled:opacity-40" aria-label="发送">
            <Send size={14} />
          </button>
        )}
      </div>
    </form>
  )
}
