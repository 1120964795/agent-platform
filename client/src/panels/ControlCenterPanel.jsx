import { Octagon, RefreshCw } from 'lucide-react'
import ActionCard from '../components/actions/ActionCard.jsx'
import { useActionQueue } from '../hooks/useActionQueue.js'

const SECTIONS = [
  ['pending', 'Pending approvals'],
  ['running', 'Running'],
  ['completed', 'Completed'],
  ['failed', 'Failed'],
  ['denied', 'Denied'],
  ['blocked', 'Blocked'],
  ['cancelled', 'Cancelled']
]

export default function ControlCenterPanel() {
  const { grouped, loading, error, refresh, approve, deny, stop } = useActionQueue()

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Control Center</h2>
          <p className="text-xs text-[color:var(--text-muted)]">Approve, deny, inspect, and stop brokered actions.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={refresh} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]" aria-label="refresh actions" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={stop} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--error)] text-[color:var(--error)] hover:bg-[color:var(--error)]/10" aria-label="emergency stop" title="Emergency stop">
            <Octagon size={14} />
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-[color:var(--error)]">{error}</div>}

      {SECTIONS.map(([key, label]) => (
        <section key={key} className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{label}</h3>
            <span className="text-xs text-[color:var(--text-muted)]">{grouped[key]?.length || 0}</span>
          </div>
          {(grouped[key] || []).length === 0 ? (
            <div className="rounded-md border border-dashed border-[color:var(--border)] p-3 text-center text-xs text-[color:var(--text-muted)]">No actions</div>
          ) : (
            <div className="space-y-2">
              {grouped[key].map((action) => <ActionCard key={action.id} action={action} onApprove={approve} onDeny={deny} compact={key !== 'pending'} />)}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
