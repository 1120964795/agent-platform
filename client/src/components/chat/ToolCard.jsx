import { ChevronDown, ChevronRight, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useState } from 'react'

function StatusIcon({ status }) {
  if (status === 'running') return <Loader2 size={14} className="animate-spin text-[color:var(--accent)]" />
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

export default function ToolCard({ message }) {
  const [open, setOpen] = useState(message.toolStatus === 'error')
  const status = message.toolStatus || 'running'
  const logs = message.logs || []

  return (
    <div className="my-3 max-w-[820px] rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-secondary)] text-[color:var(--text-primary)]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <StatusIcon status={status} />
        <span className="text-sm font-medium">{message.toolName || 'tool'}</span>
        <span className="ml-auto text-xs text-[color:var(--text-muted)]">{status}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-[color:var(--border)] px-3 py-3">
          <JsonBlock label="args" value={message.args} />
          {logs.length > 0 && <JsonBlock label="logs" value={logs.map((item) => `[${item.stream}] ${item.chunk}`).join('')} />}
          <JsonBlock label="result" value={message.result} />
          <JsonBlock label="error" value={message.error} />
        </div>
      )}
    </div>
  )
}