import ActionCard from './ActionCard.jsx'

export default function ActionConfirmModal({ action, onApprove, onDeny, onClose }) {
  if (!action) return null
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">确认动作</h2>
          <button type="button" onClick={onClose} className="text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]">关闭</button>
        </div>
        <ActionCard action={action} onApprove={onApprove} onDeny={onDeny} />
      </div>
    </div>
  )
}
