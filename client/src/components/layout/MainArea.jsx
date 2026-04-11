import TopBar from './TopBar.jsx'

export default function MainArea({ onOpenDrawer }) {
  return (
    <main className="flex-1 flex flex-col min-w-0">
      <TopBar onOpenDrawer={onOpenDrawer} />
      <section className="flex-1 flex items-center justify-center bg-[color:var(--bg-primary)]">
        <div className="text-sm text-[color:var(--text-muted)]">ChatArea 将在 Task 0.15 实现</div>
      </section>
    </main>
  )
}
