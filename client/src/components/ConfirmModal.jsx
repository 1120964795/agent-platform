export default function ConfirmModal({ open, title = '确认操作', detail, onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
      <div className="w-full max-w-md rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-primary)] p-4 shadow-xl">
        <h2 className="text-base font-semibold">{title}</h2>
        {detail && <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-[color:var(--bg-secondary)] p-3 text-xs whitespace-pre-wrap">{detail}</pre>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-8 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-secondary)]">取消</button>
          <button type="button" onClick={onConfirm} className="h-8 rounded-md bg-[color:var(--accent)] px-3 text-sm text-white">允许</button>
        </div>
      </div>
    </div>
  )
}
