import { Activity, FileText, MessageSquare, Plus, Settings, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react'

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export default function Sidebar({
  collapsed,
  onToggle,
  onOpenDrawer,
  onNewConversation,
  conversations = [],
  activeConversationId,
  onSelectConversation
}) {
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
          {!collapsed && <span>新对话</span>}
        </button>
      </div>

      {!collapsed && (
        <div className="px-2 pb-3">
          <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wide text-[color:var(--text-muted)]">会话</div>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {conversations.length === 0 && (
              <div className="px-2 py-2 text-xs text-[color:var(--text-muted)]">发送第一条消息后会保存在这里。</div>
            )}
            {conversations.map((conversation) => {
              const active = conversation.id === activeConversationId
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => onSelectConversation?.(conversation.id)}
                  className={`w-full rounded-md px-2 py-2 text-left text-sm ${active ? 'bg-[color:var(--bg-tertiary)] text-[color:var(--text-primary)]' : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-tertiary)]'}`}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare size={14} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{conversation.title || '新对话'}</span>
                    <span className="shrink-0 text-[10px] text-[color:var(--text-muted)]">{formatTime(conversation.updatedAt || conversation.createdAt)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

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
