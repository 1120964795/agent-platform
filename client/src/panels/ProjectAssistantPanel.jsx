import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileDiff,
  FolderPlus,
  MessageSquareText,
  Pause,
  Play,
  RefreshCcw,
  Search,
  Settings2,
  Trash2,
  X
} from 'lucide-react'
import {
  addProject,
  applyProjectPatch,
  askProject,
  clearProjectIndex,
  listProjects,
  matchProjectExperiences,
  pauseProjectIndex,
  previewProjectPatch,
  refreshProjectEmbedding,
  removeProject,
  searchProject,
  startProjectIndex,
  updateProjectSettings
} from '../lib/api.js'

function formatTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatBytes(value) {
  const size = Number(value) || 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function commandText(commands = []) {
  if (!commands.length) return '未确定'
  return commands.map((item) => item.command).join(', ')
}

function Sources({ citations = [] }) {
  if (!citations.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
        没有可引用来源
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {citations.map((source, index) => (
        <div key={`${source.path}-${source.lineStart}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-xs font-medium text-slate-800">
            {source.path}:{source.lineStart}-{source.lineEnd}
          </div>
          <div className="mt-1 text-xs text-slate-500">{source.reason}</div>
        </div>
      ))}
    </div>
  )
}

function diffStats(diff = '') {
  const lines = String(diff || '').split(/\r?\n/)
  return {
    files: lines.filter((line) => line.startsWith('diff --git ')).length,
    added: lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length,
    removed: lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length
  }
}

export default function ProjectAssistantPanel({ currentUser }) {
  const username = currentUser?.username || 'guest'
  const [items, setItems] = useState([])
  const [activeProjectId, setActiveProjectId] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [patchDiff, setPatchDiff] = useState('')
  const [patchTitle, setPatchTitle] = useState('')
  const [patchPreview, setPatchPreview] = useState(null)
  const [confirmingPatch, setConfirmingPatch] = useState(false)
  const [experienceQuery, setExperienceQuery] = useState('')
  const [migrationMatches, setMigrationMatches] = useState([])
  const [embeddingStatus, setEmbeddingStatus] = useState(null)
  const [settingsDraft, setSettingsDraft] = useState({
    debounceMs: 3000,
    includeExtensions: '',
    excludeGlobs: ''
  })

  const activeBundle = useMemo(() => (
    items.find((item) => item.project.id === activeProjectId) || items[0] || null
  ), [activeProjectId, items])
  const project = activeBundle?.project
  const settings = activeBundle?.settings
  const profile = activeBundle?.profile
  const indexStatus = activeBundle?.indexStatus
  const watcherStatus = activeBundle?.watcherStatus
  const indexQueueStatus = activeBundle?.indexQueueStatus
  const patchStats = useMemo(() => diffStats(patchPreview?.patchText || patchDiff), [patchPreview?.patchText, patchDiff])

  async function load(selectProjectId) {
    setLoading(true)
    setError('')
    try {
      const result = await listProjects(username)
      setItems(result.items || [])
      const nextId = selectProjectId || activeProjectId || result.items?.[0]?.project?.id || ''
      setActiveProjectId(nextId)
    } catch (nextError) {
      setError(nextError.message || '读取项目失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [username])

  useEffect(() => {
    setSettingsDraft({
      debounceMs: settings?.debounceMs || 3000,
      includeExtensions: (settings?.includeExtensions || []).join(' '),
      excludeGlobs: (settings?.excludeGlobs || []).join('\n')
    })
  }, [settings?.projectId, settings?.debounceMs, settings?.includeExtensions, settings?.excludeGlobs])

  async function chooseAndAddProject() {
    setError('')
    try {
      const rootPath = await window.electronAPI?.selectDirectory?.()
      if (!rootPath) return
      setBusy(true)
      const result = await addProject({ rootPath }, username)
      await load(result.project.id)
    } catch (nextError) {
      setError(nextError.message || '添加项目失败。')
    } finally {
      setBusy(false)
    }
  }

  async function rebuildIndex() {
    if (!project) return
    setBusy(true)
    setError('')
    try {
      await startProjectIndex(project.id, username)
      await load(project.id)
    } catch (nextError) {
      setError(nextError.message || '重建索引失败。')
    } finally {
      setBusy(false)
    }
  }

  async function pauseIndex() {
    if (!project) return
    await pauseProjectIndex(project.id, username)
    await load(project.id)
  }

  async function clearIndex() {
    if (!project) return
    setBusy(true)
    try {
      await clearProjectIndex(project.id, username)
      setSearchResults([])
      setAnswer(null)
      await load(project.id)
    } catch (nextError) {
      setError(nextError.message || '清空索引失败。')
    } finally {
      setBusy(false)
    }
  }

  async function deleteProject() {
    if (!project) return
    setBusy(true)
    try {
      await removeProject(project.id, username)
      setActiveProjectId('')
      setAnswer(null)
      setSearchResults([])
      setPatchPreview(null)
      setConfirmingPatch(false)
      await load('')
    } catch (nextError) {
      setError(nextError.message || '移除项目失败。')
    } finally {
      setBusy(false)
    }
  }

  async function updateSetting(patch) {
    if (!project) return
    setBusy(true)
    try {
      await updateProjectSettings(project.id, patch, username)
      await load(project.id)
    } catch (nextError) {
      setError(nextError.message || '更新设置失败。')
    } finally {
      setBusy(false)
    }
  }

  async function saveAdvancedSettings() {
    await updateSetting({
      debounceMs: Number(settingsDraft.debounceMs) || 3000,
      includeExtensions: settingsDraft.includeExtensions.split(/\s+/).map((item) => item.trim()).filter(Boolean),
      excludeGlobs: settingsDraft.excludeGlobs.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    })
  }

  async function submitQuestion(event) {
    event.preventDefault()
    if (!project || !question.trim()) return
    setBusy(true)
    setError('')
    try {
      const result = await askProject(project.id, question.trim(), username)
      setAnswer(result.result)
    } catch (nextError) {
      setError(nextError.message || '项目问答失败。')
    } finally {
      setBusy(false)
    }
  }

  async function submitSearch(event) {
    event.preventDefault()
    if (!project || !searchQuery.trim()) return
    setBusy(true)
    setError('')
    try {
      const result = await searchProject(project.id, searchQuery.trim(), username)
      setSearchResults(result.results || [])
    } catch (nextError) {
      setError(nextError.message || '项目搜索失败。')
    } finally {
      setBusy(false)
    }
  }

  async function searchReusableExperiences(event) {
    event.preventDefault()
    if (!project) return
    setBusy(true)
    setError('')
    try {
      const result = await matchProjectExperiences(project.id, { query: experienceQuery }, username)
      setMigrationMatches(result.items || [])
    } catch (nextError) {
      setError(nextError.message || 'Experience migration failed.')
    } finally {
      setBusy(false)
    }
  }

  async function refreshEmbedding() {
    if (!project) return
    setBusy(true)
    setError('')
    try {
      const result = await refreshProjectEmbedding(project.id, username)
      setEmbeddingStatus(result.status)
    } catch (nextError) {
      setError(nextError.message || 'Embedding refresh failed.')
    } finally {
      setBusy(false)
    }
  }

  async function previewPatch(event) {
    event.preventDefault()
    if (!project || !patchDiff.trim()) return
    setBusy(true)
    setError('')
    try {
      const result = await previewProjectPatch(project.id, {
        title: patchTitle.trim() || 'Patch draft',
        diff: patchDiff
      }, username)
      setPatchPreview(result.patch)
      setConfirmingPatch(false)
    } catch (nextError) {
      setError(nextError.message || 'Patch preview failed.')
    } finally {
      setBusy(false)
    }
  }

  async function previewDraftPatch(draft) {
    if (!project || !draft?.diff) return
    setBusy(true)
    setError('')
    try {
      setPatchTitle(draft.title || 'Patch draft')
      setPatchDiff(draft.diff)
      const result = await previewProjectPatch(project.id, {
        title: draft.title || 'Patch draft',
        summary: draft.summary,
        diff: draft.diff
      }, username)
      setPatchPreview(result.patch)
      setConfirmingPatch(false)
    } catch (nextError) {
      setError(nextError.message || 'Patch preview failed.')
    } finally {
      setBusy(false)
    }
  }

  async function applyPatch() {
    if (!project || !patchPreview?.id) return
    setBusy(true)
    setError('')
    try {
      const result = await applyProjectPatch(project.id, patchPreview.id, username)
      setPatchPreview(result.patch)
      setConfirmingPatch(false)
      await load(project.id)
    } catch (nextError) {
      setError(nextError.message || 'Patch apply failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">项目助手</h2>
          <p className="mt-1 text-xs text-slate-500">本地索引、项目画像和带来源的问答。</p>
        </div>
        <button
          type="button"
          onClick={chooseAndAddProject}
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <FolderPlus size={14} />
          添加项目
        </button>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">已授权项目</div>
          <button type="button" onClick={() => load(project?.id)} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="刷新">
            <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {items.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-xs text-slate-500">
            还没有项目。点击“添加项目”选择一个目录后会立即建立本地索引。
          </div>
        )}
        <div className="space-y-2">
          {items.map((item) => (
            <button
              key={item.project.id}
              type="button"
              onClick={() => setActiveProjectId(item.project.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left ${
                activeBundle?.project?.id === item.project.id
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="truncate text-sm font-medium text-slate-900">{item.project.name}</div>
              <div className="mt-1 truncate text-xs text-slate-500">{item.project.rootPath}</div>
            </button>
          ))}
        </div>
      </div>

      {project && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">{project.name}</div>
                <div className="mt-1 break-all text-xs text-slate-500">{project.rootPath}</div>
              </div>
              <button type="button" onClick={deleteProject} className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="移除项目记录">
                <Trash2 size={14} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-slate-500">语言</div>
                <div className="mt-1 font-medium text-slate-900">{profile?.language || '未确定'}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-slate-500">框架</div>
                <div className="mt-1 font-medium text-slate-900">{profile?.frameworks?.join(', ') || '未确定'}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-slate-500">启动</div>
                <div className="mt-1 break-words font-medium text-slate-900">{commandText(profile?.startCommands)}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-slate-500">测试</div>
                <div className="mt-1 break-words font-medium text-slate-900">{commandText(profile?.testCommands)}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Database size={15} />
                索引状态
              </div>
              <div className="text-xs text-slate-500">
                {indexStatus?.status || '未索引'} / {watcherStatus?.status || 'paused'} / {indexQueueStatus?.status || 'idle'}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="font-semibold text-slate-900">{indexStatus?.fileCount || 0}</div>
                <div className="mt-1 text-slate-500">文件</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="font-semibold text-slate-900">{indexStatus?.chunkCount || 0}</div>
                <div className="mt-1 text-slate-500">片段</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="font-semibold text-slate-900">{indexStatus?.failedFiles || 0}</div>
                <div className="mt-1 text-slate-500">失败</div>
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-500">最后更新：{formatTime(indexStatus?.lastIndexedAt || indexStatus?.updatedAt)}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={rebuildIndex} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                <Play size={14} />
                重建索引
              </button>
              <button type="button" onClick={pauseIndex} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                <Pause size={14} />
                暂停
              </button>
              <button type="button" onClick={clearIndex} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                <Trash2 size={14} />
                清空
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Settings2 size={15} />
              项目设置
            </div>
            <div className="mt-3 space-y-3">
              <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
                <span>自动监听</span>
                <input type="checkbox" checked={Boolean(settings?.watchEnabled)} onChange={(event) => updateSetting({ watchEnabled: event.target.checked })} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
                <span>语义增强</span>
                <input type="checkbox" checked={Boolean(settings?.embeddingEnabled)} onChange={(event) => updateSetting({ embeddingEnabled: event.target.checked })} />
              </label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <span>Embedding：{embeddingStatus?.status || (settings?.embeddingEnabled ? 'pending' : 'disabled')}</span>
                  <button
                    type="button"
                    onClick={refreshEmbedding}
                    disabled={busy}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] hover:bg-slate-50 disabled:opacity-50"
                  >
                    生成/检查
                  </button>
                </div>
                <div className="mt-1">候选片段：{embeddingStatus?.eligibleCount ?? '-'}；已生成：{embeddingStatus?.embeddingCount || 0}</div>
                <div className="mt-1">只处理 README、配置、入口文件和项目画像摘要。</div>
              </div>
              <label className="block text-xs text-slate-500">
                单文件上限
                <input
                  type="number"
                  min="1024"
                  value={settings?.maxFileBytes || 524288}
                  onChange={(event) => updateSetting({ maxFileBytes: Number(event.target.value) })}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
                />
                <span className="mt-1 block">当前：{formatBytes(settings?.maxFileBytes || 524288)}</span>
              </label>
              <label className="block text-xs text-slate-500">
                debounce 时间
                <input
                  type="number"
                  min="250"
                  value={settingsDraft.debounceMs}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, debounceMs: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
                />
              </label>
              <label className="block text-xs text-slate-500">
                文件类型白名单
                <textarea
                  rows={3}
                  value={settingsDraft.includeExtensions}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, includeExtensions: event.target.value }))}
                  className="mt-1 w-full resize-none rounded-md border border-slate-200 px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-blue-400"
                />
              </label>
              <label className="block text-xs text-slate-500">
                排除规则
                <textarea
                  rows={6}
                  value={settingsDraft.excludeGlobs}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, excludeGlobs: event.target.value }))}
                  className="mt-1 w-full resize-none rounded-md border border-slate-200 px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-blue-400"
                />
              </label>
              <button
                type="button"
                onClick={saveAdvancedSettings}
                disabled={busy}
                className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                保存索引规则
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <form onSubmit={submitQuestion}>
              <label className="block text-sm font-semibold text-slate-900">
                项目问答
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={3}
                  placeholder="这个项目怎么启动？登录逻辑在哪里？"
                  className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400"
                />
              </label>
              <button type="submit" disabled={busy || !question.trim()} className="mt-2 inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                <MessageSquareText size={14} />
                提问
              </button>
            </form>
            {answer && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm text-slate-800">{answer.answer}</div>
                <div className="mt-2 text-xs text-slate-500">置信度：{answer.confidence}</div>
                <div className="mt-3">
                  <Sources citations={answer.citations} />
                </div>
                {answer.patchDrafts?.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {answer.patchDrafts.map((draft) => (
                      <div key={draft.id} className="rounded-lg border border-blue-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">{draft.title}</div>
                            <div className="mt-1 text-xs text-slate-500">{draft.summary}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => previewDraftPatch(draft)}
                            disabled={busy}
                            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                          >
                            <FileDiff size={14} />
                            预览风险
                          </button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(draft.affectedFiles || []).map((file) => (
                            <span key={file.path} className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                              {file.path} / {file.changeType}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2">
                          <Sources citations={draft.citations} />
                        </div>
                        <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">{draft.diff}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <form onSubmit={submitSearch} className="flex gap-2">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索 login、api、vite..."
                className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
              <button type="submit" disabled={busy || !searchQuery.trim()} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <Search size={14} />
                搜索
              </button>
            </form>
            <div className="mt-3 space-y-2">
              {searchResults.map((result, index) => (
                <div key={`${result.path}-${result.lineStart}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs font-medium text-slate-900">{result.path}:{result.lineStart}-{result.lineEnd}</div>
                  <div className="mt-1 line-clamp-3 text-xs leading-5 text-slate-600">{result.textPreview}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <form onSubmit={previewPatch}>
              <label className="block text-sm font-semibold text-slate-900">
                Patch 草稿
                <input
                  value={patchTitle}
                  onChange={(event) => setPatchTitle(event.target.value)}
                  placeholder="修改摘要"
                  className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
              </label>
              <textarea
                value={patchDiff}
                onChange={(event) => setPatchDiff(event.target.value)}
                rows={8}
                placeholder={'diff --git a/path b/path\n--- a/path\n+++ b/path\n@@ -1 +1 @@\n-old\n+new'}
                className="mt-2 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-blue-400"
              />
              <button type="submit" disabled={busy || !patchDiff.trim()} className="mt-2 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                预览风险
              </button>
            </form>

            {patchPreview && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{patchPreview.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      状态：{patchPreview.status} / 风险：{patchPreview.riskLevel}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmingPatch(true)}
                    disabled={busy || patchPreview.status === 'blocked' || patchPreview.status === 'applied'}
                    className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
                  >
                    打开确认
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {(patchPreview.affectedFiles || []).map((file) => (
                    <div key={file.path} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs">
                      <span className="font-medium text-slate-900">{file.path}</span>
                      <span className="ml-2 text-slate-500">{file.changeType} / {file.riskLevel}</span>
                    </div>
                  ))}
                  {(patchPreview.blocked || []).map((file) => (
                    <div key={`${file.path}-${file.reason}`} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {file.path}: {file.message || file.reason}
                    </div>
                  ))}
                  {(patchPreview.conflicts || []).map((file) => (
                    <div key={`${file.path}-${file.reason}`} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {file.path}: {file.message || file.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <form onSubmit={searchReusableExperiences} className="flex gap-2">
              <input
                value={experienceQuery}
                onChange={(event) => setExperienceQuery(event.target.value)}
                placeholder="搜索可迁移经验：flask、ModuleNotFoundError..."
                className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
              <button type="submit" disabled={busy} className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                匹配经验
              </button>
            </form>
            <div className="mt-3 space-y-2">
              {migrationMatches.map((match) => (
                <div key={match.experienceId} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">{match.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{match.reuseLevel} / {match.similarity}</div>
                    </div>
                    <span className={`rounded px-2 py-1 text-[11px] ${match.activeRecommendation ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {match.activeRecommendation ? '推荐' : '仅搜索'}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">{match.recommendation}</div>
                  {match.samePoints?.length > 0 && <div className="mt-1 text-xs text-slate-500">相同点：{match.samePoints.join(', ')}</div>}
                  {match.differences?.length > 0 && <div className="mt-1 text-xs text-slate-500">差异：{match.differences.join(', ')}</div>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {confirmingPatch && patchPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <AlertTriangle size={15} className="text-amber-600" />
                  确认应用补丁
                </div>
                <div className="mt-1 truncate text-xs text-slate-500">{patchPreview.title}</div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmingPatch(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                title="关闭"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto px-4 py-3">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-50 p-2">
                  <div className="font-semibold text-slate-900">{patchStats.files || (patchPreview.affectedFiles || []).length}</div>
                  <div className="mt-1 text-slate-500">文件</div>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2">
                  <div className="font-semibold text-emerald-700">+{patchStats.added}</div>
                  <div className="mt-1 text-emerald-700">新增行</div>
                </div>
                <div className="rounded-lg bg-rose-50 p-2">
                  <div className="font-semibold text-rose-700">-{patchStats.removed}</div>
                  <div className="mt-1 text-rose-700">删除行</div>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                状态：{patchPreview.status} / 风险：{patchPreview.riskLevel}
              </div>

              <div className="mt-3 space-y-2">
                {(patchPreview.affectedFiles || []).map((file) => (
                  <div key={file.path} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-xs">
                    <span className="min-w-0 truncate font-medium text-slate-900">{file.path}</span>
                    <span className="shrink-0 text-slate-500">{file.changeType} / {file.riskLevel}</span>
                  </div>
                ))}
              </div>

              {(patchPreview.blocked || []).length > 0 && (
                <div className="mt-3 space-y-2">
                  {(patchPreview.blocked || []).map((file) => (
                    <div key={`${file.path}-${file.reason}`} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {file.path}: {file.message || file.reason}
                    </div>
                  ))}
                </div>
              )}

              {(patchPreview.conflicts || []).length > 0 && (
                <div className="mt-3 space-y-2">
                  {(patchPreview.conflicts || []).map((file) => (
                    <div key={`${file.path}-${file.reason}`} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {file.path}: {file.message || file.reason}
                    </div>
                  ))}
                </div>
              )}

              <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">{patchPreview.patchText || patchDiff}</pre>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={() => setConfirmingPatch(false)}
                className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={applyPatch}
                disabled={busy || patchPreview.status === 'blocked' || patchPreview.status === 'applied'}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
              >
                <CheckCircle2 size={14} />
                应用补丁
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
