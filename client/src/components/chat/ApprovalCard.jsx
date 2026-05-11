import { ShieldAlert, ShieldCheck, X } from 'lucide-react'
import RiskBadge from '../actions/RiskBadge.jsx'

function JsonBlock({ label, value }) {
  if (value == null) return null
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-[color:var(--text-muted)]">{label}</div>
      <pre className="max-h-32 overflow-auto rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words">
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

export default function ApprovalCard({ call, decision, onApprove, onReject, onDeny }) {
  const reject = onReject || onDeny

  return (
    <div className="my-3 max-w-[820px] rounded-lg border-2 border-yellow-400 bg-yellow-50 text-[color:var(--text-primary)] animate-in">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-yellow-200">
        <ShieldAlert size={16} className="text-yellow-600" />
        <span className="text-sm font-semibold text-yellow-800">需要审批</span>
        {decision?.risk && <RiskBadge risk={decision.risk} />}
      </div>
      <div className="space-y-3 px-3 py-3">
        <div className="text-sm text-yellow-700">
          <strong>{call?.name || '工具'}</strong> — {decision?.reason || '需要用户确认'}
        </div>
        <JsonBlock label="参数" value={call?.args} />
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onApprove}
            className="inline-flex items-center gap-1 h-9 px-4 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
          >
            <ShieldCheck size={14} /> 批准
          </button>
          <button
            type="button"
            onClick={reject}
            className="inline-flex items-center gap-1 h-9 px-4 rounded-md bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            <X size={14} /> 拒绝
          </button>
        </div>
      </div>
    </div>
  )
}
