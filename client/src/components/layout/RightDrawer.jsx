import { X } from 'lucide-react'
import SettingsPanel from '../../panels/SettingsPanel.jsx'

export default function RightDrawer({ view, onClose }) {
  if (!view) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-10" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-[360px] bg-[color:var(--bg-primary)] border-l border-[color:var(--border)] z-20 shadow-xl overflow-y-auto">
        <div className="h-14 px-4 flex items-center justify-between border-b border-[color:var(--border)]">
          <span className="font-medium">{view === 'settings' ? '设置' : '产物'}</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[color:var(--bg-tertiary)]"
            aria-label="close drawer"
          >
            <X size={16} />
          </button>
        </div>
        {view === 'settings' && <SettingsPanel />}
        {view === 'artifacts' && <div className="p-6 text-sm text-[color:var(--text-muted)]">（Task 1.8 实现）</div>}
      </aside>
    </>
  )
}
