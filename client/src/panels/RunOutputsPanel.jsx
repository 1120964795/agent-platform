import { Download, ExternalLink, RefreshCw } from 'lucide-react'
import { useRunOutputs } from '../hooks/useRunOutputs.js'

export default function RunOutputsPanel() {
  const { outputs, loading, error, refresh, open, exportOutputs } = useRunOutputs()

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">运行输出</h2>
          <p className="text-xs text-[color:var(--text-muted)]">命令摘要、生成文件、截图元数据和演示模式产物。</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={refresh} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]" aria-label="刷新输出" title="刷新">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={exportOutputs} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]" aria-label="导出输出" title="导出">
            <Download size={14} />
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-[color:var(--error)]">{error}</div>}

      <div className="space-y-2">
        {outputs.length === 0 && <div className="rounded-md border border-dashed border-[color:var(--border)] p-4 text-center text-xs text-[color:var(--text-muted)]">暂无运行输出</div>}
        {outputs.map((output) => (
          <button key={output.id} type="button" onClick={() => open(output)} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] p-3 text-left hover:bg-[color:var(--bg-tertiary)]">
            <div className="flex items-start gap-2">
              <ExternalLink size={14} className="mt-0.5 shrink-0 text-[color:var(--accent)]" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{output.title}</div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)] truncate">{output.path || output.type}</div>
                {output.summary && <div className="mt-2 text-xs line-clamp-3">{output.summary}</div>}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
