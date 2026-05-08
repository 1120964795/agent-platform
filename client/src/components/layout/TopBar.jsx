import { Activity, FileText, Octagon, Settings, ShieldCheck } from 'lucide-react'
import { emergencyStop } from '../../lib/api.js'

export default function TopBar({ title = '新任务', onOpenDrawer, executionMode = 'chat' }) {
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
        <div className="text-[11px] text-[color:var(--text-muted)]">{executionMode === 'execute' ? '执行模式：Qwen 规划，AionUi 审批。' : '聊天模式'}</div>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onOpenDrawer('control')} className="p-2 rounded hover:bg-[color:var(--bg-tertiary)]" aria-label="控制中心" title="控制中心">
          <Activity size={16} />
        </button>
        <button type="button" onClick={() => onOpenDrawer('runtime')} className="p-2 rounded hover:bg-[color:var(--bg-tertiary)]" aria-label="模型与运行时" title="模型与运行时">
          <ShieldCheck size={16} />
        </button>
        <button type="button" onClick={() => onOpenDrawer('outputs')} className="p-2 rounded hover:bg-[color:var(--bg-tertiary)]" aria-label="运行输出" title="运行输出">
          <FileText size={16} />
        </button>
        <button type="button" onClick={() => onOpenDrawer('settings')} className="p-2 rounded hover:bg-[color:var(--bg-tertiary)]" aria-label="设置" title="设置">
          <Settings size={16} />
        </button>
        <button type="button" onClick={handleEmergencyStop} className="p-2 rounded text-[color:var(--error)] hover:bg-[color:var(--error)]/10" aria-label="紧急停止" title="紧急停止">
          <Octagon size={16} />
        </button>
      </div>
    </div>
  )
}
