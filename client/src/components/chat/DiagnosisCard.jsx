import { useEffect, useState } from 'react'
import { executeDiagnosisFix, explainDiagnosis, rewriteDiagnosisPlan } from '../../lib/api.js'

function useLocalDiagnosis(initialDiagnosis) {
  const [diagnosis, setDiagnosis] = useState(initialDiagnosis)
  useEffect(() => {
    setDiagnosis(initialDiagnosis)
  }, [initialDiagnosis])
  return [diagnosis, setDiagnosis]
}

export default function DiagnosisCard({ diagnosis: initialDiagnosis, currentUser }) {
  const username = currentUser?.username || initialDiagnosis?.username || 'guest'
  const [diagnosis, setDiagnosis] = useLocalDiagnosis(initialDiagnosis)
  const [busyKey, setBusyKey] = useState('')
  const [message, setMessage] = useState('')
  const [rewrittenPlan, setRewrittenPlan] = useState(null)

  async function handleExecute(fixId, plan) {
    setBusyKey(plan ? 'rewrite' : fixId)
    setMessage('')
    try {
      const result = await executeDiagnosisFix({
        username,
        diagnosisId: diagnosis.id,
        fixId,
        plan
      })
      if (result.diagnosis) setDiagnosis(result.diagnosis)
      if (result.experience?.status === 'resolved') {
        setMessage('修复命令执行成功，经验卡已更新为已解决。')
      } else {
        setMessage('命令已执行，请查看终端输出和经验状态。')
      }
    } catch (error) {
      setMessage(error.message || '执行失败。')
    } finally {
      setBusyKey('')
    }
  }

  async function handleExplain() {
    setBusyKey('explain')
    setMessage('')
    try {
      const result = await explainDiagnosis(diagnosis.id, username)
      if (result.diagnosis) setDiagnosis(result.diagnosis)
    } catch (error) {
      setMessage(error.message || '详细解释失败。')
    } finally {
      setBusyKey('')
    }
  }

  async function handleRewrite(match) {
    setBusyKey(`rewrite:${match.experienceId}`)
    setMessage('')
    try {
      const result = await rewriteDiagnosisPlan(diagnosis.id, match.experienceId, username)
      setRewrittenPlan(result.plan)
    } catch (error) {
      setMessage(error.message || '复用方案重写失败。')
    } finally {
      setBusyKey('')
    }
  }

  if (!diagnosis) return null

  return (
    <section className="my-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-slate-800 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Diagnosis</div>
          <h3 className="mt-1 text-base font-semibold text-slate-900">{diagnosis.title}</h3>
          <div className="mt-1 text-xs text-slate-500">{diagnosis.appName} {diagnosis.windowTitle ? `· ${diagnosis.windowTitle}` : ''}</div>
        </div>
        <div className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm">
          {diagnosis.status || 'ready'}
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-white/90 p-3 text-xs text-slate-700">
        <div className="font-semibold text-slate-900">原始报错</div>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-slate-900 p-3 text-slate-100">{diagnosis.rawSnippet}</pre>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-white/90 p-3">
          <div className="font-semibold text-slate-900">含义</div>
          <p className="mt-2 text-xs leading-5 text-slate-700">{diagnosis.meaning}</p>
        </div>
        <div className="rounded-lg bg-white/90 p-3">
          <div className="font-semibold text-slate-900">可能原因</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-700">
            {(diagnosis.possibleCauses || []).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-white/90 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold text-slate-900">推荐修复</div>
          <button
            type="button"
            disabled={busyKey === 'explain'}
            onClick={handleExplain}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {busyKey === 'explain' ? '生成中...' : '详细解释'}
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {(diagnosis.recommendedFixes || []).length === 0 && (
            <div className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-500">
              当前规则没有自动给出安全修复命令，请先结合原因手动处理。
            </div>
          )}
          {(diagnosis.recommendedFixes || []).map((fix) => (
            <div key={fix.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{fix.label || fix.command}</div>
                  <div className="mt-1 break-all rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-700">{fix.command}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span>CWD: {fix.cwd || '-'}</span>
                    <span>Risk: {fix.riskLevel}</span>
                    {fix.requiresNetwork && <span>Needs Network</span>}
                    {fix.blocked && <span className="font-semibold text-rose-600">Blocked: {fix.blockReason}</span>}
                  </div>
                  {fix.riskExplanation && <p className="mt-2 text-xs text-slate-600">{fix.riskExplanation}</p>}
                </div>
                <button
                  type="button"
                  disabled={fix.blocked || busyKey === fix.id}
                  onClick={() => handleExecute(fix.id)}
                  className="rounded-md bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {busyKey === fix.id ? '执行中...' : '确认执行'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {(diagnosis.experienceMatches || []).length > 0 && (
        <div className="mt-3 rounded-lg bg-white/90 p-3">
          <div className="font-semibold text-slate-900">历史经验匹配</div>
          <div className="mt-3 space-y-2">
            {(diagnosis.experienceMatches || []).map((match) => (
              <div key={match.experienceId} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{match.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      相似度: {match.similarity} {match.matchedKeywords?.length ? `· 关键词: ${match.matchedKeywords.join(', ')}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyKey === `rewrite:${match.experienceId}`}
                    onClick={() => handleRewrite(match)}
                    className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {busyKey === `rewrite:${match.experienceId}` ? '重写中...' : '复用上次方案'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {rewrittenPlan && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="font-semibold text-emerald-900">重写后的复用方案</div>
          <div className="mt-2 break-all rounded-md bg-white px-2 py-2 font-mono text-[11px] text-slate-700">{rewrittenPlan.command}</div>
          <div className="mt-2 text-xs text-emerald-800">CWD: {rewrittenPlan.cwd || '-'}</div>
          {rewrittenPlan.reason && <div className="mt-1 text-xs text-emerald-800">{rewrittenPlan.reason}</div>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busyKey === 'rewrite'}
              onClick={() => handleExecute('rewrite', rewrittenPlan)}
              className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
            >
              {busyKey === 'rewrite' ? '执行中...' : '执行复用方案'}
            </button>
          </div>
        </div>
      )}

      {diagnosis.modelExplanation && (
        <div className="mt-3 rounded-lg bg-slate-900 p-3 text-xs leading-5 text-slate-100">
          <div className="font-semibold text-slate-50">模型补充</div>
          <p className="mt-2 whitespace-pre-wrap">{diagnosis.modelExplanation}</p>
        </div>
      )}

      {message && <div className="mt-3 text-xs text-slate-600">{message}</div>}
    </section>
  )
}
