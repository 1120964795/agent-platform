import { useEffect, useState } from 'react'
import { FolderPlus, RefreshCw, Search, Trash2, Wand2 } from 'lucide-react'
import {
  addProject,
  askProject,
  clearProjectIndex,
  listProjects,
  refreshProjectProfile,
  removeProject,
  searchProject,
  startProjectIndex
} from '../lib/api.js'

function ProjectCard({ project, active, onSelect, onRemove }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(project)}
      className={`w-full rounded-md border p-3 text-left text-sm ${active ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/5' : 'border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold">{project.name}</div>
          <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">{project.rootPath}</div>
        </div>
        <span className="shrink-0 text-xs text-[color:var(--text-muted)]">{project.indexedFileCount || 0}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-[color:var(--text-muted)]">
        <span>{project.indexStatus || 'idle'}</span>
        <span onClick={(event) => { event.stopPropagation(); onRemove(project) }} className="rounded p-1 hover:bg-[color:var(--bg-tertiary)]" title="移除">
          <Trash2 size={13} />
        </span>
      </div>
    </button>
  )
}

export default function ProjectAssistantPanel({ currentUser }) {
  const username = currentUser?.username || 'guest'
  const [projects, setProjects] = useState([])
  const [activeProject, setActiveProject] = useState(null)
  const [profile, setProfile] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [answer, setAnswer] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    const result = await listProjects(username)
    setProjects(result.projects || [])
    setActiveProject((current) => current || result.projects?.[0] || null)
  }

  useEffect(() => {
    load().catch((error) => setMsg(error.message))
  }, [username])

  async function handleAdd() {
    const rootPath = await window.electronAPI?.selectDirectory?.()
    if (!rootPath) return
    setBusy(true)
    try {
      const result = await addProject({ rootPath }, username)
      setActiveProject(result.project)
      setProfile(result.profile)
      await load()
    } catch (error) {
      setMsg(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleIndex() {
    if (!activeProject) return
    setBusy(true)
    setMsg('')
    try {
      const result = await startProjectIndex(activeProject.id, username)
      setActiveProject(result.project)
      setProfile(result.profile)
      await load()
    } catch (error) {
      setMsg(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRefreshProfile() {
    if (!activeProject) return
    const result = await refreshProjectProfile(activeProject.id, username)
    setProfile(result.profile)
  }

  async function handleClearIndex() {
    if (!activeProject) return
    await clearProjectIndex(activeProject.id, username)
    await load()
    setResults([])
    setAnswer(null)
  }

  async function handleRemove(project) {
    await removeProject(project.id, username)
    if (activeProject?.id === project.id) setActiveProject(null)
    await load()
  }

  async function handleSearch(event) {
    event.preventDefault()
    if (!activeProject || !query.trim()) return
    const result = await searchProject(activeProject.id, query, username)
    setResults(result.results || [])
    setAnswer(null)
  }

  async function handleAsk() {
    if (!activeProject || !query.trim()) return
    const result = await askProject(activeProject.id, query, username)
    setAnswer(result)
    setResults(result.sources || [])
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-2">
        <button type="button" onClick={handleAdd} disabled={busy} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-[color:var(--accent)] px-3 text-sm font-medium text-white disabled:opacity-50">
          <FolderPlus size={15} /> 添加项目
        </button>
        <button type="button" onClick={load} className="h-9 rounded-md border border-[color:var(--border)] px-3 hover:bg-[color:var(--bg-tertiary)]" title="刷新">
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="space-y-2">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} active={activeProject?.id === project.id} onSelect={setActiveProject} onRemove={handleRemove} />
        ))}
        {projects.length === 0 && <div className="rounded-md border border-[color:var(--border)] p-3 text-sm text-[color:var(--text-muted)]">暂无项目</div>}
      </div>

      {activeProject && (
        <div className="space-y-3 border-t border-[color:var(--border)] pt-4">
          <div className="flex gap-2">
            <button type="button" onClick={handleIndex} disabled={busy} className="h-9 flex-1 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)]">索引</button>
            <button type="button" onClick={handleRefreshProfile} className="h-9 flex-1 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)]">画像</button>
            <button type="button" onClick={handleClearIndex} className="h-9 flex-1 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)]">清空</button>
          </div>

          {profile && (
            <div className="rounded-md bg-[color:var(--bg-secondary)] p-3 text-xs text-[color:var(--text-muted)]">
              <div className="font-medium text-[color:var(--text-primary)]">{profile.summary}</div>
              <div className="mt-2">语言：{profile.languages?.join('、') || '-'}</div>
              <div>框架：{profile.frameworks?.join('、') || '-'}</div>
            </div>
          )}

          <form onSubmit={handleSearch} className="flex gap-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]" />
            <button type="submit" className="h-9 rounded-md border border-[color:var(--border)] px-3 hover:bg-[color:var(--bg-tertiary)]" title="搜索">
              <Search size={15} />
            </button>
            <button type="button" onClick={handleAsk} className="h-9 rounded-md border border-[color:var(--border)] px-3 hover:bg-[color:var(--bg-tertiary)]" title="问答">
              <Wand2 size={15} />
            </button>
          </form>

          {answer && <div className="whitespace-pre-wrap rounded-md border border-[color:var(--border)] p-3 text-sm">{answer.answer}</div>}
          <div className="space-y-2">
            {results.map((result) => (
              <div key={`${result.relativePath}-${result.score}`} className="rounded-md border border-[color:var(--border)] p-3 text-xs">
                <div className="font-semibold">{result.relativePath}</div>
                <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-[color:var(--text-muted)]">{result.snippet}</pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {msg && <div className="text-xs text-[color:var(--danger)]">{msg}</div>}
    </div>
  )
}
