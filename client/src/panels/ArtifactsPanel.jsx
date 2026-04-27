import { useEffect, useState, useCallback } from 'react'
import { FileCode, FileText, Presentation, RefreshCw } from 'lucide-react'
import { api, openFile } from '../lib/api.js'

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
          return (
            <button
              key={artifact.id || artifact.path || artifact.filename}
              type="button"
              onClick={() => handleOpen(artifact)}
              className="w-full text-left p-3 border border-[color:var(--border)] rounded-lg hover:bg-[color:var(--bg-tertiary)] flex gap-3"
            >
              <Icon size={16} className="text-[color:var(--accent)] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{artifact.title || artifact.filename || '未命名文件'}</div>
                <div className="text-xs text-[color:var(--text-muted)] truncate">{artifact.filename || artifact.path}</div>
                {formatTime(artifact.createdAt) && (
                  <div className="text-xs text-[color:var(--text-muted)]">{formatTime(artifact.createdAt)}</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
