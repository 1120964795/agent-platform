import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import SettingsPanel from '../../panels/SettingsPanel.jsx'
import ArtifactsPanel from '../../panels/ArtifactsPanel.jsx'
import FileBrowser from '../../panels/FileBrowser.jsx'
import DiagnosticsPanel from '../../panels/DiagnosticsPanel.jsx'
import ExperienceLibraryPanel from '../../panels/ExperienceLibraryPanel.jsx'
import ProjectAssistantPanel from '../../panels/ProjectAssistantPanel.jsx'

function permissionModeKey(username) {
  return `agentdev-permission-mode:${username || 'guest'}`
}

function usePermissionMode(currentUser) {
  const username = currentUser?.username || 'guest'
  const [mode, setMode] = useState(() => localStorage.getItem(permissionModeKey(username)) || 'default')

  useEffect(() => {
    setMode(localStorage.getItem(permissionModeKey(username)) || 'default')
  }, [username])

  useEffect(() => {
    function handleChange(event) {
      if (event.detail?.username && event.detail.username !== username) return
      setMode(event.detail?.mode || 'default')
    }
    window.addEventListener('agentdev:permission-changed', handleChange)
    return () => window.removeEventListener('agentdev:permission-changed', handleChange)
  }, [username])

  return mode
}

export default function RightDrawer({ view, onClose, currentUser, diagnosticsState }) {
  const permissionMode = usePermissionMode(currentUser)
  const [activeTab, setActiveTab] = useState(view || 'settings')

  const tabs = [
    { id: 'projects', label: '项目' },
    { id: 'diagnostics', label: '诊断' },
    { id: 'experiences', label: '经验' },
    { id: 'settings', label: '设置' },
    ...(permissionMode === 'full' ? [{ id: 'files', label: '文件' }] : []),
    { id: 'artifacts', label: '产物' }
  ]

  useEffect(() => {
    if (view) setActiveTab(view)
  }, [view])

  useEffect(() => {
    if (activeTab === 'files' && permissionMode !== 'full') {
      setActiveTab('settings')
    }
  }, [permissionMode, activeTab])

  if (!view) return null

  return (
    <>
      <div className="fixed inset-0 z-10 bg-black/20" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-20 h-full w-[420px] overflow-y-auto border-l border-[color:var(--border)] bg-[color:var(--bg-primary)] shadow-xl">
        <div className="sticky top-0 z-10 border-b border-[color:var(--border)] bg-[color:var(--bg-primary)]">
          <div className="flex h-14 items-center justify-between px-4">
            <span className="font-medium">侧边面板</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 hover:bg-[color:var(--bg-tertiary)]"
              aria-label="关闭侧边面板"
              title="关闭侧边面板"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 px-4 pb-3">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`h-8 rounded-md border px-3 text-sm ${
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
        {activeTab === 'projects' && <ProjectAssistantPanel currentUser={currentUser} />}
        {activeTab === 'diagnostics' && <DiagnosticsPanel currentUser={currentUser} diagnosticsState={diagnosticsState} />}
        {activeTab === 'experiences' && <ExperienceLibraryPanel currentUser={currentUser} diagnosticsState={diagnosticsState} />}
        {activeTab === 'settings' && <SettingsPanel currentUser={currentUser} />}
        {activeTab === 'files' && permissionMode === 'full' && <FileBrowser currentUser={currentUser} />}
        {activeTab === 'artifacts' && <ArtifactsPanel currentUser={currentUser} />}
      </aside>
    </>
  )
}
