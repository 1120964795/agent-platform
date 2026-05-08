import { FileText, Loader2 } from 'lucide-react'

export default function WordCard({ msg }) {
  const { cardState = 'loading', cardData = {} } = msg

  if (cardState === 'loading') {
    return (
      <div className="my-3 p-4 border border-[color:var(--border)] rounded-lg bg-[color:var(--bg-primary)] shadow-sm max-w-[680px]">
        <div className="flex items-center gap-3 text-sm text-[color:var(--text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          正在生成 Word 文档，约需 10-30 秒...
        </div>
      </div>
    )
  }

  // done 状态
  return (
    <div className="my-3 p-4 border border-[color:var(--border)] rounded-lg bg-[color:var(--bg-primary)] shadow-sm max-w-[680px]">
      <div className="flex items-center gap-2 mb-2">
        <FileText size={16} className="text-[color:var(--accent)]" />
        <span className="font-medium text-sm">
          {cardData.error ? 'Word 生成失败' : 'Word 文档已生成'}
        </span>
      </div>
      {cardData.error && (
        <div className="text-xs text-[color:var(--error)]">{cardData.error}</div>
      )}
      {cardData.result?.title && (
        <div className="text-xs text-[color:var(--text-muted)]">标题：{cardData.result.title}</div>
      )}
      {cardData.result?.preview && (
        <div className="mt-2 text-xs bg-[color:var(--bg-tertiary)] rounded-md p-2 text-[color:var(--text-muted)] line-clamp-3">
          {cardData.result.preview}...
        </div>
      )}
    </div>
  )
}
