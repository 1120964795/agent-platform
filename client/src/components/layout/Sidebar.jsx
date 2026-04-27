import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  MessageSquare,
  Plus,
  Settings
} from 'lucide-react'

function formatConversationTime(value) {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit'
  })
}

export default function Sidebar({
  collapsed,
  onToggle,
  onOpenDrawer,
  conversations = [],
  activeConversationId,
  onNewConversation,
  onSelectConversation
}) {
  const width = collapsed ? 'w-[60px]' : 'w-[280px]'

  return (
    <aside className={`${width} transition-all duration-200 bg-[color:var(--bg-secondary)] border-r border-[color:var(--border)] flex flex-col`}>
      <div className="h-14 px-4 flex items-center justify-between border-b border-[color:var(--border)]">
        {!collapsed && <span className="font-semibold text-base">AgentDev Lite</span>}
        <button
          type="button"
          onClick={onToggle}
          className="p-1 rounded hover:bg-[color:var(--bg-tertiary)]"
          aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className="p-3">
        <button
          type="button"
          onClick={onNewConversation}
          className="w-full h-9 flex items-center justify-center gap-2 rounded-md bg-[color:var(--accent)] text-white text-sm font-medium hover:opacity-90"
          title="新对话"
        >
          <Plus size={16} />
          {!collapsed && <span>新对话</span>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {!collapsed && (
          <div className="px-2 pb-2 text-xs font-medium text-[color:var(--text-muted)]">
            历史对话
          </div>
        )}

        {conversations.length === 0 && !collapsed && (
          <div className="mx-2 rounded-md border border-dashed border-[color:var(--border)] px-3 py-4 text-center text-xs text-[color:var(--text-muted)]">
            暂无历史对话
          </div>
        )}

        <div className="flex flex-col gap-1">
          {conversations.map(conversation => {
            const selected = conversation.id === activeConversationId

            return (
              <button
                type="button"
                key={conversation.id}
                onClick={() => onSelectConversation?.(conversation.id)}
                className={`w-full flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${
                  selected
                    ? 'bg-[color:var(--bg-tertiary)] text-[color:var(--accent)] font-medium'
                    : 'text-[color:var(--text-primary)] hover:bg-[color:var(--bg-tertiary)]'
                }`}
                title={conversation.title || '新对话'}
              >
                <MessageSquare size={16} className="shrink-0" />
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate">
                      {conversation.title || '新对话'}
                    </span>
                    <span className="shrink-0 text-xs font-normal text-[color:var(--text-muted)]">
                      {formatConversationTime(conversation.updatedAt || conversation.createdAt)}
                    </span>
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="p-2 border-t border-[color:var(--border)] flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onOpenDrawer('settings')}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-[color:var(--bg-tertiary)]"
          title="设置"
        >
          <Settings size={16} />
          {!collapsed && <span>设置</span>}
        </button>
        <button
          type="button"
          onClick={() => onOpenDrawer('artifacts')}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-[color:var(--bg-tertiary)]"
          title="产物"
        >
          <FolderOpen size={16} />
          {!collapsed && <span>产物</span>}
        </button>
      </div>
    </aside>
  )
}
