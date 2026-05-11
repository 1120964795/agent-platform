import { useEffect, useState } from 'react'
import { Check, ExternalLink, PenLine, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { appendRule, deleteRule, listRules, openFile, updateRule } from '../lib/api.js'

export default function RulesTab() {
  const [rules, setRules] = useState([])
  const [rulesPath, setRulesPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)

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

  async function handleAdd() {
    const text = newText.trim()
    if (!text || saving) return
    setSaving(true)
    setMsg('')
    try {
      await appendRule(text)
      setNewText('')
      await load()
    } catch (error) {
      setMsg(error.message)
    } finally {
      setSaving(false)
    }
  }

  function startEdit(rule) {
    setEditingId(rule.id)
    setEditText(rule.text)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditText('')
  }

  async function handleSaveEdit(id) {
    const text = editText.trim()
    if (!text || saving) return
    setSaving(true)
    setMsg('')
    try {
      await updateRule(id, text)
      setEditingId(null)
      setEditText('')
      await load()
    } catch (error) {
      setMsg(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(rule) {
    try {
      await deleteRule({ rule_id: rule.id })
      await load()
    } catch (error) {
      setMsg(error.message)
    }
  }

  function handleAddKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAdd()
    }
  }

  function handleEditKey(e, id) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSaveEdit(id)
    }
    if (e.key === 'Escape') cancelEdit()
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

      <div className="flex gap-2">
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={handleAddKey}
          placeholder="添加新偏好规则..."
          className="flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newText.trim() || saving}
          className="h-9 rounded-md bg-[color:var(--accent)] text-white px-3 text-sm font-medium disabled:opacity-50 flex items-center gap-1"
        >
          <Plus size={14} /> 添加
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-lg border border-[color:var(--border)] p-4 text-sm text-[color:var(--text-muted)]">暂无保存的偏好。</div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-start gap-3 rounded-lg border border-[color:var(--border)] p-3">
              {editingId === rule.id ? (
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="text-xs text-[color:var(--text-muted)]">{rule.id}</div>
                  <input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => handleEditKey(e, rule.id)}
                    className="w-full rounded-md border border-[color:var(--accent)] bg-[color:var(--bg-primary)] px-2 py-1 text-sm outline-none"
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <button type="button" onClick={() => handleSaveEdit(rule.id)} disabled={!editText.trim() || saving} className="h-7 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-tertiary)] flex items-center gap-1"><Check size={12} /> 保存</button>
                    <button type="button" onClick={cancelEdit} className="h-7 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-tertiary)] flex items-center gap-1"><X size={12} /> 取消</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[color:var(--text-muted)]">{rule.id}</div>
                    <div className="mt-1 text-sm">{rule.text}</div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => startEdit(rule)} className="h-7 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-tertiary)]"><PenLine size={12} /></button>
                    <button type="button" onClick={() => handleDelete(rule)} className="h-7 rounded-md border border-[color:var(--border)] px-2 text-xs text-[color:var(--error)] hover:bg-[color:var(--bg-tertiary)]"><Trash2 size={12} /></button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {msg && <div className="text-xs text-[color:var(--text-muted)]">{msg}</div>}
    </div>
  )
}
