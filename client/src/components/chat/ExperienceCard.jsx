import { useEffect, useState } from 'react'

function createDraft(experience) {
  return {
    title: experience?.title || '',
    cause: experience?.cause || '',
    notes: Array.isArray(experience?.notes) ? experience.notes.join('\n') : '',
    steps: Array.isArray(experience?.steps) ? experience.steps.join('\n') : ''
  }
}

export default function ExperienceCard({ experience, editable = false, onSave, onDelete, compact = false }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => createDraft(experience))

  useEffect(() => {
    setDraft(createDraft(experience))
  }, [experience])

  if (!experience) return null

  const save = async () => {
    if (!onSave) return
    await onSave({
      ...experience,
      title: draft.title,
      cause: draft.cause,
      notes: draft.notes.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
      steps: draft.steps.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    })
    setEditing(false)
  }

  return (
    <section className={`rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-slate-800 shadow-sm ${compact ? 'my-2' : 'my-3'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Experience</div>
          {editing ? (
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              className="mt-2 w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm outline-none"
            />
          ) : (
            <h3 className="mt-1 text-base font-semibold text-slate-900">{experience.title}</h3>
          )}
          <div className="mt-1 text-xs text-slate-500">
            {experience.status} · success {experience.successCount || 0} · {experience.errorSignature}
          </div>
        </div>
        {editable && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
            >
              {editing ? '取消' : '编辑'}
            </button>
            <button
              type="button"
              onClick={() => onDelete?.(experience)}
              className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
            >
              删除
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-white/90 p-3">
          <div className="font-semibold text-slate-900">原因</div>
          {editing ? (
            <textarea
              rows={4}
              value={draft.cause}
              onChange={(event) => setDraft((current) => ({ ...current, cause: event.target.value }))}
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
            />
          ) : (
            <p className="mt-2 text-xs leading-5 text-slate-700">{experience.cause || '暂无描述'}</p>
          )}
        </div>
        <div className="rounded-lg bg-white/90 p-3">
          <div className="font-semibold text-slate-900">步骤</div>
          {editing ? (
            <textarea
              rows={4}
              value={draft.steps}
              onChange={(event) => setDraft((current) => ({ ...current, steps: event.target.value }))}
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
            />
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-700">
              {(experience.steps || []).map((item) => <li key={item}>{item}</li>)}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-white/90 p-3">
        <div className="font-semibold text-slate-900">命令记录</div>
        <div className="mt-2 space-y-2">
          {(experience.commands || []).length === 0 && <div className="text-xs text-slate-500">暂无执行记录</div>}
          {(experience.commands || []).map((command, index) => (
            <div key={`${command.command}-${index}`} className="rounded-md border border-slate-200 p-2">
              <div className="break-all font-mono text-[11px] text-slate-700">{command.command}</div>
              <div className="mt-1 text-[11px] text-slate-500">
                {command.cwd || '-'} · {command.riskLevel || '-'} · {command.success ? 'success' : 'failed'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-white/90 p-3">
        <div className="font-semibold text-slate-900">备注</div>
        {editing ? (
          <textarea
            rows={4}
            value={draft.notes}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
          />
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-700">
            {(experience.notes || []).map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}
      </div>

      {editing && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={save}
            className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            保存经验
          </button>
        </div>
      )}
    </section>
  )
}
