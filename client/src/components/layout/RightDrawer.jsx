import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import SettingsPanel from '../../panels/SettingsPanel.jsx'
import RuntimeStatusPanel from '../../panels/RuntimeStatusPanel.jsx'
import ControlCenterPanel from '../../panels/ControlCenterPanel.jsx'
import LogsPanel from '../../panels/LogsPanel.jsx'
import RunOutputsPanel from '../../panels/RunOutputsPanel.jsx'

export default function RightDrawer({ view, onClose }) {
  const [activeTab, setActiveTab] = useState(view || 'control')

  const tabs = [
    { id: 'control', label: '控制' },
    { id: 'runtime', label: '运行时' },
    { id: 'logs', label: '日志' },
    { id: 'outputs', label: '输出' },
    { id: 'settings', label: '设置' }
  ]

  useEffect(() => {
    if (view) setActiveTab(view)
  }, [view])

  if (!view) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-10" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-[400px] max-w-[calc(100vw-24px)] bg-[color:var(--bg-primary)] border-l border-[color:var(--border)] z-20 shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-[color:var(--bg-primary)] border-b border-[color:var(--border)] z-10">
          <div className="h-14 px-4 flex items-center justify-between">
            <span className="font-medium">AionUi</span>
            <button type="button" onClick={onClose} className="p-1 rounded hover:bg-[color:var(--bg-tertiary)]" aria-label="关闭抽屉" title="关闭">
              <X size={16} />
            </button>
          </div>
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
            {tabs.map(tab => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`h-8 px-3 rounded-md text-sm border whitespace-nowrap ${activeTab === tab.id ? 'border-[color:var(--accent)] bg-[color:var(--bg-tertiary)] text-[color:var(--text-primary)]' : 'border-[color:var(--border)] text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)]'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {activeTab === 'control' && <ControlCenterPanel />}
        {activeTab === 'runtime' && <RuntimeStatusPanel />}
        {activeTab === 'logs' && <LogsPanel />}
        {activeTab === 'outputs' && <RunOutputsPanel />}
        {activeTab === 'settings' && <SettingsPanel />}
      </aside>
    </>
  )
}
