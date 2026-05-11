import { Check, ChevronDown, ChevronRight, CheckCircle2, Clock, Loader2, X, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

const STATUS_LABELS = {
  running: '执行中',
  error: '失败',
  ok: '成功',
  awaiting_approval: '等待审批'
}

function StatusIcon({ status }) {
  if (status === 'running') return <Loader2 size={14} className="animate-spin text-[color:var(--accent)]" />
  if (status === 'awaiting_approval') return <Clock size={14} className="text-yellow-500" />
  if (status === 'error') return <XCircle size={14} className="text-[color:var(--error)]" />
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

function shortSummary(message) {
  if (message.error?.message) return message.error.message
  if (message.result?.summary) return message.result.summary
  if (message.result?.final_url) return message.result.final_url
  if (typeof message.result === 'string') return message.result
  return ''
}

export default function ToolCard({ message, onApproveTool, onDenyTool }) {
  const [open, setOpen] = useState(message.toolStatus === 'error' || message.toolStatus === 'awaiting_approval')
  const status = message.toolStatus || 'running'
  const retry = message.retry
  const summary = shortSummary(message)
  const canDecide = status === 'awaiting_approval' && message.toolCallId && onApproveTool && onDenyTool

  useEffect(() => {
    if (status === 'awaiting_approval' || status === 'error') setOpen(true)
  }, [status])

  return (
    <div className="my-3 max-w-[820px] rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-secondary)] text-[color:var(--text-primary)]">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <StatusIcon status={status} />
        <span className="text-sm font-medium">兼容工具：{message.toolName || '工具'}</span>
        {summary && <span className="min-w-0 flex-1 truncate text-xs text-[color:var(--text-muted)]">{summary}</span>}
        <span className="ml-auto text-xs text-[color:var(--text-muted)]">{STATUS_LABELS[status] || status}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-[color:var(--border)] px-3 py-3">
          <JsonBlock label="参数" value={message.args} />
          {status === 'awaiting_approval' && message.decision && (
            <div className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
              风险等级：{message.decision.risk} · {message.decision.reason}
            </div>
          )}
          {retry && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              第 {retry.attempt} 次尝试 · 上次失败：{retry.previousError?.code || 'TOOL_ERROR'} · {retry.previousError?.message || '工具未返回有效结果。'}
            </div>
          )}
          <JsonBlock label="错误" value={message.error} />
          {canDecide && (
            <div className="flex gap-2">
              <button type="button" onClick={() => onApproveTool(message.toolCallId)} className="h-8 inline-flex items-center justify-center gap-1 rounded-md bg-green-600 px-3 text-sm font-medium text-white hover:bg-green-700">
                <Check size={14} /> 批准
              </button>
              <button type="button" onClick={() => onDenyTool(message.toolCallId)} className="h-8 inline-flex items-center justify-center gap-1 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)]">
                <X size={14} /> 拒绝
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
