import { useEffect, useState } from 'react'
import { Activity, Play, Square, Wrench } from 'lucide-react'
import {
  executeDiagnosisFix,
  explainDiagnosis,
  getDiagnosticsStatus,
  ingestDiagnosticText,
  listDiagnosticTargets,
  listDiagnostics,
  startDiagnostics,
  stopDiagnostics
} from '../lib/api.js'

export default function DiagnosticsPanel({ currentUser }) {
  const username = currentUser?.username || 'guest'
  const [status, setStatus] = useState({ status: 'stopped' })
  const [items, setItems] = useState([])
  const [targets, setTargets] = useState([{ id: 'manual', type: 'manual', title: '手动粘贴错误文本' }])
  const [targetId, setTargetId] = useState('manual')
  const [text, setText] = useState('')
  const [active, setActive] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [statusResult, listResult] = await Promise.all([
      getDiagnosticsStatus(username),
      listDiagnostics(username)
    ])
    setStatus(statusResult.status || { status: 'stopped' })
    setItems(listResult.diagnostics || [])
    setActive((current) => current || listResult.diagnostics?.[0] || null)
  }

  useEffect(() => {
    load().catch((error) => setMsg(error.message))
    listDiagnosticTargets().then((result) => {
      const nextTargets = result.targets?.length ? result.targets : targets
      setTargets(nextTargets)
      setTargetId((current) => nextTargets.some((target) => target.id === current) ? current : nextTargets[0].id)
    }).catch((error) => setMsg(error.message))
  }, [username])

  useEffect(() => {
    if (status.status !== 'running') return undefined
    const timer = setInterval(() => load().catch(() => {}), 5000)
    return () => clearInterval(timer)
  }, [status.status, username])

  async function handleStart() {
    const target = targets.find((item) => item.id === targetId) || targets[0]
    const result = await startDiagnostics({ target }, username)
    setStatus(result.status)
  }

  async function handleStop() {
    const result = await stopDiagnostics(username)
    setStatus(result.status)
  }

  async function handleDetect() {
    if (!text.trim()) return
    setBusy(true)
    setMsg('')
    try {
      const result = await ingestDiagnosticText(text, username)
      if (result.diagnosis) setActive(result.diagnosis)
      else setMsg('没有识别到支持的错误')
      setText('')
      await load()
    } catch (error) {
      setMsg(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleExplain() {
    if (!active) return
    const result = await explainDiagnosis(active.id, username)
    setActive({ ...active, modelExplanation: result.explanation })
  }

  async function handleFix(fix) {
    if (!active || !fix) return
    setBusy(true)
    setMsg('')
    try {
      const result = await executeDiagnosisFix(active.id, fix.id, '', username)
      setMsg(result.result?.error?.message || '执行完成')
      await load()
    } catch (error) {
      setMsg(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between rounded-md border border-[color:var(--border)] p-3">
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2.5 w-2.5 rounded-full ${status.status === 'running' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          <span>{status.status === 'running' ? '运行中' : '已停止'}</span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleStart} className="rounded p-2 hover:bg-[color:var(--bg-tertiary)]" title="启动">
            <Play size={15} />
          </button>
          <button type="button" onClick={handleStop} className="rounded p-2 hover:bg-[color:var(--bg-tertiary)]" title="停止">
            <Square size={15} />
          </button>
        </div>
      </div>

      <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">
        采集目标
        <select value={targetId} onChange={(event) => setTargetId(event.target.value)} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)]">
          {targets.map((target) => (
            <option key={target.id} value={target.id}>{target.title || target.id}</option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          className="w-full resize-none rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
          placeholder="粘贴终端错误"
        />
        <button type="button" onClick={handleDetect} disabled={busy || !text.trim()} className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[color:var(--accent)] px-3 text-sm font-medium text-white disabled:opacity-50">
          <Activity size={15} /> 检测错误
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActive(item)}
            className={`rounded-md border p-3 text-left text-sm ${active?.id === item.id ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/5' : 'border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]'}`}
          >
            <div className="font-semibold">{item.title}</div>
            <div className="mt-1 text-xs text-[color:var(--text-muted)]">{item.errorSignature}</div>
          </button>
        ))}
      </div>

      {active && (
        <div className="space-y-3 border-t border-[color:var(--border)] pt-4">
          <div>
            <h2 className="text-base font-semibold">{active.title}</h2>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">{active.summary}</p>
          </div>
          {active.experienceMatches?.length > 0 && (
            <div className="rounded-md bg-[color:var(--success)]/10 p-3 text-xs text-[color:var(--success)]">
              命中经验：{active.experienceMatches[0].title}
            </div>
          )}
          <div className="space-y-2">
            {(active.fixes || []).map((fix) => (
              <div key={fix.id} className="rounded-md border border-[color:var(--border)] p-3 text-xs">
                <div className="font-semibold">{fix.title}</div>
                <code className="mt-2 block rounded bg-[color:var(--bg-secondary)] p-2">{fix.command}</code>
                <button type="button" onClick={() => handleFix(fix)} disabled={busy} className="mt-2 flex h-8 items-center gap-2 rounded-md border border-[color:var(--border)] px-3 hover:bg-[color:var(--bg-tertiary)] disabled:opacity-50">
                  <Wrench size={13} /> 执行
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={handleExplain} className="h-8 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)]">解释</button>
          {active.modelExplanation && <pre className="whitespace-pre-wrap rounded-md bg-[color:var(--bg-secondary)] p-3 text-xs">{active.modelExplanation}</pre>}
        </div>
      )}

      {msg && <div className="text-xs text-[color:var(--text-muted)]">{msg}</div>}
    </div>
  )
}
