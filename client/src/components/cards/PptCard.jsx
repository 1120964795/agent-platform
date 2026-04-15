import { Loader2, Presentation } from 'lucide-react'

export default function PptCard({ msg }) {
  const { cardState = 'loading', cardData = {} } = msg

  if (cardState === 'loading') {
    return (
      <div className="my-3 p-4 border border-[color:var(--border)] rounded-lg bg-[color:var(--bg-primary)] shadow-sm max-w-[680px]">
        <div className="flex items-center gap-3 text-sm text-[color:var(--text-muted)]">
          <Loader2 size={16} className="animate-spin text-[color:var(--success)]" />
          正在生成 PPT，约需 15-40 秒...
        </div>
      </div>
    )
  }

  // done 状态
  return (
    <div className="my-3 p-4 border border-[color:var(--border)] rounded-lg bg-[color:var(--bg-primary)] shadow-sm max-w-[680px]">
      <div className="flex items-center gap-2 mb-2">
        <Presentation size={16} className="text-[color:var(--success)]" />
        <span className="font-medium text-sm">
          {cardData.error ? 'PPT 生成失败' : 'PPT 已生成'}
        </span>
      </div>
      {cardData.error && (
        <div className="text-xs text-[color:var(--error)]">{cardData.error}</div>
      )}
      {cardData.result?.title && (
        <div className="text-xs text-[color:var(--text-muted)]">标题：{cardData.result.title}</div>
      )}
    </div>
  )
}
