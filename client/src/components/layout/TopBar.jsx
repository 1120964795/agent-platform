import { Activity, BookOpen, FolderOpen, FolderSearch, LogOut, Settings, UserCircle } from 'lucide-react'

function statusTone(status) {
  if (status === 'running') return 'bg-emerald-500'
  if (status === 'paused') return 'bg-amber-500'
  if (status === 'stopped') return 'bg-slate-300'
  return 'bg-slate-300'
}

export default function TopBar({ title = '新对话', onOpenDrawer, currentUser, onLogout, diagnosticsState }) {
  const sessionStatus = diagnosticsState?.status?.session?.status || 'stopped'

  return (
    <div className="flex h-14 items-center justify-between border-b border-[color:var(--border)] bg-[color:var(--bg-primary)] px-6">
      <div className="text-sm font-medium">{title}</div>
      <div className="flex items-center gap-2">
        {currentUser?.username && (
          <div
            className="hidden max-w-[180px] items-center gap-2 rounded-md bg-[color:var(--bg-secondary)] px-2.5 py-1.5 text-sm text-[color:var(--text-muted)] sm:flex"
            title={currentUser.username}
          >
            <UserCircle size={16} className="shrink-0" />
            <span className="truncate">{currentUser.username}</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => onOpenDrawer?.('projects')}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          aria-label="项目助手"
          title="项目助手"
        >
          <span className="inline-flex items-center gap-2">
            <FolderSearch size={14} />
            项目
          </span>
        </button>
        <button
          type="button"
          onClick={() => onOpenDrawer?.('diagnostics')}
          className="relative rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          aria-label="伴随诊断"
          title={`伴随诊断: ${sessionStatus}`}
        >
          <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ${statusTone(sessionStatus)}`} />
          <span className="inline-flex items-center gap-2">
            <Activity size={14} />
            诊断
          </span>
        </button>
        <button
          type="button"
          onClick={() => onOpenDrawer?.('experiences')}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            aria-label="经验库"
            title="经验库"
          >
            <span className="inline-flex items-center gap-2">
              <BookOpen size={14} />
              经验
            </span>
          </button>
        <button
          type="button"
          onClick={() => onOpenDrawer?.('settings')}
          className="rounded p-2 hover:bg-[color:var(--bg-tertiary)]"
          aria-label="设置"
          title="设置"
        >
          <Settings size={16} />
        </button>
        <button
          type="button"
          onClick={() => onOpenDrawer?.('artifacts')}
          className="rounded p-2 hover:bg-[color:var(--bg-tertiary)]"
          aria-label="产物"
          title="产物"
        >
          <FolderOpen size={16} />
        </button>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="rounded p-2 text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)] hover:text-[color:var(--text-primary)]"
            aria-label="退出登录"
            title="退出登录"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
