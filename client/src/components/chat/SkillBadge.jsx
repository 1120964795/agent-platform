import { BookOpenCheck } from 'lucide-react'

export default function SkillBadge({ name }) {
  return (
    <div className="my-2 flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
      <span className="inline-flex items-center gap-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-2 py-1">
        <BookOpenCheck size={13} className="text-[color:var(--accent)]" />
        已加载技能：{name}
      </span>
    </div>
  )
}
