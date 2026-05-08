import { Activity, FileText, Plus, Settings, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react'

export default function Sidebar({ collapsed, onToggle, onOpenDrawer, onNewConversation }) {
  const width = collapsed ? 'w-[60px]' : 'w-[260px]'

  return (
    <aside className={`${width} transition-all duration-200 bg-[color:var(--bg-secondary)] border-r border-[color:var(--border)] flex flex-col`}>
      <div className="h-14 px-4 flex items-center justify-between border-b border-[color:var(--border)]">
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-semibold text-base leading-tight">AionUi</div>
            <div className="text-[11px] text-[color:var(--text-muted)] leading-tight">智能体控制台</div>
          </div>
        )}
        <button type="button" onClick={onToggle} className="p-1 rounded hover:bg-[color:var(--bg-tertiary)]" aria-label="折叠侧边栏" title="折叠侧边栏">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className="p-3">
        <button type="button" onClick={onNewConversation} className="w-full h-9 flex items-center justify-center gap-2 rounded-md bg-[color:var(--accent)] text-white text-sm hover:opacity-90">
          <Plus size={16} />
          {!collapsed && <span>新任务</span>}
        </button>
      </div>

      <div className="px-2 space-y-1">
        <button type="button" onClick={() => onOpenDrawer('control')} className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-[color:var(--bg-tertiary)]">
          <Activity size={16} />
          {!collapsed && <span>控制中心</span>}
        </button>
        <button type="button" onClick={() => onOpenDrawer('runtime')} className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-[color:var(--bg-tertiary)]">
          <ShieldCheck size={16} />
          {!collapsed && <span>模型与运行时</span>}
        </button>
        <button type="button" onClick={() => onOpenDrawer('outputs')} className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-[color:var(--bg-tertiary)]">
          <FileText size={16} />
          {!collapsed && <span>运行输出</span>}
        </button>
      </div>

      <div className="flex-1" />

      <div className="p-2 border-t border-[color:var(--border)] flex flex-col gap-1">
        <button type="button" onClick={() => onOpenDrawer('settings')} className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-[color:var(--bg-tertiary)]">
          <Settings size={16} />
          {!collapsed && <span>设置</span>}
        </button>
      </div>
    </aside>
  )
}
