import { useEffect, useMemo, useState } from 'react'
import { Play, Pause, RefreshCcw, ScanSearch, Square } from 'lucide-react'
import DiagnosisCard from '../components/chat/DiagnosisCard.jsx'

const INTERVAL_OPTIONS = [500, 1000, 1500, 3000, 5000]

export default function DiagnosticsPanel({ currentUser, diagnosticsState, diagnosticsFocus }) {
  const [selectedTargetId, setSelectedTargetId] = useState('')
  const [selectedRegion, setSelectedRegion] = useState(null)
  const [projectDir, setProjectDir] = useState('')
  const [intervalMs, setIntervalMs] = useState(1000)
  const [error, setError] = useState('')
  const focusedDiagnosisId = diagnosticsFocus?.diagnosisId || ''

  const session = diagnosticsState.status.session
  const selectedTarget = useMemo(() => {
    if (selectedRegion) return selectedRegion
    return diagnosticsState.targets.find((item) => item.id === selectedTargetId) || null
  }, [diagnosticsState.targets, selectedRegion, selectedTargetId])

  useEffect(() => {
    if (!session?.projectDir) return
    setProjectDir((current) => current || session.projectDir)
  }, [session?.projectDir])

  async function refreshTargets() {
    setError('')
    try {
      await diagnosticsState.refreshTargets()
    } catch (nextError) {
      setError(nextError.message || '刷新窗口目标失败。')
    }
  }

  async function chooseRegion() {
    setError('')
    try {
      const region = await diagnosticsState.chooseRegion()
      if (region) {
        setSelectedRegion(region)
        setSelectedTargetId('')
      }
    } catch (nextError) {
      setError(nextError.message || '框选区域失败。')
    }
  }

  async function handleStart() {
    if (!selectedTarget) {
      setError('请先选择一个观察窗口或框选区域。')
      return
    }
    setError('')
    try {
      await diagnosticsState.start({
        username: diagnosticsState.username,
        target: selectedTarget,
        projectDir,
        intervalMs
      })
    } catch (nextError) {
      setError(nextError.message || '启动伴随诊断失败。')
    }
  }

  async function handleStop() {
    await diagnosticsState.stop()
  }

  useEffect(() => {
    if (!diagnosticsFocus?.diagnosisId) return
    diagnosticsState.refreshDiagnostics().catch(() => {})
    window.setTimeout(() => {
      document.getElementById(`diagnosis-${diagnosticsFocus.diagnosisId}`)?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start'
      })
    }, 120)
  }, [diagnosticsFocus?.nonce])

  return (
    <div className="space-y-5 p-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-sky-900 to-emerald-900 p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">Companion Diagnostics</div>
            <h2 className="mt-2 text-xl font-semibold">Windows 开发错误伴随诊断</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-sky-100/85">
              授权后观察终端窗口或区域，识别常见开发报错，生成诊断卡和经验卡，并在后台提示复用过去的方案。
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
            <div className="text-sky-100/80">当前状态</div>
            <div className="mt-1 text-base font-semibold">{session?.status || 'stopped'}</div>
            {session?.targetLabel && <div className="mt-1 text-xs text-sky-100/80">{session.targetLabel}</div>}
          </div>
        </div>
      </div>

      {diagnosticsState.status.libraryNotice && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {diagnosticsState.status.libraryNotice}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">观察目标</div>
            <div className="mt-1 text-xs text-slate-500">窗口模式优先使用 UIA，失败时回退 OCR；区域模式只使用 OCR。</div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={refreshTargets} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <RefreshCcw size={14} className={diagnosticsState.loadingTargets ? 'animate-spin' : ''} />
              刷新窗口
            </button>
            <button type="button" onClick={chooseRegion} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <ScanSearch size={14} />
              框选区域
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[1.3fr_1fr]">
          <div className="order-2 max-h-[34vh] space-y-2 overflow-y-auto pr-1 md:order-1 md:max-h-[420px]">
            {diagnosticsState.targets.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500">
                先点击“刷新窗口”获取可观察目标。
              </div>
            )}
            {diagnosticsState.targets.map((target) => (
              <button
                key={target.id}
                type="button"
                onClick={() => {
                  setSelectedTargetId(target.id)
                  setSelectedRegion(null)
                }}
                className={`w-full rounded-xl border p-3 text-left transition ${selectedTargetId === target.id ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
              >
                <div className="text-sm font-medium text-slate-900">{target.title}</div>
                <div className="mt-1 text-xs text-slate-500">{target.appName}</div>
              </button>
            ))}
          </div>

          <div className="order-1 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:order-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current Selection</div>
              <div className="mt-2 text-sm font-medium text-slate-900">
                {selectedRegion ? `Region ${selectedRegion.width}x${selectedRegion.height}` : selectedTarget?.title || '未选择'}
              </div>
            </div>

            <label className="block text-xs text-slate-500">
              项目目录
              <input
                value={projectDir}
                onChange={(event) => setProjectDir(event.target.value)}
                placeholder="D:\\project\\demo"
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-400"
              />
            </label>

            <label className="block text-xs text-slate-500">
              采样间隔
              <select
                value={intervalMs}
                onChange={(event) => setIntervalMs(Number(event.target.value))}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-400"
              >
                {INTERVAL_OPTIONS.map((value) => <option key={value} value={value}>{value / 1000}s</option>)}
              </select>
            </label>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleStart} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">
                <Play size={14} />
                开始观察
              </button>
              <button type="button" onClick={handleStop} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <Square size={14} />
                停止
              </button>
              <button type="button" onClick={() => diagnosticsState.resumeNow()} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <Pause size={14} />
                立即恢复
              </button>
            </div>

            {session && (
              <div className="rounded-lg bg-white p-3 text-xs text-slate-600">
                <div>模式: {session.captureMode}</div>
                <div className="mt-1">失败次数: {session.failureCount || 0}</div>
                <div className="mt-1">最近采集: {session.lastCaptureAt || '-'}</div>
                <div className="mt-1">最近错误: {session.lastErrorSignature || '-'}</div>
              </div>
            )}
          </div>
        </div>

        {error && <div className="mt-3 text-xs text-rose-600">{error}</div>}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">最近诊断</h3>
          <button type="button" onClick={() => diagnosticsState.refreshDiagnostics()} className="text-xs text-slate-500 hover:text-slate-800">刷新</button>
        </div>
        {diagnosticsState.diagnostics.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-xs text-slate-500">
            暂无诊断记录。启动观察后，识别到错误会自动出现在这里。
          </div>
        )}
        {diagnosticsState.diagnostics.map((diagnosis) => (
          <DiagnosisCard
            key={diagnosis.id}
            diagnosis={diagnosis}
            currentUser={currentUser}
            autoExplain={diagnosticsFocus?.explain && diagnosis.id === focusedDiagnosisId}
            focusNonce={diagnosticsFocus?.nonce || 0}
          />
        ))}
      </div>
    </div>
  )
}
