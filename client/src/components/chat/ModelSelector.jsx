import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

const MODEL_OPTIONS = [
  { id: 'deepseek-chat', label: 'DeepSeek Chat', provider: 'deepseek' },
  { id: 'deepseek-coder', label: 'DeepSeek Coder', provider: 'deepseek' }
]

const BROWSER_USE_OPTION = {
  id: 'browser-use',
  label: 'Browser Use',
  provider: 'browser-use',
  model: 'openai/gpt-5.5',
}

const DESKTOP_USE_OPTION = {
  id: 'desktop-use',
  label: 'Desktop Use',
  provider: 'desktop-use',
  model: 'openai/gpt-5.5',
}

const SCHEDULE_OPTION = {
  id: 'scheduled-task',
  label: 'Scheduled Task',
  provider: 'scheduled-task',
  model: 'full trust',
}

const STORAGE_KEY = 'agentdev-selected-model'

function loadModel() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && MODEL_OPTIONS.find(o => o.id === saved)) return saved
  } catch {}
  return 'deepseek-chat'
}

export default function ModelSelector({ value, onChange, pluginMode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selected = pluginMode === 'browser'
    ? BROWSER_USE_OPTION
    : pluginMode === 'desktop'
      ? DESKTOP_USE_OPTION
      : pluginMode === 'schedule'
        ? SCHEDULE_OPTION
      : MODEL_OPTIONS.find(o => o.id === value) || MODEL_OPTIONS[0]
  const pluginActive = pluginMode === 'browser' || pluginMode === 'desktop' || pluginMode === 'schedule'

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`h-7 flex items-center gap-1 rounded-md border px-2 text-xs text-[color:var(--text-primary)] hover:bg-[color:var(--bg-tertiary)] whitespace-nowrap ${pluginActive ? 'border-blue-200 bg-blue-50' : 'border-[color:var(--border)] bg-[color:var(--bg-secondary)]'}`}
      >
        <span className="max-w-[100px] truncate">{selected.label}</span>
        {pluginActive && (
          <span className="max-w-[110px] truncate text-[color:var(--accent)]">{selected.model}</span>
        )}
        <ChevronDown size={12} className="text-[color:var(--text-muted)]" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-52 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] shadow-lg z-50 overflow-hidden">
          {MODEL_OPTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => { onChange(option.id); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-[color:var(--bg-tertiary)] ${option.id === value ? 'border-l-2 border-[color:var(--accent)] bg-[color:var(--bg-secondary)]' : 'border-l-2 border-transparent'}`}
            >
              <div className="font-medium text-[color:var(--text-primary)]">{option.label}</div>
              <div className="text-[color:var(--text-muted)] mt-0.5">{option.id}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export { MODEL_OPTIONS, STORAGE_KEY, SCHEDULE_OPTION, loadModel }
