import { Play, RefreshCw, Square, Wrench } from 'lucide-react'
import SetupGuide from './SetupGuide.jsx'

const STATE_LABELS = {
  ready: 'Ready',
  configured: 'Configured',
  'needs-configuration': 'Needs configuration',
  'not-installed': 'Not installed',
  'not-configured': 'Not configured',
  disabled: 'Disabled',
  error: 'Error'
}

function stateClass(state) {
  if (state === 'ready' || state === 'configured') return 'border-[color:var(--success)] text-[color:var(--success)]'
  if (state === 'disabled' || state === 'not-installed' || state === 'not-configured') return 'border-[color:var(--border)] text-[color:var(--text-muted)]'
  return 'border-[color:var(--error)] text-[color:var(--error)]'
}

export default function RuntimeCard({ runtime, onBootstrap, onStart, onStop }) {
  const label = STATE_LABELS[runtime.state] || runtime.state || 'Unknown'
  return (
    <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{runtime.runtime}</div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)] truncate">{runtime.model || runtime.endpoint || runtime.command || runtime.baseUrl || 'Local capability'}</div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${stateClass(runtime.state)}`}>{label}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => onBootstrap(runtime.runtime)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]" aria-label={`repair ${runtime.runtime}`} title="Setup or repair">
          <Wrench size={14} />
        </button>
        <button type="button" onClick={() => onStart(runtime.runtime)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]" aria-label={`start ${runtime.runtime}`} title="Start">
          <Play size={14} />
        </button>
        <button type="button" onClick={() => onStop(runtime.runtime)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]" aria-label={`stop ${runtime.runtime}`} title="Stop">
          <Square size={14} />
        </button>
        <button type="button" onClick={() => onBootstrap(runtime.runtime)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]" aria-label={`refresh ${runtime.runtime}`} title="Refresh guidance">
          <RefreshCw size={14} />
        </button>
      </div>

      <SetupGuide guidance={runtime.guidance} />
    </div>
  )
}
