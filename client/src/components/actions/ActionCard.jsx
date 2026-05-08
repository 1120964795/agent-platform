import { Check, X } from 'lucide-react'
import RiskBadge from './RiskBadge.jsx'

const STATUS_LABELS = {
  proposed: '已提议',
  pending: '待审批',
  approved: '已批准',
  denied: '已拒绝',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  blocked: '已阻止',
  cancelled: '已取消'
}

function payloadText(payload) {
  if (!payload || Object.keys(payload).length === 0) return ''
  return JSON.stringify(payload, null, 2)
}

export default function ActionCard({ action, onApprove, onDeny, compact = false }) {
  const canDecide = action.status === 'pending' && onApprove && onDeny
  return (
    <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{action.title || action.type}</div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">{action.runtime} · {action.type} · {STATUS_LABELS[action.status] || action.status}</div>
        </div>
        <RiskBadge risk={action.risk} />
      </div>
      {action.summary && <p className="mt-2 text-xs text-[color:var(--text-muted)]">{action.summary}</p>}
      {!compact && payloadText(action.payload) && (
        <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-[color:var(--bg-primary)] border border-[color:var(--border)] p-2 text-[11px] whitespace-pre-wrap break-words">{payloadText(action.payload)}</pre>
      )}
      {action.blockedReason && <div className="mt-2 text-xs text-[color:var(--error)]">{action.blockedReason}</div>}
      {action.error?.message && <div className="mt-2 text-xs text-[color:var(--error)]">{action.error.message}</div>}
      {canDecide && (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => onApprove(action.id)} className="h-8 flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-[color:var(--accent)] text-white text-sm">
            <Check size={14} /> 批准
          </button>
          <button type="button" onClick={() => onDeny(action.id)} className="h-8 flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-[color:var(--border)] text-sm hover:bg-[color:var(--bg-tertiary)]">
            <X size={14} /> 拒绝
          </button>
        </div>
      )}
    </div>
  )
}
