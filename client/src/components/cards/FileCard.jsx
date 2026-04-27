import { useState } from 'react'
import { Download, ExternalLink, FileCode, FileText, Presentation } from 'lucide-react'
import { openFile, saveFileAs } from '../../lib/api.js'

const ICONS = {
  word: FileText,
  ppt: Presentation,
  schedule: FileCode,
  file: FileText
}

function formatSize(size) {
  const bytes = Number(size)
  if (!Number.isFinite(bytes) || bytes <= 0) return '大小未知'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function FileCard({ artifact, onError }) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  if (!artifact) return null

  const Icon = ICONS[artifact.type] || FileText

  async function handleOpen() {
    if (!artifact.path) return
    try {
      await openFile(artifact.path)
    } catch (error) {
      onError?.(error)
    }
  }

  async function handleSaveAs() {
    if (!artifact.path || saving) return
    setSaving(true)
    setMessage('')
    try {
      const result = await saveFileAs({
        sourcePath: artifact.path,
        defaultPath: artifact.filename || artifact.title || undefined
      })
      if (result.canceled) return
      setMessage('已保存')
    } catch (error) {
      setMessage('保存失败')
      onError?.(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="my-3 max-w-[680px] border border-[color:var(--border)] rounded-lg bg-[color:var(--bg-primary)] p-3 flex items-center gap-3 shadow-sm hover:shadow-md hover:border-[color:var(--accent)] transition">
      <div className="w-10 h-10 rounded-lg bg-[color:var(--bg-tertiary)] flex items-center justify-center shrink-0">
        <Icon size={18} className="text-[color:var(--accent)]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{artifact.filename || artifact.title || '未命名文件'}</div>
        <div className="text-xs text-[color:var(--text-muted)] truncate">
          {formatSize(artifact.size)}
          {artifact.title ? ` · ${artifact.title}` : ''}
        </div>
        {message && (
          <div className={`mt-1 text-xs ${message === '已保存' ? 'text-[color:var(--success)]' : 'text-[color:var(--error)]'}`}>
            {message}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={handleOpen}
          disabled={!artifact.path}
          className="h-8 rounded-md border border-[color:var(--border)] px-3 text-xs flex items-center gap-1 hover:bg-[color:var(--bg-tertiary)] disabled:opacity-50"
        >
          <ExternalLink size={13} />
          打开
        </button>
        <button
          type="button"
          onClick={handleSaveAs}
          disabled={!artifact.path || saving}
          className="h-8 rounded-md bg-[color:var(--accent)] px-3 text-xs text-white flex items-center gap-1 disabled:opacity-50"
        >
          <Download size={13} />
          {saving ? '保存中' : '另存为'}
        </button>
      </div>
    </div>
  )
}
