import { useEffect, useState } from 'react'
import ExperienceCard from '../components/chat/ExperienceCard.jsx'
import { deleteExperience, exportExperiences, listExperiences, saveFileAs, searchExperiences, updateExperience } from '../lib/api.js'

export default function ExperienceLibraryPanel({ currentUser, diagnosticsState }) {
  const username = currentUser?.username || 'guest'
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [exportPreview, setExportPreview] = useState(null)

  async function load() {
    setError('')
    try {
      const result = query.trim()
        ? await searchExperiences(query.trim(), username, status || undefined)
        : await listExperiences(username, status || undefined)
      setItems(result.items || [])
    } catch (nextError) {
      setError(nextError.message || '读取经验失败。')
    }
  }

  useEffect(() => {
    load()
  }, [query, status, username])

  useEffect(() => {
    if (!query && !status) {
      setItems(diagnosticsState.experiences || [])
    }
  }, [diagnosticsState.experiences, query, status])

  async function handleSave(experience) {
    await updateExperience(experience, username)
    await load()
  }

  async function handleDelete(experience) {
    await deleteExperience(experience.id, username)
    await load()
  }

  async function handleExport() {
    try {
      const result = await exportExperiences(username)
      const content = JSON.stringify(result.payload, null, 2)
      try {
        await saveFileAs({
          filename: result.filename,
          defaultPath: result.filename,
          content,
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })
      } catch {
        setExportPreview({ filename: result.filename, content })
      }
    } catch (nextError) {
      setError(nextError.message || '导出经验失败。')
    }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="min-w-[180px] flex-1 text-xs text-slate-500">
          搜索
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="关键词、签名、原因、目录"
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400"
          />
        </label>
        <label className="w-[160px] text-xs text-slate-500">
          状态
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400"
          >
            <option value="">全部</option>
            <option value="draft">draft</option>
            <option value="unresolved">unresolved</option>
            <option value="resolved">resolved</option>
          </select>
        </label>
        <button
          type="button"
          onClick={handleExport}
          className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          导出 JSON
        </button>
      </div>

      {error && <div className="text-xs text-rose-600">{error}</div>}

      {items.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-xs text-slate-500">
          暂无经验卡。识别到错误并生成诊断后会自动沉淀到这里。
        </div>
      )}

      {items.map((experience) => (
        <ExperienceCard
          key={experience.id}
          experience={experience}
          editable
          onSave={handleSave}
          onDelete={handleDelete}
        />
      ))}

      {exportPreview && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">导出预览</div>
              <div className="mt-1 text-xs text-slate-500">{exportPreview.filename}</div>
            </div>
            <button type="button" onClick={() => setExportPreview(null)} className="text-xs text-slate-500 hover:text-slate-800">关闭</button>
          </div>
          <textarea
            readOnly
            value={exportPreview.content}
            rows={14}
            className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-700"
          />
        </div>
      )}
    </div>
  )
}
