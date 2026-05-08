import { Download, RefreshCw } from 'lucide-react'
import { useAuditLog } from '../hooks/useAuditLog.js'
import RiskBadge from '../components/actions/RiskBadge.jsx'

const PHASE_LABELS = {
  proposed: '已提议',
  approved: '已批准',
  denied: '已拒绝',
  started: '已开始',
  completed: '已完成',
  failed: '失败',
  blocked: '已阻止',
  cancelled: '已取消'
}

export default function LogsPanel() {
  const { events, filters, setFilters, loading, error, refresh, exportLogs } = useAuditLog()

  function update(name, value) {
    setFilters({ ...filters, [name]: value })
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">审计日志</h2>
          <p className="text-xs text-[color:var(--text-muted)]">经过脱敏的会话时间线和策略记录。</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={refresh} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]" aria-label="刷新日志" title="刷新">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={exportLogs} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]" aria-label="导出日志" title="导出">
            <Download size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input value={filters.text || ''} onChange={(event) => update('text', event.target.value)} placeholder="搜索日志" className="col-span-2 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm outline-none" />
        <select value={filters.risk || ''} onChange={(event) => update('risk', event.target.value)} className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-2 py-2 text-sm">
          <option value="">全部风险</option>
          <option value="low">低风险</option>
          <option value="medium">中风险</option>
          <option value="high">高风险</option>
          <option value="blocked">已阻止</option>
        </select>
        <select value={filters.phase || ''} onChange={(event) => update('phase', event.target.value)} className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-2 py-2 text-sm">
          <option value="">全部阶段</option>
          <option value="proposed">已提议</option>
          <option value="approved">已批准</option>
          <option value="denied">已拒绝</option>
          <option value="started">已开始</option>
          <option value="completed">已完成</option>
          <option value="failed">失败</option>
          <option value="blocked">已阻止</option>
          <option value="cancelled">已取消</option>
        </select>
      </div>

      {error && <div className="text-xs text-[color:var(--error)]">{error}</div>}

      <div className="space-y-2">
        {events.length === 0 && <div className="rounded-md border border-dashed border-[color:var(--border)] p-4 text-center text-xs text-[color:var(--text-muted)]">暂无审计事件</div>}
        {events.map((event) => (
          <div key={event.id} className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{PHASE_LABELS[event.phase] || '事件'} · {event.type || event.runtime}</div>
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
