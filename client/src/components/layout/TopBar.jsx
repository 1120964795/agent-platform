import { Octagon } from 'lucide-react'
import { emergencyStop } from '../../lib/api.js'

export default function TopBar({ title = '新任务' }) {
  async function handleEmergencyStop() {
    try {
      await emergencyStop()
      window.dispatchEvent(new CustomEvent('aionui:actions-changed'))
    } catch (error) {
      console.error('[aionui] 急停失败:', error)
    }
  }

  return (
    <div className="h-14 px-6 flex items-center justify-between border-b border-[color:var(--border)] bg-[color:var(--bg-primary)]">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-[11px] text-[color:var(--text-muted)]">统一对话工作台</div>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={handleEmergencyStop} className="p-2 rounded text-[color:var(--error)] hover:bg-[color:var(--error)]/10" aria-label="紧急停止" title="紧急停止">
          <Octagon size={16} />
        </button>
      </div>
    </div>
  )
}
