import { Activity, FileText, Octagon, Settings, ShieldCheck } from 'lucide-react'
import { emergencyStop } from '../../lib/api.js'

export default function TopBar({ title = 'New task', onOpenDrawer, executionMode = 'chat' }) {
  async function handleEmergencyStop() {
    try {
      await emergencyStop()
      window.dispatchEvent(new CustomEvent('aionui:actions-changed'))
    } catch (error) {
      console.error('[aionui] emergency stop failed:', error)
    }
  }

  return (
    <div className="h-14 px-6 flex items-center justify-between border-b border-[color:var(--border)] bg-[color:var(--bg-primary)]">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-[11px] text-[color:var(--text-muted)]">{executionMode === 'execute' ? 'Execute mode: Qwen plans, AionUi approves.' : 'Chat mode'}</div>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onOpenDrawer('control')} className="p-2 rounded hover:bg-[color:var(--bg-tertiary)]" aria-label="control center" title="Control Center">
          <Activity size={16} />
        </button>
        <button type="button" onClick={() => onOpenDrawer('runtime')} className="p-2 rounded hover:bg-[color:var(--bg-tertiary)]" aria-label="models and runtimes" title="Models and Runtimes">
          <ShieldCheck size={16} />
        </button>
        <button type="button" onClick={() => onOpenDrawer('outputs')} className="p-2 rounded hover:bg-[color:var(--bg-tertiary)]" aria-label="run outputs" title="Run Outputs">
          <FileText size={16} />
        </button>
        <button type="button" onClick={() => onOpenDrawer('settings')} className="p-2 rounded hover:bg-[color:var(--bg-tertiary)]" aria-label="settings" title="Settings">
          <Settings size={16} />
        </button>
        <button type="button" onClick={handleEmergencyStop} className="p-2 rounded text-[color:var(--error)] hover:bg-[color:var(--error)]/10" aria-label="emergency stop" title="Emergency stop">
          <Octagon size={16} />
        </button>
      </div>
    </div>
  )
}
