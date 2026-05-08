import { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw, Trash2 } from 'lucide-react'
import { deleteRule, listRules, openFile } from '../lib/api.js'

export default function RulesTab() {
  const [rules, setRules] = useState([])
  const [rulesPath, setRulesPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    setLoading(true)
    setMsg('')
    try {
      const result = await listRules()
      setRules(result.rules || [])
      setRulesPath(result.path || '')
    } catch (error) {
      setMsg(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(rule) {
    try {
      await deleteRule({ rule_id: rule.id })
      await load()
    } catch (error) {
      setMsg(error.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">用户偏好</h2>
          <p className="text-xs text-[color:var(--text-muted)]">智能体记住的长期偏好会显示在这里。</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="h-8 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-tertiary)] flex items-center gap-1"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> 重新加载</button>
          <button type="button" onClick={() => rulesPath && openFile(rulesPath)} className="h-8 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-tertiary)] flex items-center gap-1"><ExternalLink size={13} /> 打开文件</button>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-lg border border-[color:var(--border)] p-4 text-sm text-[color:var(--text-muted)]">暂无保存的偏好。</div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-start gap-3 rounded-lg border border-[color:var(--border)] p-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-[color:var(--text-muted)]">{rule.id}</div>
                <div className="mt-1 text-sm">{rule.text}</div>
              </div>
              <button type="button" onClick={() => handleDelete(rule)} className="h-7 rounded-md border border-[color:var(--border)] px-2 text-xs text-[color:var(--error)] hover:bg-[color:var(--bg-tertiary)]"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}
      {msg && <div className="text-xs text-[color:var(--text-muted)]">{msg}</div>}
    </div>
  )
}
