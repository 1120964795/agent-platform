import { useEffect, useState } from 'react'
import { sendPopupAction } from '../lib/api.js'

export default function CompanionPopup() {
  const [payload, setPayload] = useState({
    count: 0,
    headline: '等待诊断事件',
    diagnosis: null,
    items: []
  })
  const username = payload?.items?.[0]?.username || payload?.diagnosis?.username || 'guest'

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
      diagnosisIds: (payload.items || []).map((item) => item.id)
    })
  }

  async function ignoreBatch() {
    await sendPopupAction({
      action: 'ignore-batch',
      username,
      signatures: [...new Set((payload.items || []).map((item) => item.errorSignature).filter(Boolean))]
    })
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_45%),linear-gradient(180deg,#0f172a,#111827)] p-4 text-white">
      <section className="mx-auto max-w-sm rounded-3xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur">
        <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-200">Companion</div>
        <h1 className="mt-2 text-lg font-semibold">{payload.headline || '检测到可能的错误'}</h1>
        {payload.diagnosis && (
          <>
            <div className="mt-3 rounded-2xl bg-white/10 p-4">
              <div className="text-sm font-medium">{payload.diagnosis.title}</div>
              <div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-200">{payload.diagnosis.rawSnippet}</div>
            </div>
            {(payload.items || []).length > 1 && (
              <div className="mt-3 space-y-2">
                {(payload.items || []).map((item) => (
                  <div key={item.id} className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-slate-200">
                    <div className="font-medium text-white">{item.title}</div>
                    <div className="mt-1 truncate">{item.rawSnippet}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={openAll}
            className="flex-1 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-400"
          >
            查看全部
          </button>
          <button
            type="button"
            onClick={ignoreBatch}
            className="flex-1 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15"
          >
            忽略本批
          </button>
        </div>
      </section>
    </main>
  )
}
