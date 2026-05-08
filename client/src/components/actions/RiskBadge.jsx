const CLASSES = {
  low: 'border-[color:var(--success)] text-[color:var(--success)]',
  medium: 'border-[color:var(--accent)] text-[color:var(--accent)]',
  high: 'border-[color:var(--warning)] text-[color:var(--warning)]',
  blocked: 'border-[color:var(--error)] text-[color:var(--error)]'
}

export default function RiskBadge({ risk }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${CLASSES[risk] || CLASSES.medium}`}>{risk || 'medium'}</span>
}
