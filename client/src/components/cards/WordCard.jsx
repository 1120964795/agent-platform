import { FileText, Loader2 } from 'lucide-react'
import { api, openFile } from '../../lib/api.js'

const DEFAULT_FORM = {
  title: '',
  outline: '',
  wordCount: 1500,
  style: 'academic'
}

function normalizeForm(cardData = {}) {
  return {
    ...DEFAULT_FORM,
    ...cardData,
    wordCount: Number(cardData.wordCount) || DEFAULT_FORM.wordCount
  }
}

function buildArtifact(result, form) {
  if (!result?.filename || !result?.path) return null

  return {
    id: result.artifactId,
    type: 'word',
    filename: result.filename,
    path: result.path,
    title: form.title,
    size: result.size,
    createdAt: new Date().toISOString()
  }
}

function downloadUrl(filename) {
  return filename ? `/files/${encodeURIComponent(filename)}` : '#'
}

export default function WordCard({ msg, onUpdate, onFileGenerated }) {
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
      outline: form.outline.trim(),
      wordCount: Number(form.wordCount) || DEFAULT_FORM.wordCount,
      style: form.style || DEFAULT_FORM.style
    }

    if (!payload.title || !payload.outline) {
      updateForm({ error: '请填写标题和要求' })
      return
    }

    onUpdate?.(id, 'loading', { ...payload, error: '' })

    try {
      const nextResult = await api.post('/api/word', payload)
      const nextArtifact = buildArtifact(nextResult, payload)
      onUpdate?.(id, 'done', { ...payload, result: nextResult, artifact: nextArtifact })
      if (nextArtifact) onFileGenerated?.(nextArtifact)
    } catch (error) {
      onUpdate?.(id, 'form', { ...payload, error: error.message || '生成失败' })
    }
  }

  async function handleOpen() {
    if (!artifact?.path) return
    try {
      await openFile(artifact.path)
    } catch (error) {
      onUpdate?.(id, 'done', { ...cardData, error: error.message || '打开失败' })
    }
  }

  if (cardState === 'loading') {
    return (
      <Card>
        <div className="flex items-center gap-3 text-sm text-[color:var(--text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          正在生成 Word 文档，约需 10-30 秒...
        </div>
      </Card>
    )
  }

  if (cardState === 'done') {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <FileText size={16} className="text-[color:var(--accent)]" />
          <span className="font-medium text-sm">Word 文档已生成</span>
        </div>
        <div className="text-xs text-[color:var(--text-muted)] mb-2">标题：{form.title}</div>
        {result?.preview && (
          <div className="text-xs bg-[color:var(--bg-tertiary)] rounded-md p-2 text-[color:var(--text-muted)] line-clamp-3 mb-3">
            {result.preview}...
          </div>
        )}
        {artifact && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-secondary)] p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{artifact.filename}</div>
              <div className="text-xs text-[color:var(--text-muted)] truncate">{artifact.path}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleOpen}
                className="h-8 rounded-md border border-[color:var(--border)] px-3 text-xs hover:bg-[color:var(--bg-tertiary)]"
              >
                打开文件
              </button>
              <a
                href={downloadUrl(artifact.filename)}
                download={artifact.filename}
                className="h-8 rounded-md bg-[color:var(--accent)] px-3 text-xs text-white flex items-center"
              >
                下载
              </a>
            </div>
          </div>
        )}
        {cardData.error && <div className="mt-2 text-xs text-[color:var(--error)]">{cardData.error}</div>}
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <FileText size={16} className="text-[color:var(--accent)]" />
        <span className="font-medium text-sm">生成 Word 文档</span>
      </div>
      <div className="space-y-3">
        <Field label="标题">
          <input
            value={form.title}
            onChange={event => updateForm({ title: event.target.value, error: '' })}
            placeholder="例如：软件工程实验报告"
            className="word-card-input"
          />
        </Field>
        <Field label="内容要求">
          <textarea
            value={form.outline}
            onChange={event => updateForm({ outline: event.target.value, error: '' })}
            rows={3}
            placeholder="描述需要涵盖的要点..."
            className="word-card-input resize-none"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="字数">
            <input
              type="number"
              min="100"
              step="100"
              value={form.wordCount}
              onChange={event => updateForm({ wordCount: Number(event.target.value) || DEFAULT_FORM.wordCount, error: '' })}
              className="word-card-input"
            />
          </Field>
          <Field label="风格">
            <select
              value={form.style}
              onChange={event => updateForm({ style: event.target.value, error: '' })}
              className="word-card-input"
            >
              <option value="academic">学术</option>
              <option value="business">职场</option>
              <option value="casual">轻松</option>
            </select>
          </Field>
        </div>
        {cardData.error && <div className="text-xs text-[color:var(--error)]">{cardData.error}</div>}
        <button
          type="button"
          onClick={handleGenerate}
          className="w-full h-9 rounded-md bg-[color:var(--accent)] text-white text-sm font-medium hover:opacity-90"
        >
          生成
        </button>
      </div>
      <style>{`
        .word-card-input {
          width: 100%;
          padding: 6px 10px;
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 13px;
          background: var(--bg-primary);
          color: var(--text-primary);
          outline: none;
        }
        .word-card-input:focus { border-color: var(--accent); }
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
