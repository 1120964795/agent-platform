import { Activity, BookOpen, FolderOpen, FolderSearch, LogOut, Settings, UserCircle } from 'lucide-react'

export default function TopBar({ title = '新对话', onOpenDrawer, currentUser, onLogout }) {
  return (
    <div className="h-14 px-6 flex items-center justify-between border-b border-[color:var(--border)] bg-[color:var(--bg-primary)]">
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
          onClick={() => onOpenDrawer('projects')}
          className="p-2 rounded hover:bg-[color:var(--bg-tertiary)]"
          aria-label="项目"
          title="项目"
        >
          <FolderSearch size={16} />
        </button>
        <button
          type="button"
          onClick={() => onOpenDrawer('diagnostics')}
          className="p-2 rounded hover:bg-[color:var(--bg-tertiary)]"
          aria-label="诊断"
          title="诊断"
        >
          <Activity size={16} />
        </button>
        <button
          type="button"
          onClick={() => onOpenDrawer('experiences')}
          className="p-2 rounded hover:bg-[color:var(--bg-tertiary)]"
          aria-label="经验"
          title="经验"
        >
          <BookOpen size={16} />
        </button>
        <button
          type="button"
          onClick={() => onOpenDrawer('settings')}
          className="p-2 rounded hover:bg-[color:var(--bg-tertiary)]"
          aria-label="设置"
          title="设置"
        >
          <Settings size={16} />
        </button>
        <button
          type="button"
          onClick={() => onOpenDrawer('artifacts')}
          className="p-2 rounded hover:bg-[color:var(--bg-tertiary)]"
          aria-label="产物"
          title="产物"
        >
          <FolderOpen size={16} />
        </button>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="p-2 rounded text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)] hover:text-[color:var(--text-primary)]"
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
