import { Check, ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus, Search, Settings, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  if (day === today) return '今天'
  if (day === today - 24 * 60 * 60 * 1000) return '昨天'
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function titleOf(conversation) {
  return conversation.title || conversation.firstMessagePreview || '新聊天'
}

export default function Sidebar({
  collapsed,
  onToggle,
  onNewConversation,
  onSelectConversation,
  activeConversationId,
  conversations = [],
  onDelete,
  onRename,
  onSearch,
  onOpenSettings
}) {
  const [query, setQuery] = useState('')
  const [menuId, setMenuId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const width = collapsed ? 'w-[60px]' : 'w-[300px]'

  useEffect(() => {
    const timer = setTimeout(() => onSearch?.(query), 150)
    return () => clearTimeout(timer)
  }, [query, onSearch])

  const sorted = useMemo(() => conversations || [], [conversations])

  function startRename(conversation) {
    setMenuId(null)
    setDeletingId(null)
    setEditingId(conversation.id)
    setEditingTitle(titleOf(conversation))
  }

  async function confirmRename(id) {
    const title = editingTitle.trim()
    if (!title) return
    await onRename?.(id, title)
    setEditingId(null)
    setEditingTitle('')
  }

  async function confirmDelete(id) {
    await onDelete?.(id)
    setDeletingId(null)
    setMenuId(null)
  }

  return (
    <aside className={`${width} transition-all duration-200 bg-[color:var(--bg-secondary)] border-r border-[color:var(--border)] flex flex-col min-h-0`}>
      <div className="h-14 px-3 flex items-center justify-between border-b border-[color:var(--border)]">
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-semibold text-base leading-tight">AionUi</div>
            <div className="text-[11px] text-[color:var(--text-muted)] leading-tight">聊天历史</div>
          </div>
        )}
        {collapsed && <div className="h-8 w-8 rounded-md bg-[color:var(--accent)] text-white grid place-items-center font-semibold">A</div>}
        <button type="button" onClick={onToggle} className="p-1 rounded hover:bg-[color:var(--bg-tertiary)]" aria-label="折叠侧边栏" title="折叠侧边栏">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className="p-3 space-y-3">
        <button type="button" onClick={onNewConversation} className="w-full h-9 flex items-center justify-center gap-2 rounded-md bg-[color:var(--accent)] text-white text-sm hover:opacity-90" title="新聊天">
          <Plus size={16} />
          {!collapsed && <span>新聊天</span>}
        </button>

        {!collapsed ? (
          <label className="flex h-9 items-center gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-2 text-[color:var(--text-muted)] focus-within:border-[color:var(--accent)]">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索聊天"
              className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--text-primary)] outline-none"
            />
          </label>
        ) : (
          <button type="button" onClick={() => onToggle?.()} className="h-9 w-full grid place-items-center rounded-md hover:bg-[color:var(--bg-tertiary)]" aria-label="搜索聊天" title="搜索聊天">
            <Search size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
        {!collapsed && sorted.length === 0 && (
          <div className="rounded-md border border-dashed border-[color:var(--border)] px-3 py-6 text-center text-xs text-[color:var(--text-muted)]">
            暂无聊天
          </div>
        )}

        <div className="space-y-1">
          {sorted.map((conversation) => {
            const active = conversation.id === activeConversationId
            const editing = editingId === conversation.id
            const deleting = deletingId === conversation.id

            if (collapsed) {
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => onSelectConversation?.(conversation.id)}
                  className={`h-9 w-full rounded-md text-xs font-medium ${active ? 'bg-[color:var(--accent)] text-white' : 'hover:bg-[color:var(--bg-tertiary)]'}`}
                  title={titleOf(conversation)}
                >
                  {titleOf(conversation).slice(0, 1).toUpperCase()}
                </button>
              )
            }

            return (
              <div key={conversation.id} className={`group relative rounded-md border-l-2 ${active ? 'border-purple-500 bg-[color:var(--bg-tertiary)]' : 'border-transparent hover:bg-[color:var(--bg-tertiary)]'}`}>
                {editing ? (
                  <div className="flex items-center gap-1 p-2">
                    <input
                      value={editingTitle}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') confirmRename(conversation.id)
                        if (event.key === 'Escape') setEditingId(null)
                      }}
                      className="min-w-0 flex-1 rounded border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-2 py-1 text-sm outline-none focus:border-[color:var(--accent)]"
                      autoFocus
                    />
                    <button type="button" onClick={() => confirmRename(conversation.id)} className="p-1 rounded hover:bg-[color:var(--bg-primary)]" aria-label="确认重命名">
                      <Check size={14} />
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-[color:var(--bg-primary)]" aria-label="取消重命名">
                      <X size={14} />
                    </button>
                  </div>
                ) : deleting ? (
                  <div className="space-y-2 p-2">
                    <div className="text-xs font-medium text-[color:var(--error)]">永久删除？</div>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => confirmDelete(conversation.id)} className="h-7 flex-1 rounded bg-[color:var(--error)] text-xs text-white">确认删除</button>
                      <button type="button" onClick={() => setDeletingId(null)} className="h-7 flex-1 rounded border border-[color:var(--border)] text-xs hover:bg-[color:var(--bg-primary)]">取消</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button type="button" onClick={() => onSelectConversation?.(conversation.id)} className="block w-full p-2 pr-9 text-left">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 truncate text-sm font-medium">{titleOf(conversation)}</div>
                        <div className="text-[10px] text-[color:var(--text-muted)]">{formatTime(conversation.updatedAt)}</div>
                      </div>
                      {conversation.firstMessagePreview && <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">{conversation.firstMessagePreview}</div>}
                    </button>
                    <button type="button" onClick={() => setMenuId(menuId === conversation.id ? null : conversation.id)} className="absolute right-1 top-2 rounded p-1 opacity-0 hover:bg-[color:var(--bg-primary)] group-hover:opacity-100" aria-label="聊天操作">
                      <MoreHorizontal size={14} />
                    </button>
                    {menuId === conversation.id && (
                      <div className="absolute right-1 top-8 z-10 w-28 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] p-1 shadow-lg">
                        <button type="button" onClick={() => startRename(conversation)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-[color:var(--bg-tertiary)]">
                          <Pencil size={13} /> 重命名
                        </button>
                        <button type="button" onClick={() => { setMenuId(null); setDeletingId(conversation.id) }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-[color:var(--error)] hover:bg-[color:var(--bg-tertiary)]">
                          <Trash2 size={13} /> 删除
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="p-2 border-t border-[color:var(--border)]">
        <button type="button" onClick={onOpenSettings} className="w-full flex items-center justify-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-[color:var(--bg-tertiary)]" title="设置">
          <Settings size={16} />
          {!collapsed && <span>设置</span>}
        </button>
      </div>
    </aside>
  )
}
