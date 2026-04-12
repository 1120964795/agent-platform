import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import SettingsPanel from '../../panels/SettingsPanel.jsx'
import ArtifactsPanel from '../../panels/ArtifactsPanel.jsx'
import FileBrowser from '../../panels/FileBrowser.jsx'

function usePermissionMode() {
  const [mode, setMode] = useState(() => localStorage.getItem('agentdev-permission-mode') || 'default')

  useEffect(() => {
    function handleChange(e) {
      setMode(e.detail?.mode || 'default')
    }
    window.addEventListener('agentdev:permission-changed', handleChange)
    return () => window.removeEventListener('agentdev:permission-changed', handleChange)
  }, [])

  return mode
}

export default function RightDrawer({ view, onClose }) {
  const permissionMode = usePermissionMode()
  const [activeTab, setActiveTab] = useState(view || 'settings')

  const tabs = [
    { id: 'settings', label: '设置' },
    ...(permissionMode === 'full' ? [{ id: 'files', label: '文件' }] : []),
    { id: 'artifacts', label: '产物' }
  ]

  useEffect(() => {
    if (view) setActiveTab(view)
  }, [view])

  // 如果切到了 files tab 但权限被关闭了，回退到 settings
  useEffect(() => {
    if (activeTab === 'files' && permissionMode !== 'full') {
      setActiveTab('settings')
    }
  }, [permissionMode, activeTab])

  if (!view) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-10" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-[360px] bg-[color:var(--bg-primary)] border-l border-[color:var(--border)] z-20 shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-[color:var(--bg-primary)] border-b border-[color:var(--border)] z-10">
          <div className="h-14 px-4 flex items-center justify-between">
            <span className="font-medium">侧边面板</span>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-[color:var(--bg-tertiary)]"
              aria-label="close drawer"
            >
              <X size={16} />
            </button>
          </div>
          <div className="px-4 pb-3 flex gap-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`h-8 px-3 rounded-md text-sm border ${
                  activeTab === tab.id
                    ? 'border-[color:var(--accent)] bg-[color:var(--bg-tertiary)] text-[color:var(--text-primary)]'
                    : 'border-[color:var(--border)] text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {activeTab === 'settings' && <SettingsPanel />}
        {activeTab === 'files' && permissionMode === 'full' && <FileBrowser />}
        {activeTab === 'artifacts' && <ArtifactsPanel />}
      </aside>
    </>
  )
}
