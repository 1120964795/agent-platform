import { useEffect, useState } from 'react'
import { sendPopupAction } from '../lib/api.js'

export default function CompanionPopup() {
  const [payload, setPayload] = useState({
    count: 0,
    headline: 'Waiting for diagnostics',
    diagnosis: null,
    items: []
  })
  const username = payload?.items?.[0]?.username || payload?.diagnosis?.username || 'guest'
  const diagnosis = payload?.diagnosis || null
  const items = payload?.items || []

  useEffect(() => {
    const unsubscribe = window.electronAPI?.on?.('diagnostics:popup-data', (nextPayload = {}) => {
      setPayload(nextPayload)
    })
    return () => unsubscribe?.()
  }, [])

  async function openAll() {
    await sendPopupAction({
      action: 'open-all',
      username,
      diagnosisIds: items.map((item) => item.id)
    })
  }

  async function openExplanation() {
    if (!diagnosis?.id) return
    await sendPopupAction({
      action: 'open-diagnosis-explanation',
      username,
      diagnosisId: diagnosis.id
    })
  }

  async function ignoreBatch() {
    await sendPopupAction({
      action: 'ignore-batch',
      username,
      signatures: [...new Set(items.map((item) => item.errorSignature).filter(Boolean))]
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#0f172a,#111827)] p-4 text-white">
      <section className="mx-auto max-w-sm rounded-2xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur">
        <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-200">Companion</div>
        <h1 className="mt-2 text-lg font-semibold">{payload.headline || 'Possible error detected'}</h1>

        {diagnosis && (
          <>
            <div className="mt-3 rounded-xl bg-white/10 p-4">
              <div className="text-sm font-medium">{diagnosis.title}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-sky-100/80">
                <span>{diagnosis.errorType || 'Unknown error'}</span>
                {diagnosis.projectDir && <span className="truncate">Project: {diagnosis.projectDir}</span>}
              </div>
              {diagnosis.meaning && (
                <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-200">{diagnosis.meaning}</div>
              )}
              <div className="mt-2 max-h-16 overflow-hidden whitespace-pre-wrap rounded-lg bg-black/20 p-2 text-[11px] leading-4 text-slate-200">
                {diagnosis.rawSnippet}
              </div>
            </div>

            {items.length > 1 && (
              <div className="mt-3 space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-xs text-slate-200">
                    <div className="font-medium text-white">{item.title}</div>
                    <div className="mt-1 truncate">{item.rawSnippet}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={openExplanation}
            className="rounded-xl bg-sky-500 px-3 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-400"
          >
            View explanation
          </button>
          <button
            type="button"
            onClick={ignoreBatch}
            className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm font-semibold text-white hover:bg-white/15"
          >
            Ignore
          </button>
        </div>

        {items.length > 1 && (
          <button
            type="button"
            onClick={openAll}
            className="mt-2 w-full rounded-xl border border-white/15 bg-black/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            View all detected errors
          </button>
        )}
      </section>
    </main>
  )
}
