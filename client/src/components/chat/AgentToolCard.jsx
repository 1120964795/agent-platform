import { ChevronDown, ChevronRight, ShieldAlert, Loader2, XCircle, CheckCircle2, Clock } from 'lucide-react'
import { useState } from 'react'

const STATUS_LABELS = {
  running: '执行中',
  error: '失败',
  ok: '成功',
  blocked: '已阻止',
  awaiting_approval: '等待审批'
}

function StatusIcon({ status }) {
  if (status === 'running') return <Loader2 size={14} className="animate-spin text-[color:var(--accent)]" />
  if (status === 'error') return <XCircle size={14} className="text-[color:var(--error)]" />
  if (status === 'blocked') return <ShieldAlert size={14} className="text-[color:var(--error)]" />
  if (status === 'awaiting_approval') return <Clock size={14} className="text-yellow-500" />
  return <CheckCircle2 size={14} className="text-[color:var(--success)]" />
}

function JsonBlock({ label, value }) {
  if (value == null) return null
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-[color:var(--text-muted)]">{label}</div>
      <pre className="max-h-48 overflow-auto rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words">
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

export default function AgentToolCard({ message }) {
  const [open, setOpen] = useState(message.toolStatus === 'error' || message.toolStatus === 'blocked')
  const status = message.toolStatus || 'running'

  return (
    <div className="my-3 max-w-[820px] rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-secondary)] text-[color:var(--text-primary)]">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <StatusIcon status={status} />
        <span className="text-sm font-medium">{message.toolName || '工具'}</span>
        <span className="ml-auto text-xs text-[color:var(--text-muted)]">{STATUS_LABELS[status] || status}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-[color:var(--border)] px-3 py-3">
          <JsonBlock label="参数" value={message.args} />
          {status === 'blocked' && message.reason && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
              原因：{message.reason}
            </div>
          )}
          {status === 'awaiting_approval' && message.decision && (
            <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
              风险等级：{message.decision.risk} — {message.decision.reason}
            </div>
          )}
          <JsonBlock label="结果" value={message.result} />
          <JsonBlock label="错误" value={message.error} />
        </div>
      )}
    </div>
  )
}
