import { RefreshCw } from 'lucide-react'
import RuntimeCard from '../components/runtime/RuntimeCard.jsx'
import { useRuntimeStatus } from '../hooks/useRuntimeStatus.js'

export default function RuntimeStatusPanel() {
  const { runtimes, loading, error, refresh, bootstrap, start, stop } = useRuntimeStatus()

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Models and Runtimes</h2>
          <p className="text-xs text-[color:var(--text-muted)]">Qwen plans. Open Interpreter and UI-TARS execute only through AionUi policy.</p>
        </div>
        <button type="button" onClick={refresh} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]" aria-label="refresh runtimes" title="Refresh">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <div className="text-xs text-[color:var(--error)]">{error}</div>}

      <div className="space-y-3">
        {runtimes.map((runtime) => (
          <RuntimeCard key={runtime.runtime} runtime={runtime} onBootstrap={bootstrap} onStart={start} onStop={stop} />
        ))}
      </div>
    </div>
  )
}
