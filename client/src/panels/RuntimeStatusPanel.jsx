import { RefreshCw } from 'lucide-react'
import RuntimeCard from '../components/runtime/RuntimeCard.jsx'
import { useRuntimeStatus } from '../hooks/useRuntimeStatus.js'

export default function RuntimeStatusPanel() {
  const { runtimes, loading, error, refresh, bootstrap, start, stop } = useRuntimeStatus()

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">模型与运行时</h2>
          <p className="text-xs text-[color:var(--text-muted)]">Qwen 负责规划；Open Interpreter 和 UI-TARS 只能通过 AionUi 策略执行。</p>
        </div>
        <button type="button" onClick={refresh} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]" aria-label="刷新运行时" title="刷新">
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
