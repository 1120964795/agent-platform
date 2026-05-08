import { useEffect, useState, useCallback } from 'react'
import { ExternalLink, FileCode, FileText, Presentation, RefreshCw, Trash2 } from 'lucide-react'
import { api, deleteArtifact, openFile } from '../lib/api.js'

const ICONS = {
  word: FileText,
  ppt: Presentation,
  schedule: FileCode,
  file: FileText
}

function mergeArtifact(items, artifact) {
  if (!artifact) return items
  const key = artifact.id || artifact.path || artifact.filename
  return [
    artifact,
    ...items.filter(item => {
      const itemKey = item.id || item.path || item.filename
      return itemKey !== key
    })
  ]
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN')
}

export default function ArtifactsPanel({ currentUser }) {
  const username = currentUser?.username || 'guest'
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api.invoke('artifacts:list', { username })
      setItems(result.items || [])
    } catch (e) {
      setError(e.message || '读取产物列表失败')
    } finally {
      setLoading(false)
    }
  }, [username])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    function handleArtifactCreated(event) {
      if (event.detail?.username !== username) return
      setItems(current => mergeArtifact(current, event.detail))
    }

    window.addEventListener('agentdev:artifact-created', handleArtifactCreated)
    return () => window.removeEventListener('agentdev:artifact-created', handleArtifactCreated)
  }, [username])

  async function handleOpen(artifact) {
    if (!artifact?.path) return
    try {
      await openFile(artifact.path)
    } catch (e) {
      setError('打开失败: ' + (e.message || '未知错误'))
    }
  }

  async function handleDelete(artifact) {
    if (!artifact?.id || deletingId) return
    const filename = artifact.filename || artifact.title || artifact.path || '该产物'
    if (!window.confirm(`删除 ${filename}？\n\n这会同时删除本地文件和产物记录。`)) return
    setDeletingId(artifact.id)
    setError('')
    try {
      await deleteArtifact(artifact.id, username, true)
      setItems(current => current.filter(item => item.id !== artifact.id))
    } catch (e) {
      setError('删除失败: ' + (e.message || '未知错误'))
    } finally {
      setDeletingId('')
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">已生成文件</h2>
        <button
          type="button"
          onClick={load}
          className="p-1 rounded hover:bg-[color:var(--bg-tertiary)]"
          aria-label="刷新产物"
          title="刷新产物"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <div className="text-xs text-[color:var(--error)]">{error}</div>}

      {items.length === 0 && !loading && (
        <div className="text-xs text-[color:var(--text-muted)] py-8 text-center">暂无文件</div>
      )}

      <div className="space-y-2">
        {items.map(artifact => {
          const Icon = ICONS[artifact.type] || FileText
          const isDeleting = deletingId === artifact.id
          return (
            <div
              key={artifact.id || artifact.path || artifact.filename}
              className="w-full rounded-lg border border-[color:var(--border)] p-3 hover:bg-[color:var(--bg-tertiary)]"
            >
              <div className="flex gap-3">
                <Icon size={16} className="mt-0.5 shrink-0 text-[color:var(--accent)]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{artifact.title || artifact.filename || '未命名文件'}</div>
                  <div className="truncate text-xs text-[color:var(--text-muted)]">{artifact.path || artifact.filename}</div>
                  {formatTime(artifact.createdAt) && (
                    <div className="text-xs text-[color:var(--text-muted)]">{formatTime(artifact.createdAt)}</div>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => handleOpen(artifact)}
                  disabled={!artifact.path}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-primary)] disabled:opacity-50"
                >
                  <ExternalLink size={13} />
                  打开
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(artifact)}
                  disabled={!artifact.id || Boolean(deletingId)}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-rose-200 px-2 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 size={13} />
                  {isDeleting ? '删除中' : '删除'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
