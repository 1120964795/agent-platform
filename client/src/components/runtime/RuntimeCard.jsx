import { Play, RefreshCw, Square, Wrench } from 'lucide-react'
import SetupGuide from './SetupGuide.jsx'

const STATE_LABELS = {
  ready: '就绪',
  configured: '已配置',
  'needs-configuration': '需要配置',
  'not-installed': '未安装',
  'not-configured': '未配置',
  disabled: '已禁用',
  error: '异常'
}

const RUNTIME_LABELS = {
  qwen: 'Qwen',
  deepseek: 'DeepSeek 备用聊天',
  'open-interpreter': 'Open Interpreter',
  'ui-tars': 'UI-TARS',
  'aionui-dry-run': '演示模式'
}

function stateClass(state) {
  if (state === 'ready' || state === 'configured') return 'border-[color:var(--success)] text-[color:var(--success)]'
  if (state === 'disabled' || state === 'not-installed' || state === 'not-configured') return 'border-[color:var(--border)] text-[color:var(--text-muted)]'
  return 'border-[color:var(--error)] text-[color:var(--error)]'
}

export default function RuntimeCard({ runtime, onBootstrap, onStart, onStop }) {
  const label = STATE_LABELS[runtime.state] || runtime.state || '未知'
  return (
    <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{RUNTIME_LABELS[runtime.runtime] || runtime.runtime}</div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)] truncate">{runtime.model || runtime.endpoint || runtime.command || runtime.baseUrl || '本地能力'}</div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${stateClass(runtime.state)}`}>{label}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => onBootstrap(runtime.runtime)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]" aria-label={`修复 ${RUNTIME_LABELS[runtime.runtime] || runtime.runtime}`} title="设置或修复">
          <Wrench size={14} />
        </button>
        <button type="button" onClick={() => onStart(runtime.runtime)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]" aria-label={`启动 ${RUNTIME_LABELS[runtime.runtime] || runtime.runtime}`} title="启动">
          <Play size={14} />
        </button>
        <button type="button" onClick={() => onStop(runtime.runtime)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]" aria-label={`停止 ${RUNTIME_LABELS[runtime.runtime] || runtime.runtime}`} title="停止">
          <Square size={14} />
        </button>
        <button type="button" onClick={() => onBootstrap(runtime.runtime)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]" aria-label={`刷新 ${RUNTIME_LABELS[runtime.runtime] || runtime.runtime}`} title="刷新指引">
          <RefreshCw size={14} />
        </button>
      </div>

      <SetupGuide guidance={runtime.guidance} />
    </div>
  )
}
