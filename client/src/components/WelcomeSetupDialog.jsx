import { useEffect, useState } from 'react'
import { CheckCircle2, ChevronLeft, X } from 'lucide-react'

const STEPS = [
  { key: 'python', label: '运行时' },
  { key: 'bridge', label: '桥接' },
  { key: 'done', label: '完成' }
]

const BRIDGE_LABELS = {
  browserUse: '浏览器自动化',
  uitars: 'UI-TARS'
}

function setupInvoke(channel, payload) {
  const invoke = window.electronAPI?.invoke
  if (!invoke) throw new Error('Electron 桥接不可用')
  return invoke(channel, payload)
}

function StatusDot({ ok }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-[color:var(--success)]' : 'bg-red-500'}`}
      aria-hidden="true"
    />
  )
}

function StepIndicator({ current, steps }) {
  return (
    <div className="flex items-center justify-center gap-0 px-5 py-4" role="tablist" aria-label="设置步骤">
      {steps.map((s, i) => {
        const isDone = i < current
        const isCurrent = i === current

        let circleClass = 'border-2 border-[color:var(--border)] bg-transparent text-[color:var(--text-muted)]'
        if (isDone) circleClass = 'border-2 border-[color:var(--success)] bg-[color:var(--success)] text-white'
        if (isCurrent) circleClass = 'border-2 border-[color:var(--accent)] bg-[color:var(--accent)] text-white'

        return (
          <div key={s.key} className="flex items-center" role="tab" aria-selected={isCurrent} aria-label={`第 ${i + 1} 步：${s.label}`}>
            <div className="flex flex-col items-center gap-1">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${circleClass}`}>
                {isDone ? <CheckCircle2 size={14} aria-hidden="true" /> : i + 1}
              </span>
              <span className={`text-xs ${isCurrent ? 'font-medium text-[color:var(--text-primary)]' : 'text-[color:var(--text-muted)]'}`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`mx-2 h-0.5 w-8 rounded ${i < current ? 'bg-[color:var(--success)]' : 'bg-[color:var(--border)]'}`} aria-hidden="true" />
            )}
          </div>
        )
      })}
    </div>
  )
}

function BridgeRow({ bridgeKey, bridge }) {
  const running = bridge.state === 'running'
  const failed = bridge.state === 'failed'
  const dotBg = running ? 'bg-[color:var(--success)]' : failed ? 'bg-red-500' : 'bg-amber-500'
  const textColor = running ? 'text-[color:var(--success)]' : failed ? 'text-red-500' : 'text-amber-500'
  const stateLabel = running ? '运行中' : failed ? '失败' : bridge.state || '未知'
  const bridgeLabel = BRIDGE_LABELS[bridgeKey] || bridgeKey

  return (
    <div className="rounded-md border border-[color:var(--border)] p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dotBg}`} aria-hidden="true" />
          <span className="text-sm font-medium">{bridgeLabel}</span>
        </div>
        <span className={`text-xs font-medium ${textColor}`}>{stateLabel}</span>
      </div>
      {failed && bridge.lastError && (
        <div className="mt-2 text-xs text-red-500">{bridge.lastError}</div>
      )}
    </div>
  )
}

export default function WelcomeSetupDialog({ open, onClose, onMarkSeen }) {
  const [step, setStep] = useState(0)
  const [pythonStatus, setPythonStatus] = useState(null)
  const [pythonLoading, setPythonLoading] = useState(false)
  const [bridgeStatus, setBridgeStatus] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setStep(0)
    setError('')
    setPythonStatus(null)
    setBridgeStatus(null)
  }, [open])

  useEffect(() => {
    if (!open || step !== 0) return
    detectPython()
  }, [open, step])

  useEffect(() => {
    if (!open || step !== 1) return
    let active = true
    async function poll() {
      try {
        const result = await setupInvoke('bridge:status')
        if (active && result?.bridges) setBridgeStatus(result.bridges)
      } catch {
        // Bridge status may be unavailable in browser-only dev sessions.
      }
    }
    poll()
    const timer = setInterval(poll, 5000)
    return () => { active = false; clearInterval(timer) }
  }, [open, step])

  async function detectPython() {
    setPythonLoading(true)
    setError('')
    try {
      const result = await setupInvoke('setup:status')
      setPythonStatus(result?.deps || {})
    } catch (err) {
      setError(err?.message || '运行时检测失败')
    } finally {
      setPythonLoading(false)
    }
  }

  function handleNext() {
    if (step < 2) setStep((s) => s + 1)
  }

  function handleBack() {
    if (step > 0) setStep((s) => s - 1)
  }

  async function handleStart() {
    try {
      await setupInvoke('setup:mark-welcome-shown')
    } catch {
      // Ignore in browser-only dev sessions.
    }
    onMarkSeen?.(true)
    onClose?.()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-setup-title"
    >
      <div className="flex max-h-full w-full max-w-lg flex-col rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-primary)] shadow-xl">
        <header className="flex items-center justify-between border-b border-[color:var(--border)] px-5 py-4">
          <div>
            <h2 id="welcome-setup-title" className="text-base font-semibold">
              AionUi 设置向导
            </h2>
            <p className="mt-1 text-xs text-[color:var(--text-muted)]">
              使用自动化前，先检查本地运行环境。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[color:var(--bg-tertiary)]"
            aria-label="关闭设置向导"
            title="关闭"
          >
            <X size={16} />
          </button>
        </header>

        <StepIndicator current={step} steps={STEPS} />

        {error && (
          <div className="mx-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {step === 0 && (
            <>
              <h3 className="text-sm font-semibold">运行时检测</h3>

              {pythonLoading && (
                <div className="rounded-md border border-[color:var(--border)] p-3 text-sm text-[color:var(--text-muted)]">
                  正在检查 Python 运行时...
                </div>
              )}

              {!pythonLoading && pythonStatus && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-md border border-[color:var(--border)] px-3 py-2 text-sm">
                    <StatusDot ok={Boolean(pythonStatus.python)} />
                    <span>Python{typeof pythonStatus.python === 'string' ? `：${pythonStatus.python}` : pythonStatus.python ? ' 可用' : ' 缺失'}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-[color:var(--border)] px-3 py-2 text-sm">
                    <StatusDot ok={Boolean(pythonStatus.browserUse)} />
                    <span>browser-use{pythonStatus.browserUse ? ' 已安装' : ' 未安装'}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-[color:var(--border)] px-3 py-2 text-sm">
                    <StatusDot ok={Boolean(pythonStatus.playwright)} />
                    <span>playwright{pythonStatus.playwright ? ' 已安装' : ' 未安装'}</span>
                  </div>
                </div>
              )}

              {!pythonLoading && !pythonStatus && !error && (
                <div className="rounded-md border border-[color:var(--border)] p-3 text-sm text-[color:var(--text-muted)]">
                  点击“重新检查”开始检测。
                </div>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <h3 className="text-sm font-semibold">桥接状态</h3>

              {!bridgeStatus && (
                <div className="rounded-md border border-[color:var(--border)] p-3 text-sm text-[color:var(--text-muted)]">
                  正在加载桥接状态...
                </div>
              )}

              {bridgeStatus && Object.keys(bridgeStatus).length === 0 && (
                <div className="rounded-md border border-[color:var(--border)] p-3 text-sm text-[color:var(--text-muted)]">
                  尚未配置桥接服务。
                </div>
              )}

              {bridgeStatus &&
                Object.entries(bridgeStatus).map(([key, b]) => (
                  <BridgeRow key={key} bridgeKey={key} bridge={b} />
                ))}
            </>
          )}

          {step === 2 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle2 size={56} className="text-[color:var(--success)]" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold">准备就绪</h3>
              <p className="mt-2 max-w-xs text-sm text-[color:var(--text-muted)]">
                AionUi 设置检查已完成。
              </p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[color:var(--border)] px-5 py-4">
          <div>
            {step > 0 && step < 2 && (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)]"
              >
                <ChevronLeft size={14} aria-hidden="true" />
                返回
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === 0 && (
              <>
                <button
                  type="button"
                  onClick={detectPython}
                  disabled={pythonLoading}
                  className="h-9 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)] disabled:opacity-50"
                >
                  重新检查
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="h-9 rounded-md bg-[color:var(--accent)] px-4 text-sm font-medium text-white"
                >
                  下一步
                </button>
              </>
            )}

            {step === 1 && (
              <button
                type="button"
                onClick={handleNext}
                className="h-9 rounded-md bg-[color:var(--accent)] px-4 text-sm font-medium text-white"
              >
                下一步
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                onClick={handleStart}
                className="h-9 rounded-md bg-[color:var(--accent)] px-4 text-sm font-medium text-white"
              >
                开始使用
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
