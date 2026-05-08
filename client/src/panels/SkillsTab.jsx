import { useEffect, useState } from 'react'
import { Copy, FolderOpen, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { copyBuiltinSkill, createSkill, deleteSkill, listSkills, openFile, openSkillsFolder, reloadSkills } from '../lib/api.js'

const SKILL_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$/

export default function SkillsTab() {
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [draft, setDraft] = useState({ name: '', description: '' })

  async function load() {
    setLoading(true)
    setMsg('')
    try {
      const result = await listSkills()
      setSkills(result.skills || [])
    } catch (error) {
      setMsg(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleReload() {
    setLoading(true)
    try {
      const result = await reloadSkills()
      setSkills(result.skills || [])
      setMsg('技能已重新加载')
    } catch (error) {
      setMsg(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    const name = draft.name.trim()
    const description = draft.description.trim()
    if (!name || !description) return
    if (!SKILL_NAME_RE.test(name)) {
      setMsg('技能名称只能使用英文、数字、短横线或下划线，例如 word-writer。')
      return
    }
    try {
      await createSkill({ name, description })
      setDraft({ name: '', description: '' })
      await handleReload()
    } catch (error) {
      setMsg(error.message)
    }
  }

  async function handleDelete(skill) {
    if (!window.confirm(`确认删除技能 ${skill.name}？`)) return
    try {
      await deleteSkill(skill.name)
      await handleReload()
    } catch (error) {
      setMsg(error.message)
    }
  }

  async function handleCopy(skill) {
    try {
      await copyBuiltinSkill({ name: skill.name, destName: `${skill.name}-custom` })
      await handleReload()
    } catch (error) {
      setMsg(error.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">技能</h2>
          <p className="text-xs text-[color:var(--text-muted)]">内置技能随应用提供；同名用户技能会覆盖内置技能。</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={openSkillsFolder} className="h-8 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-tertiary)] flex items-center gap-1"><FolderOpen size={13} /> 文件夹</button>
          <button type="button" onClick={handleReload} className="h-8 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-tertiary)] flex items-center gap-1"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> 重新加载</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-lg border border-[color:var(--border)] p-3">
        <div className="text-sm font-medium">创建用户技能</div>
        <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="my-skill" className="h-9 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 text-sm outline-none focus:border-[color:var(--accent)]" />
        <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="这个技能适合在什么场景使用" className="h-9 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 text-sm outline-none focus:border-[color:var(--accent)]" />
        <button type="button" onClick={handleCreate} className="h-8 w-fit rounded-md bg-[color:var(--accent)] px-3 text-xs text-white flex items-center gap-1"><Plus size={13} /> 创建</button>
      </div>

      <div className="space-y-2">
        {skills.map((skill) => (
          <div key={`${skill.name}-${skill.path}`} className="rounded-lg border border-[color:var(--border)] p-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{skill.name}</span>
                  <span className="rounded border border-[color:var(--border)] px-1.5 py-0.5 text-[10px] text-[color:var(--text-muted)]">{skill.readonly ? '内置' : '用户'}</span>
                </div>
                <p className="mt-1 text-xs text-[color:var(--text-muted)]">{skill.description}</p>
                {skill.when_to_use && <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">适用：{skill.when_to_use}</p>}
                {skill.tools?.length > 0 && <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">工具：{skill.tools.join(', ')}</p>}
                {skill.resources?.length > 0 && <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">资源：{skill.resources.length} 个</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => openFile(skill.path)} className="h-7 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-tertiary)]">编辑</button>
                {skill.readonly ? (
                  <button type="button" onClick={() => handleCopy(skill)} className="h-7 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-tertiary)] flex items-center gap-1"><Copy size={12} /> 复制</button>
                ) : (
                  <button type="button" onClick={() => handleDelete(skill)} className="h-7 rounded-md border border-[color:var(--border)] px-2 text-xs text-[color:var(--error)] hover:bg-[color:var(--bg-tertiary)]"><Trash2 size={12} /></button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {msg && <div className="text-xs text-[color:var(--text-muted)]">{msg}</div>}
    </div>
  )
}
