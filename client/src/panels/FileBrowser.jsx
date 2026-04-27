import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Folder, FileText, File, Home, ArrowUp, RefreshCw, HardDrive, Download, Monitor } from 'lucide-react'
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

async function getAppPaths() {
  if (window.electronAPI?.getPaths) {
    return window.electronAPI.getPaths()
  }
  return { home: '', documents: '', downloads: '', desktop: '', roots: [] }
}

function normalizeKey(path) {
  return String(path || '').replace(/[\\/]+$/, '').toLowerCase()
}

function buildShortcuts(paths = {}, roots = []) {
  const seen = new Set()
  const add = (items, item) => {
    if (!item.path) return
    const key = normalizeKey(item.path)
    if (seen.has(key)) return
    seen.add(key)
    items.push(item)
  }

  const items = []
  add(items, { id: 'documents', label: '文档', path: paths.documents, icon: Folder })
  add(items, { id: 'downloads', label: '下载', path: paths.downloads, icon: Download })
  add(items, { id: 'desktop', label: '桌面', path: paths.desktop, icon: Monitor })
  add(items, { id: 'home', label: '主目录', path: paths.home, icon: Home })

  roots.forEach(root => {
    add(items, { id: `root:${root}`, label: root, path: root, icon: HardDrive })
  })

  return items
}

export default function FileBrowser({ currentUser }) {
  const username = currentUser?.username || 'guest'
  const [currentDir, setCurrentDir] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [parentDir, setParentDir] = useState(null)
  const [breadcrumbs, setBreadcrumbs] = useState([])
  const [shortcuts, setShortcuts] = useState([])

  const loadDir = useCallback(async (dir) => {
    if (!dir) return
    setLoading(true)
    setError('')
    try {
      const r = await listFiles(dir, username)
      setItems(r.items || [])
      setCurrentDir(r.dir || dir)
      setParentDir(r.parentDir || null)
      setBreadcrumbs(r.breadcrumbs || [])
      setShortcuts(current => current.length ? current : buildShortcuts({}, r.roots || []))
    } catch (e) {
      setError(e.message || '无法读取目录')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [username])

  useEffect(() => {
    let ignored = false

    async function loadInitialDir() {
      const paths = await getAppPaths()
      if (ignored) return
      const roots = paths.roots || []
      setShortcuts(buildShortcuts(paths, roots))
      loadDir(paths.documents || paths.home || roots[0] || '')
    }

    loadInitialDir().catch(error => {
      console.error('[files] load initial directory failed:', error)
      setError(error.message || '无法读取目录')
    })

    return () => { ignored = true }
  }, [loadDir])

  function handleNavigate(dirPath) {
    loadDir(dirPath)
  }

  function handleUp() {
    if (parentDir) loadDir(parentDir)
  }

  function handleSelectFile(item) {
    if (item.isDirectory) {
      loadDir(item.path)
      return
    }
    // 广播选中文件事件，InputBar 监听并插入路径
    window.dispatchEvent(new CustomEvent('agentdev:file-selected', { detail: { path: item.path, name: item.name } }))
  }

  function formatSize(size) {
    if (size == null) return ''
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">文件浏览</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleUp}
            disabled={!parentDir}
            className="p-1.5 rounded hover:bg-[color:var(--bg-tertiary)] disabled:opacity-40"
            title="上级目录"
          >
            <ArrowUp size={14} />
          </button>
          <button type="button" onClick={() => loadDir(currentDir)} className="p-1.5 rounded hover:bg-[color:var(--bg-tertiary)]" title="刷新">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 快捷位置 */}
      <div className="flex gap-1 flex-wrap">
        {shortcuts.map(shortcut => {
          const ShortcutIcon = shortcut.icon
          return (
          <button
            key={shortcut.id}
            type="button"
            onClick={() => handleNavigate(shortcut.path)}
            className="h-7 px-2 text-xs rounded border border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)] flex items-center gap-1"
            title={shortcut.path}
          >
            <ShortcutIcon size={10} /> {shortcut.label}
          </button>
          )
        })}
      </div>

      {/* 面包屑路径 */}
      <div className="text-xs text-[color:var(--text-muted)] flex items-center gap-0.5 flex-wrap overflow-hidden">
        {breadcrumbs.length === 0 && currentDir && (
          <span className="truncate" title={currentDir}>{currentDir}</span>
        )}
        {breadcrumbs.map((part, i) => {
          return (
            <span key={`${part.path}-${i}`} className="flex items-center gap-0.5 shrink-0">
              {i > 0 && <ChevronRight size={10} />}
              <button
                type="button"
                onClick={() => handleNavigate(part.path)}
                className="hover:text-[color:var(--accent)] hover:underline truncate max-w-[120px]"
                title={part.path}
              >
                {part.label}
              </button>
            </span>
          )
        })}
      </div>

      {error && <div className="text-xs text-[color:var(--error)] py-2">{error}</div>}

      {/* 文件列表 */}
      <div className="space-y-0.5 max-h-[calc(100vh-300px)] overflow-y-auto">
        {items.length === 0 && !loading && !error && (
          <div className="text-xs text-[color:var(--text-muted)] py-8 text-center">空目录</div>
        )}
        {items.map(item => {
          const IconComp = item.isDirectory ? Folder : (EXT_ICONS[item.ext] || File)
          const iconColor = item.isDirectory ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-muted)]'
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => handleSelectFile(item)}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-[color:var(--bg-tertiary)] flex items-center gap-2 group"
            >
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
