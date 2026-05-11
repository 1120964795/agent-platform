import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Grid2X2, Globe2, Monitor, Paperclip, Plus, Send, Sparkles, Square } from 'lucide-react'
import { useCommand } from '../../hooks/useCommand.js'
import { listSkills } from '../../lib/api.js'
import CommandPalette from './CommandPalette.jsx'
import ModelSelector, { STORAGE_KEY } from './ModelSelector.jsx'

function insertPath(current, filePath) {
  const trimmed = current.trim()
  return `"${filePath}" ${trimmed}`.trim()
}

const PLUGIN_ITEMS = [
  { name: 'Documents' },
  { name: 'Spreadsheets' },
  { name: 'Presentations' },
  { name: '浏览器', description: 'Browser Use · openai/gpt-5.5', mode: 'browser' },
  { name: 'Computer Use', description: 'Desktop Use · openai/gpt-5.5', mode: 'desktop' },
  { name: 'superpowers' },
  { name: 'Superpowers' },
  { name: 'GitHub' },
]

export default function InputBar({ onSend, disabled, agentRunning, pendingConfirmation, onCancel, selectedModel, onModelChange, pluginMode, onPluginModeChange }) {
  const [text, setText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [pluginsOpen, setPluginsOpen] = useState(false)
  const [skills, setSkills] = useState([])
  const command = useCommand(skills)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleFileSelected(event) {
      const filePath = event.detail?.path
      if (filePath) setText((current) => insertPath(current, filePath))
    }
    window.addEventListener('agentdev:file-selected', handleFileSelected)
    return () => window.removeEventListener('agentdev:file-selected', handleFileSelected)
  }, [])

  useEffect(() => {
    let cancelled = false
    listSkills()
      .then((result) => {
        if (!cancelled) setSkills(result.skills || [])
      })
      .catch(() => {
        if (!cancelled) setSkills([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function handleClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
        setPluginsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleAttachFile() {
    const filePath = window.electronAPI?.selectFile
      ? await window.electronAPI.selectFile()
      : window.prompt('请输入文件的绝对路径：')
    if (filePath) setText((current) => insertPath(current, filePath))
    setMenuOpen(false)
    setPluginsOpen(false)
  }

  function handleModelChange(id) {
    localStorage.setItem(STORAGE_KEY, id)
    onPluginModeChange?.(null)
    onModelChange(id)
  }

  function handlePluginSelect(mode) {
    onPluginModeChange?.(mode)
    setMenuOpen(false)
    setPluginsOpen(false)
  }

  function handleSubmit(event) {
    event.preventDefault()
    const value = text.trim()
    if (!value || disabled) return
    onSend(value)
    setText('')
  }

  function handleKey(event) {
    if (command.handleKeyDown(event, (item) => {
      setText(`${item.label} `)
    })) return

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit(event)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-6 py-4">
      {pendingConfirmation && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="min-w-0 truncate">Waiting for confirmation: {pendingConfirmation.toolName}</span>
          <span className="shrink-0 text-amber-700">确认 / 可以 / 同意 / 继续</span>
        </div>
      )}
      <div className="flex items-end gap-3 bg-[color:var(--bg-primary)] border border-[color:var(--border)] rounded-md px-3 py-2 focus-within:border-[color:var(--accent)]">
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(open => !open)
              setPluginsOpen(false)
            }}
            className="h-8 w-8 flex items-center justify-center rounded-md text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-tertiary)]"
            aria-label="打开添加和插件菜单"
            title="添加"
          >
            <Plus size={16} />
          </button>
          {menuOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-64 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] shadow-lg z-50 p-2">
              <button type="button" onClick={handleAttachFile} className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-left hover:bg-[color:var(--bg-tertiary)]">
                <Paperclip size={16} className="text-[color:var(--text-muted)]" />
                <span>添加照片和文件</span>
              </button>
              <div className="my-2 h-px bg-[color:var(--border)]" />
              <button type="button" className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-left text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)]">
                <Grid2X2 size={16} />
                <span>计划模式</span>
              </button>
              <div className="my-2 h-px bg-[color:var(--border)]" />
              <button
                type="button"
                onMouseEnter={() => setPluginsOpen(true)}
                onClick={() => setPluginsOpen(open => !open)}
                className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-left hover:bg-[color:var(--bg-tertiary)]"
              >
                <Grid2X2 size={16} className="text-[color:var(--text-muted)]" />
                <span>插件</span>
                <ChevronRight size={16} className="ml-auto text-[color:var(--text-muted)]" />
              </button>
            </div>
          )}
          {menuOpen && pluginsOpen && (
            <div className="absolute bottom-full left-64 mb-2 ml-2 w-72 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] shadow-lg z-50 p-2">
              <div className="px-3 py-2 text-xs text-[color:var(--text-muted)]">{PLUGIN_ITEMS.length} 个已安装插件</div>
              {PLUGIN_ITEMS.map((plugin) => {
                const selected = plugin.mode && pluginMode === plugin.mode
                return (
                  <button
                    key={plugin.name}
                    type="button"
                    onClick={() => plugin.mode && handlePluginSelect(plugin.mode)}
                    className={`w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-left hover:bg-[color:var(--bg-tertiary)] ${selected ? 'bg-blue-50 text-[color:var(--text-primary)]' : ''}`}
                  >
                    {plugin.mode === 'browser'
                      ? <Globe2 size={16} className="text-[color:var(--accent)]" />
                      : (plugin.mode === 'desktop'
                        ? <Monitor size={16} className="text-[color:var(--accent)]" />
                        : <Sparkles size={16} className="text-[color:var(--text-muted)]" />)}
                    <span className="flex min-w-0 flex-col">
                      <span>{plugin.name}</span>
                      {plugin.description && <span className="truncate text-xs text-[color:var(--text-muted)]">{plugin.description}</span>}
                    </span>
                    {selected && <Check size={16} className="ml-auto text-[color:var(--success)]" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <ModelSelector value={selectedModel} onChange={handleModelChange} pluginMode={pluginMode} />
        <div className="relative flex-1">
          <CommandPalette
            matches={command.matches}
            index={command.index}
            onHover={command.setIndex}
            onSelect={(item) => {
              setText(`${item.label} `)
              command.close()
            }}
          />
          <textarea
            value={text}
            onChange={(event) => {
              const value = event.target.value
              setText(value)
              command.update(value)
            }}
            onKeyDown={handleKey}
            placeholder="输入消息或任务，Enter 发送，Shift+Enter 换行"
            aria-label="Type a message or /skill-name"
            rows={1}
            className="w-full resize-none bg-transparent outline-none text-sm max-h-40 py-1"
          />
        </div>
        {agentRunning && !pendingConfirmation ? (
          <button type="button" onClick={onCancel} className="h-8 w-8 flex items-center justify-center rounded-md bg-red-500 text-white hover:bg-red-600" aria-label="停止执行">
            <Square size={14} />
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
