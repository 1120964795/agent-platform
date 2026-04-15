import { Settings, FolderOpen } from 'lucide-react'

export default function TopBar({ title = '新对话', onOpenDrawer }) {
  return (
    <div className="h-14 px-6 flex items-center justify-between border-b border-[color:var(--border)] bg-[color:var(--bg-primary)]">
      <div className="text-sm font-medium">{title}</div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpenDrawer('settings')}
          className="p-2 rounded hover:bg-[color:var(--bg-tertiary)]"
          aria-label="settings"
        >
          <Settings size={16} />
        </button>
        <button
          type="button"
          onClick={() => onOpenDrawer('artifacts')}
          className="p-2 rounded hover:bg-[color:var(--bg-tertiary)]"
          aria-label="artifacts"
        >
          <FolderOpen size={16} />
        </button>
      </div>
    </div>
  )
}
