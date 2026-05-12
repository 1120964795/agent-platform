import { useEffect, useState } from 'react'
import { CheckCircle2, ChevronLeft, X } from 'lucide-react'

const STEPS = [
  { key: 'browserUse', label: 'Browser Use' },
  { key: 'python', label: 'Runtime' },
  { key: 'bridge', label: 'Bridge' },
  { key: 'done', label: 'Done' }
]

const DEFAULT_FORM = {
  browserUseApiKey: '',
  browserUseEndpoint: 'https://zenmux.ai/api/v1',
  browserUseModel: 'openai/gpt-5.5',
  desktopUseAllowBrowserFallback: true
}

function setupInvoke(channel, payload) {
  const invoke = window.electronAPI?.invoke
  if (!invoke) throw new Error('Electron bridge is unavailable')
  return invoke(channel, payload)
}

function StatusDot({ ok }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-[color:var(--success)]' : 'bg-amber-500'}`}
      aria-hidden="true"
    />
  )
}

function StepIndicator({ current, steps }) {
  return (
    <div className="flex items-center justify-center gap-0 px-5 py-4" role="tablist" aria-label="Setup steps">
      {steps.map((step, index) => {
        const done = index < current
        const active = index === current
        let circleClass = 'border-[color:var(--border)] text-[color:var(--text-muted)]'
        if (done) circleClass = 'border-[color:var(--success)] bg-[color:var(--success)] text-white'
        if (active) circleClass = 'border-[color:var(--accent)] bg-[color:var(--accent)] text-white'

        return (
          <div key={step.key} className="flex items-center" role="tab" aria-selected={active} aria-label={`Step ${index + 1}: ${step.label}`}>
            <div className="flex flex-col items-center gap-1">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold ${circleClass}`}>
                {done ? <CheckCircle2 size={14} aria-hidden="true" /> : index + 1}
              </span>
              <span className={`text-xs ${active ? 'font-medium text-[color:var(--text-primary)]' : 'text-[color:var(--text-muted)]'}`}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={`mx-2 h-0.5 w-8 rounded ${index < current ? 'bg-[color:var(--success)]' : 'bg-[color:var(--border)]'}`} aria-hidden="true" />
            )}
          </div>
        )
      })}
    </div>
  )
}

function BridgeRow({ bridgeKey, bridge = {} }) {
  const running = bridge.state === 'running'
  const failed = bridge.state === 'failed'
  const stateLabel = running ? 'Running' : failed ? 'Failed' : bridge.state || 'Unknown'
  const dotClass = running ? 'bg-[color:var(--success)]' : failed ? 'bg-red-500' : 'bg-amber-500'
  const textClass = running ? 'text-[color:var(--success)]' : failed ? 'text-red-500' : 'text-amber-500'

  return (
    <div className="rounded-md border border-[color:var(--border)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
          <span className="truncate text-sm font-medium">{bridgeKey}</span>
        </div>
        <span className={`text-xs font-medium ${textClass}`}>{stateLabel}</span>
      </div>
      {failed && bridge.lastError && (
        <div className="mt-2 text-xs text-red-500">{bridge.lastError}</div>
      )}
    </div>
  )
}

export default function WelcomeSetupDialog({ open, onClose, onMarkSeen }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [runtimeStatus, setRuntimeStatus] = useState(null)
  const [runtimeLoading, setRuntimeLoading] = useState(false)
  const [bridgeStatus, setBridgeStatus] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setStep(0)
    setError('')
    setRuntimeStatus(null)
    setBridgeStatus(null)
    setForm(DEFAULT_FORM)
  }, [open])

  useEffect(() => {
    if (!open || step !== 1) return
    detectRuntime()
  }, [open, step])

  useEffect(() => {
    if (!open || step !== 2) return
    let active = true

    async function poll() {
      try {
        const result = await setupInvoke('bridge:status')
        if (active) setBridgeStatus(result?.bridges || {})
      } catch {
        if (active) setBridgeStatus({})
      }
    }

    poll()
    const timer = setInterval(poll, 5000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [open, step])

  async function detectRuntime() {
    setRuntimeLoading(true)
    setError('')
    try {
      const result = await setupInvoke('setup:status')
      setRuntimeStatus(result || {})
    } catch (err) {
      setError(err?.message || 'Runtime detection failed')
    } finally {
      setRuntimeLoading(false)
    }
  }

  async function handleSaveApiKeyAndNext() {
    if (saving || !form.browserUseApiKey.trim()) return
    setSaving(true)
    setError('')
    try {
      await setupInvoke('config:set', form)
      setStep(1)
    } catch (err) {
      setError(err?.message || 'Failed to save Browser Use settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleSkipApiKey() {
    try {
      await setupInvoke('setup:mark-welcome-shown')
    } catch {
      // Browser-only previews do not have setup IPC.
    }
    onMarkSeen?.(true)
    setStep(1)
  }

  function handleNext() {
    if (step < 3) setStep((current) => current + 1)
  }

  function handleBack() {
    if (step > 0) setStep((current) => current - 1)
  }

  async function handleStart() {
    try {
      await setupInvoke('setup:mark-welcome-shown')
    } catch {
      // Browser-only previews do not have setup IPC.
    }
    onMarkSeen?.(true)
    onClose?.()
  }

  const bridges = bridgeStatus || {}
  const bridgeKeys = Object.keys(bridges)
  const bridgesRunning = bridgeKeys.length > 0 && Object.values(bridges).every((bridge) => bridge.state === 'running')
  const deps = runtimeStatus?.deps || runtimeStatus?.python || {}
  const step0Valid = form.browserUseApiKey.trim().length > 0

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
            <h2 id="welcome-setup-title" className="text-base font-semibold">AionUi setup</h2>
            <p className="mt-1 text-xs text-[color:var(--text-muted)]">Configure Browser Use, verify runtime dependencies, and confirm bridges.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[color:var(--bg-tertiary)]"
            aria-label="Close setup"
            title="Close"
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
              <h3 className="text-sm font-semibold">Browser Use API key</h3>
              <p className="text-xs text-[color:var(--text-muted)]">
                Browser Use powers browser automation. Desktop Use can reuse this key when fallback is enabled.
              </p>

              <div className="space-y-3">
                <label className="block space-y-1 text-xs font-medium text-[color:var(--text-primary)]">
                  API Key
                  <input
                    type="password"
                    placeholder="ZenMux API Key"
                    value={form.browserUseApiKey}
                    onChange={(event) => setForm((current) => ({ ...current, browserUseApiKey: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleSaveApiKeyAndNext()
                    }}
                    className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                  />
                </label>

                <label className="block space-y-1 text-xs font-medium text-[color:var(--text-primary)]">
                  Endpoint
                  <input
                    type="text"
                    value={form.browserUseEndpoint}
                    onChange={(event) => setForm((current) => ({ ...current, browserUseEndpoint: event.target.value }))}
                    className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                  />
                </label>

                <label className="block space-y-1 text-xs font-medium text-[color:var(--text-primary)]">
                  Model
                  <input
                    type="text"
                    value={form.browserUseModel}
                    onChange={(event) => setForm((current) => ({ ...current, browserUseModel: event.target.value }))}
                    className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                  />
                </label>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h3 className="text-sm font-semibold">Runtime dependencies</h3>

              {runtimeLoading && (
                <div className="rounded-md border border-[color:var(--border)] p-3 text-sm text-[color:var(--text-muted)]">
                  Checking Python and Browser Use dependencies...
                </div>
              )}

              {!runtimeLoading && runtimeStatus && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-md border border-[color:var(--border)] px-3 py-2 text-sm">
                    <StatusDot ok={Boolean(deps.python || runtimeStatus.python)} />
                    <span>Python {deps.python || runtimeStatus.python || 'not detected'}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-[color:var(--border)] px-3 py-2 text-sm">
                    <StatusDot ok={Boolean(deps.browserUse)} />
                    <span>browser-use {deps.browserUse ? 'ready' : 'needs repair'}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-[color:var(--border)] px-3 py-2 text-sm">
                    <StatusDot ok={Boolean(deps.playwright)} />
                    <span>playwright {deps.playwright ? 'ready' : 'needs repair'}</span>
                  </div>
                </div>
              )}

              {!runtimeLoading && !runtimeStatus && !error && (
                <div className="rounded-md border border-[color:var(--border)] p-3 text-sm text-[color:var(--text-muted)]">
                  Runtime status has not been checked yet.
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <h3 className="text-sm font-semibold">Bridge status</h3>

              {!bridgeStatus && (
                <div className="rounded-md border border-[color:var(--border)] p-3 text-sm text-[color:var(--text-muted)]">
                  Checking bridge status...
                </div>
              )}

              {bridgeStatus && bridgeKeys.length === 0 && (
                <div className="rounded-md border border-[color:var(--border)] p-3 text-sm text-[color:var(--text-muted)]">
                  No bridge status is available yet.
                </div>
              )}

              {bridgeKeys.map((key) => (
                <BridgeRow key={key} bridgeKey={key} bridge={bridges[key]} />
              ))}

              {bridgesRunning && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-700">
                  Browser Use and Desktop Use bridges are running.
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle2 size={56} className="text-[color:var(--success)]" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold">Setup complete</h3>
              <p className="mt-2 max-w-xs text-sm text-[color:var(--text-muted)]">
                AionUi is ready for DeepSeek chat, Browser Use automation, Desktop Use automation, and artifact generation.
              </p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[color:var(--border)] px-5 py-4">
          <div>
            {step > 0 && step < 3 && (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)]"
              >
                <ChevronLeft size={14} aria-hidden="true" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === 0 && (
              <>
                <button
                  type="button"
                  onClick={handleSkipApiKey}
                  className="h-9 rounded-md border border-[color:var(--border)] px-4 text-sm hover:bg-[color:var(--bg-tertiary)]"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={handleSaveApiKeyAndNext}
                  disabled={!step0Valid || saving}
                  className="h-9 rounded-md bg-[color:var(--accent)] px-4 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save and continue'}
                </button>
              </>
            )}

            {step === 1 && (
              <>
                <button
                  type="button"
                  onClick={detectRuntime}
                  disabled={runtimeLoading}
                  className="h-9 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)] disabled:opacity-50"
                >
                  Recheck
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="h-9 rounded-md bg-[color:var(--accent)] px-4 text-sm font-medium text-white"
                >
                  Continue
                </button>
              </>
            )}

            {step === 2 && (
              <button
                type="button"
                onClick={handleNext}
                disabled={!bridgesRunning}
                className="h-9 rounded-md bg-[color:var(--accent)] px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                Continue
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                onClick={handleStart}
                className="h-9 rounded-md bg-[color:var(--accent)] px-4 text-sm font-medium text-white"
              >
                Start using AionUi
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
