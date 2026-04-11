import { useState } from 'react'
import Sidebar from './Sidebar.jsx'
import MainArea from './MainArea.jsx'
import RightDrawer from './RightDrawer.jsx'

export default function Layout({ selectedAssistant, onSelectAssistant }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(null)

  return (
    <div className="flex h-full w-full bg-[color:var(--bg-primary)] text-[color:var(--text-primary)]">
      <Sidebar
        collapsed={sidebarCollapsed}
        selectedAssistant={selectedAssistant}
        onToggle={() => setSidebarCollapsed(v => !v)}
        onSelectAssistant={onSelectAssistant}
        onOpenDrawer={setDrawer}
      />
      <MainArea selectedAssistant={selectedAssistant} onOpenDrawer={setDrawer} />
      <RightDrawer view={drawer} onClose={() => setDrawer(null)} />
    </div>
  )
}
