export default function SetupGuide({ guidance }) {
  if (!guidance) return null
  return (
    <div className="mt-3 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] p-3">
      <div className="text-sm font-medium">{guidance.title || '设置指引'}</div>
      <ol className="mt-2 list-decimal pl-4 text-xs leading-5 text-[color:var(--text-muted)]">
        {(guidance.steps || []).map((step) => <li key={step}>{step}</li>)}
      </ol>
    </div>
  )
}
