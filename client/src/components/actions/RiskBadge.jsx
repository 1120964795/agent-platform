const CLASSES = {
  low: 'border-[color:var(--success)] text-[color:var(--success)]',
  medium: 'border-[color:var(--accent)] text-[color:var(--accent)]',
  high: 'border-[color:var(--warning)] text-[color:var(--warning)]',
  blocked: 'border-[color:var(--error)] text-[color:var(--error)]'
}

const LABELS = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  blocked: '已阻止'
}

export default function RiskBadge({ risk }) {
  const level = risk || 'medium'
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${CLASSES[level] || CLASSES.medium}`}>{LABELS[level] || '中风险'}</span>
}
