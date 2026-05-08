import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Folder, FileText, File, Home, ArrowUp, RefreshCw, HardDrive } from 'lucide-react'
import { listFiles } from '../lib/api.js'

const EXT_ICONS = {
  '.docx': FileText,
  '.doc': FileText,
  '.pptx': FileText,
  '.ppt': FileText,
  '.pdf': FileText,
  '.txt': FileText,
  '.md': FileText
}

function getStartDir() {
  if (window.electronAPI?.getPaths) {
    return window.electronAPI.getPaths().then(p => p.documents || p.home || 'C:\\')
  }
  return Promise.resolve('C:\\')
}

export default function FileBrowser() {
  const [currentDir, setCurrentDir] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadDir = useCallback(async (dir) => {
    setLoading(true)
    setError('')
    try {
      const r = await listFiles(dir)
      setItems(r.items || [])
      setCurrentDir(dir)
    } catch (e) {
      setError(e.message || '无法读取目录')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    getStartDir().then(dir => loadDir(dir))
  }, [loadDir])

  function handleNavigate(dirPath) {
    loadDir(dirPath)
  }

  function handleUp() {
    const parent = currentDir.replace(/[\\/][^\\/]+[\\/]?$/, '')
    if (parent && parent !== currentDir) {
      loadDir(parent)
    }
  }

  function handleSelectFile(item) {
    if (item.isDirectory) {
      loadDir(item.path)
      return
    }
    window.dispatchEvent(new CustomEvent('agentdev:file-selected', { detail: { path: item.path, name: item.name } }))
  }

  function formatSize(size) {
    if (size == null) return ''
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  const pathParts = currentDir.split(/[\\/]/).filter(Boolean)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">文件浏览</h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={handleUp} className="p-1.5 rounded hover:bg-[color:var(--bg-tertiary)]" title="上级目录">
            <ArrowUp size={14} />
          </button>
          <button type="button" onClick={() => loadDir(currentDir)} className="p-1.5 rounded hover:bg-[color:var(--bg-tertiary)]" title="刷新">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex gap-1 flex-wrap">
        {['C:\\', 'D:\\'].map(d => (
          <button key={d} type="button" onClick={() => handleNavigate(d)} className="h-7 px-2 text-xs rounded border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)] flex items-center gap-1">
            <HardDrive size={10} /> {d}
          </button>
        ))}
        <button type="button" onClick={() => getStartDir().then(d => handleNavigate(d))} className="h-7 px-2 text-xs rounded border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)] flex items-center gap-1">
          <Home size={10} /> 文档
        </button>
      </div>

      <div className="text-xs text-[color:var(--text-muted)] flex items-center gap-0.5 flex-wrap overflow-hidden">
        {pathParts.map((part, i) => {
          const fullPath = pathParts.slice(0, i + 1).join('\\')
          const display = i === 0 ? part + '\\' : part
          return (
            <span key={i} className="flex items-center gap-0.5 shrink-0">
              {i > 0 && <ChevronRight size={10} />}
              <button type="button" onClick={() => handleNavigate(fullPath + (i === 0 ? '\\' : ''))} className="hover:text-[color:var(--accent)] hover:underline truncate max-w-[120px]" title={fullPath}>
                {display}
              </button>
            </span>
          )
        })}
      </div>

      {error && <div className="text-xs text-[color:var(--error)] py-2">{error}</div>}

      <div className="space-y-0.5 max-h-[calc(100vh-300px)] overflow-y-auto">
        {items.length === 0 && !loading && !error && (
          <div className="text-xs text-[color:var(--text-muted)] py-8 text-center">空目录</div>
        )}
        {items.map(item => {
          const IconComp = item.isDirectory ? Folder : (EXT_ICONS[item.ext] || File)
          const iconColor = item.isDirectory ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-muted)]'
          return (
            <button key={item.path} type="button" onClick={() => handleSelectFile(item)} className="w-full text-left px-2 py-1.5 rounded hover:bg-[color:var(--bg-tertiary)] flex items-center gap-2 group">
              <IconComp size={14} className={`shrink-0 ${iconColor}`} />
              <span className="flex-1 min-w-0 text-sm truncate">{item.name}</span>
              {!item.isDirectory && item.size != null && (
                <span className="text-xs text-[color:var(--text-muted)] shrink-0">{formatSize(item.size)}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="text-xs text-[color:var(--text-muted)] pt-2 border-t border-[color:var(--border)]">
        点击文件可将路径插入到输入框中
      </div>
    </div>
  )
}
