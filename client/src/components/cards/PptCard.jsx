import { Loader2, Presentation } from 'lucide-react'
import { generatePpt } from '../../lib/api.js'
import FileCard from './FileCard.jsx'

const MAX_SLIDES = 10

const DEFAULT_FORM = {
  title: '',
  topic: '',
  slideCount: MAX_SLIDES
}

function clampSlideCount(value) {
  const count = Number(value) || DEFAULT_FORM.slideCount
  return Math.min(MAX_SLIDES, Math.max(1, count))
}

function normalizeForm(cardData = {}) {
  return {
    ...DEFAULT_FORM,
    ...cardData,
    slideCount: clampSlideCount(cardData.slideCount)
  }
}

function buildArtifact(result, form) {
  if (!result?.filename || !result?.path) return null

  return {
    id: result.artifactId,
    type: 'ppt',
    filename: result.filename,
    path: result.path,
    title: form.title,
    size: result.size,
    createdAt: new Date().toISOString()
  }
}

export default function PptCard({ msg, onUpdate, onFileGenerated }) {
  const { id, cardState = 'form', cardData = {} } = msg
  const form = normalizeForm(cardData)
  const result = cardData.result
  const artifact = cardData.artifact || buildArtifact(result, form)

  function updateForm(patch) {
    onUpdate?.(id, 'form', { ...cardData, ...patch })
  }

  async function handleGenerate() {
    const payload = {
      title: form.title.trim(),
      topic: form.topic.trim(),
      slideCount: clampSlideCount(form.slideCount),
      style: 'business'
    }

    if (!payload.title || !payload.topic) {
      updateForm({ error: '请填写标题和内容方向' })
      return
    }

    onUpdate?.(id, 'loading', { ...payload, error: '' })

    try {
      const nextResult = await generatePpt(payload)
      const nextArtifact = buildArtifact(nextResult, payload)
      onUpdate?.(id, 'done', { ...payload, result: nextResult, artifact: nextArtifact })
      if (nextArtifact) onFileGenerated?.(nextArtifact)
    } catch (error) {
      onUpdate?.(id, 'form', { ...payload, error: error.message || '生成失败' })
    }
  }

  if (cardState === 'loading') {
    return (
      <Card>
        <div className="flex items-center gap-3 text-sm text-[color:var(--text-muted)]">
          <Loader2 size={16} className="animate-spin text-[color:var(--success)]" />
          正在生成 PPT，约需 15-40 秒...
        </div>
      </Card>
    )
  }

  if (cardState === 'done') {
    return (
      <>
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Presentation size={16} className="text-[color:var(--success)]" />
            <span className="font-medium text-sm">PPT 已生成</span>
          </div>
          <div className="text-xs text-[color:var(--text-muted)]">
            共 {result?.slides?.length || form.slideCount} 页 · 主题：{form.title}
          </div>
          {cardData.error && <div className="mt-2 text-xs text-[color:var(--error)]">{cardData.error}</div>}
        </Card>
        <FileCard
          artifact={artifact}
          onError={error => onUpdate?.(id, 'done', { ...cardData, error: error.message || '打开失败' })}
        />
      </>
    )
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Presentation size={16} className="text-[color:var(--success)]" />
        <span className="font-medium text-sm">生成 PPT</span>
      </div>
      <div className="space-y-3">
        <Field label="标题">
          <input
            value={form.title}
            onChange={event => updateForm({ title: event.target.value, error: '' })}
            placeholder="例如：期中项目汇报"
            className="ppt-card-input"
          />
        </Field>
        <Field label="内容方向">
          <textarea
            value={form.topic}
            onChange={event => updateForm({ topic: event.target.value, error: '' })}
            rows={3}
            placeholder="描述 PPT 想表达的内容..."
            className="ppt-card-input resize-none"
          />
        </Field>
        <Field label="页数（最多 10）">
          <input
            type="number"
            min="1"
            max={MAX_SLIDES}
            value={form.slideCount}
            onChange={event => updateForm({ slideCount: clampSlideCount(event.target.value), error: '' })}
            className="ppt-card-input"
          />
        </Field>
        {cardData.error && <div className="text-xs text-[color:var(--error)]">{cardData.error}</div>}
        <button
          type="button"
          onClick={handleGenerate}
          className="w-full h-9 rounded-md bg-[color:var(--success)] text-white text-sm font-medium hover:opacity-90"
        >
          生成
        </button>
      </div>
      <style>{`
        .ppt-card-input {
          width: 100%;
          padding: 6px 10px;
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 13px;
          background: var(--bg-primary);
          color: var(--text-primary);
          outline: none;
        }
        .ppt-card-input:focus { border-color: var(--success); }
      `}</style>
    </Card>
  )
}

function Card({ children }) {
  return (
    <div className="my-3 p-4 border border-[color:var(--border)] rounded-lg bg-[color:var(--bg-primary)] shadow-sm max-w-[680px]">
      {children}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs text-[color:var(--text-muted)] mb-1">{label}</div>
      {children}
    </div>
  )
}
