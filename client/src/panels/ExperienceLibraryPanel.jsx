import { useEffect, useState } from 'react'
import { Download, RefreshCw, Search, Trash2 } from 'lucide-react'
import { deleteExperience, exportExperiences, listExperiences, searchExperiences, updateExperience } from '../lib/api.js'

export default function ExperienceLibraryPanel({ currentUser }) {
  const username = currentUser?.username || 'guest'
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [active, setActive] = useState(null)
  const [msg, setMsg] = useState('')

  async function load() {
    const result = query.trim()
      ? await searchExperiences(query, username, status || undefined)
      : await listExperiences(username, status || undefined)
    setItems(result.experiences || [])
    setActive((current) => current || result.experiences?.[0] || null)
  }

  useEffect(() => {
    load().catch((error) => setMsg(error.message))
  }, [username, status])

  async function handleSearch(event) {
    event.preventDefault()
    await load()
  }

  async function handleDelete(item) {
    await deleteExperience(item.id, username)
    if (active?.id === item.id) setActive(null)
    await load()
  }

  async function handlePin(item) {
    const result = await updateExperience({ id: item.id, pinned: !item.pinned }, username)
    setActive(result.experience)
    await load()
  }

  async function handleExport() {
    const result = await exportExperiences(username)
    setMsg(`${result.filename}: ${result.payload.experiences.length} 条`)
  }

  return (
    <div className="space-y-4 p-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]" />
        <button type="submit" className="h-9 rounded-md border border-[color:var(--border)] px-3 hover:bg-[color:var(--bg-tertiary)]" title="搜索"><Search size={15} /></button>
      </form>

      <div className="flex gap-2">
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-2 text-sm">
          <option value="">全部</option>
          <option value="draft">草稿</option>
          <option value="unresolved">未解决</option>
          <option value="resolved">已解决</option>
        </select>
        <button type="button" onClick={load} className="h-9 rounded-md border border-[color:var(--border)] px-3 hover:bg-[color:var(--bg-tertiary)]" title="刷新"><RefreshCw size={15} /></button>
        <button type="button" onClick={handleExport} className="h-9 rounded-md border border-[color:var(--border)] px-3 hover:bg-[color:var(--bg-tertiary)]" title="导出"><Download size={15} /></button>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <button key={item.id} type="button" onClick={() => setActive(item)} className={`w-full rounded-md border p-3 text-left text-sm ${active?.id === item.id ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/5' : 'border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]'}`}>
            <div className="flex justify-between gap-2">
              <span className="min-w-0 truncate font-semibold">{item.title}</span>
              <span className="shrink-0 text-xs text-[color:var(--text-muted)]">{item.status}</span>
            </div>
            <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">{item.errorSignature}</div>
          </button>
        ))}
        {items.length === 0 && <div className="rounded-md border border-[color:var(--border)] p-3 text-sm text-[color:var(--text-muted)]">暂无经验</div>}
      </div>

      {active && (
        <div className="space-y-3 border-t border-[color:var(--border)] pt-4">
          <div>
            <h2 className="text-base font-semibold">{active.title}</h2>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">{active.summary}</p>
          </div>
          <div className="text-xs text-[color:var(--text-muted)]">成功次数：{active.successCount || 0}</div>
          <div className="space-y-2">
            {(active.commands || []).map((command) => <code key={command} className="block rounded bg-[color:var(--bg-secondary)] p-2 text-xs">{command}</code>)}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => handlePin(active)} className="h-8 flex-1 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)]">{active.pinned ? '取消固定' : '固定'}</button>
            <button type="button" onClick={() => handleDelete(active)} className="flex h-8 items-center justify-center rounded-md border border-[color:var(--border)] px-3 hover:bg-[color:var(--bg-tertiary)]" title="删除"><Trash2 size={14} /></button>
          </div>
        </div>
      )}

      {msg && <div className="text-xs text-[color:var(--text-muted)]">{msg}</div>}
    </div>
  )
}
