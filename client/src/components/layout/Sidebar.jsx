import {
  MessageSquare,
  FileText,
  Presentation,
  BookOpen,
  CalendarClock,
  Settings,
  FolderOpen,
  Plus,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

const ASSISTANTS = [
  { id: 'general', name: '通用对话', icon: MessageSquare },
  { id: 'word', name: 'Word 助手', icon: FileText },
  { id: 'ppt', name: 'PPT 助手', icon: Presentation },
  { id: 'paper', name: '论文助手', icon: BookOpen },
  { id: 'schedule', name: '日程助手', icon: CalendarClock }
]

export default function Sidebar({ collapsed, onToggle, onOpenDrawer }) {
  const width = collapsed ? 'w-[60px]' : 'w-[260px]'

  return (
    <aside className={`${width} transition-all duration-200 bg-[color:var(--bg-secondary)] border-r border-[color:var(--border)] flex flex-col`}>
      <div className="h-14 px-4 flex items-center justify-between border-b border-[color:var(--border)]">
        {!collapsed && <span className="font-semibold text-base">AgentDev Lite</span>}
        <button
          type="button"
          onClick={onToggle}
          className="p-1 rounded hover:bg-[color:var(--bg-tertiary)]"
          aria-label="toggle sidebar"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className="p-3">
        <button
          type="button"
          className="w-full h-9 flex items-center justify-center gap-2 rounded-lg bg-[color:var(--accent)] text-white text-sm hover:opacity-90"
        >
          <Plus size={16} />
          {!collapsed && <span>新对话</span>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {!collapsed && <div className="px-2 py-1 text-xs text-[color:var(--text-muted)]">助手</div>}
        {ASSISTANTS.map(a => {
          const Icon = a.icon
          return (
            <button
              type="button"
              key={a.id}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-[color:var(--bg-tertiary)]"
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && <span className="truncate">{a.name}</span>}
            </button>
          )
        })}
      </div>

      <div className="p-2 border-t border-[color:var(--border)] flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onOpenDrawer('settings')}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-[color:var(--bg-tertiary)]"
        >
          <Settings size={16} />
          {!collapsed && <span>设置</span>}
        </button>
        <button
          type="button"
          onClick={() => onOpenDrawer('artifacts')}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-[color:var(--bg-tertiary)]"
        >
          <FolderOpen size={16} />
          {!collapsed && <span>产物</span>}
        </button>
      </div>
    </aside>
  )
}
