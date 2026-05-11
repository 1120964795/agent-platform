import { useEffect, useState } from 'react'

export default function BridgeStatusBar({ onNavigateToSettings }) {
  const [bridges, setBridges] = useState({})

  useEffect(() => {
    let active = true
    async function poll() {
      try {
        const result = await window.electronAPI?.invoke('bridge:status')
        if (active && result?.bridges) setBridges(result.bridges)
      } catch {
        // Ignore in browser-only dev sessions.
      }
    }
    poll()
    const timer = setInterval(poll, 5000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  const entries = [
    { key: 'browserUse', label: '浏览器自动化' },
    { key: 'uitars', label: 'UI-TARS' },
  ]

  return (
    <div className="h-7 flex items-center gap-4 px-3 border-t border-[color:var(--border)] bg-[color:var(--bg-secondary)] text-xs text-[color:var(--text-muted)]">
      {entries.map(({ key, label }) => {
        const b = bridges[key] || {}
        const running = b.state === 'running'
        const failed = b.state === 'failed'
        const lastError = b.lastError || b.diagnostics?.lastError || ''
        const dotColor = running ? 'bg-[color:var(--success)]' : failed ? 'bg-red-500' : 'bg-amber-500'
        const textColor = running ? 'text-[color:var(--success)]' : failed ? 'text-red-500' : 'text-amber-500'
        const label2 = running ? '运行中' : failed ? '失败，点击查看详情' : '...'

        return (
          <button
            key={key}
            type="button"
            onClick={() => failed && onNavigateToSettings?.('runtime')}
            className={`flex items-center gap-1 hover:opacity-80 ${failed ? 'cursor-pointer' : 'cursor-default'}`}
            title={failed ? `${label}：${lastError || '失败'}` : `${label}：${label2}`}
          >
            <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
            <span>{label}:</span>
            <span className={textColor}>{label2}</span>
          </button>
        )
      })}
    </div>
  )
}
