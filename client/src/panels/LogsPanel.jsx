import { Download, RefreshCw } from 'lucide-react'
import { useAuditLog } from '../hooks/useAuditLog.js'
import RiskBadge from '../components/actions/RiskBadge.jsx'

export default function LogsPanel() {
  const { events, filters, setFilters, loading, error, refresh, exportLogs } = useAuditLog()

  function update(name, value) {
    setFilters({ ...filters, [name]: value })
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Audit Logs</h2>
          <p className="text-xs text-[color:var(--text-muted)]">Sanitized session timeline and policy history.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={refresh} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]" aria-label="refresh logs" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={exportLogs} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]" aria-label="export logs" title="Export">
            <Download size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input value={filters.text || ''} onChange={(event) => update('text', event.target.value)} placeholder="Search" className="col-span-2 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm outline-none" />
        <select value={filters.risk || ''} onChange={(event) => update('risk', event.target.value)} className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-2 py-2 text-sm">
          <option value="">Any risk</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="blocked">Blocked</option>
        </select>
        <select value={filters.phase || ''} onChange={(event) => update('phase', event.target.value)} className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-2 py-2 text-sm">
          <option value="">Any phase</option>
          <option value="proposed">Proposed</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
          <option value="started">Started</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="blocked">Blocked</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {error && <div className="text-xs text-[color:var(--error)]">{error}</div>}

      <div className="space-y-2">
        {events.length === 0 && <div className="rounded-md border border-dashed border-[color:var(--border)] p-4 text-center text-xs text-[color:var(--text-muted)]">No audit events</div>}
        {events.map((event) => (
          <div key={event.id} className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{event.phase || 'event'} · {event.type || event.runtime}</div>
              <RiskBadge risk={event.risk || 'low'} />
            </div>
            <div className="mt-1 text-xs text-[color:var(--text-muted)]">{event.createdAt}</div>
            <div className="mt-2 text-xs">{event.summary}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
