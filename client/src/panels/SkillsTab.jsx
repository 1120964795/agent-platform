import { useEffect, useState } from 'react'
import { Copy, Download, FolderOpen, Play, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react'
import {
  addWorkflowTemplateSource,
  confirmWorkflowStep,
  copyBuiltinSkill,
  createSkill,
  deleteSkill,
  deleteWorkflowSkill,
  disableWorkflowSkill,
  exportWorkflowSkill,
  listSkills,
  listWorkflowSkills,
  listWorkflowTemplateSources,
  listWorkflowTemplates,
  openFile,
  openSkillsFolder,
  reloadSkills,
  saveWorkflowDraft,
  startWorkflowRun,
  terminateWorkflowRun
} from '../lib/api.js'

const SAMPLE_FLASK_WORKFLOW = {
  name: 'Flask 本地启动',
  description: '检查 Python、安装依赖、启动 Flask，并诊断常见失败。',
  technologyStack: ['Python', 'Flask'],
  source: { kind: 'manual_draft' },
  steps: [
    { id: 'step_check_python', type: 'check_command', title: '检查 Python', command: 'python --version', riskLevel: 'low', requiresConfirmation: false },
    { id: 'step_install_requirements', type: 'confirm_command', title: '安装 requirements.txt', command: 'pip install -r requirements.txt', riskLevel: 'medium', requiresNetwork: true, requiresConfirmation: true },
    { id: 'step_start_service', type: 'start_service', title: '启动服务', command: 'python app.py', riskLevel: 'medium', requiresConfirmation: true, successPatterns: ['Running on'], errorPatterns: ['Traceback', 'ModuleNotFoundError', 'EADDRINUSE'] }
  ]
}

const RISK_LABELS = { low: '低风险', medium: '中风险', high: '高风险' }
const RUN_STATUS_LABELS = {
  queued: '排队中',
  running: '运行中',
  waiting_confirmation: '等待确认',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  terminated: '已终止',
  rejected: '已拒绝',
  skipped: '已跳过'
}
const TRUST_LABELS = {
  official_trusted: '官方可信',
  trusted: '可信',
  untrusted: '未信任',
  blocked: '已阻止'
}
const KNOWN_TEXT = {
  'Flask local start': 'Flask 本地启动',
  'Check Python, install dependencies, start Flask, and diagnose common failures.': '检查 Python、安装依赖、启动 Flask，并诊断常见失败。',
  'Workflow skill saved': '工作流技能已保存',
  'Skills reloaded': '技能已重新加载'
}

function riskClass(riskLevel) {
  if (riskLevel === 'high') return 'text-[color:var(--error)] border-[color:var(--error)]'
  if (riskLevel === 'medium') return 'text-amber-700 border-amber-300'
  return 'text-[color:var(--success)] border-emerald-200'
}

function zh(value) {
  return KNOWN_TEXT[value] || value
}

export default function SkillsTab() {
  const [skills, setSkills] = useState([])
  const [workflows, setWorkflows] = useState([])
  const [sources, setSources] = useState([])
  const [templates, setTemplates] = useState([])
  const [activeRun, setActiveRun] = useState(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [draft, setDraft] = useState({ name: '', description: '' })
  const [sourceUrl, setSourceUrl] = useState('')

  async function load() {
    setLoading(true)
    setMsg('')
    try {
      const [result, workflowResult, sourceResult, templateResult] = await Promise.all([
        listSkills(),
        listWorkflowSkills(),
        listWorkflowTemplateSources(),
        listWorkflowTemplates()
      ])
      setSkills(result.skills || [])
      setWorkflows(workflowResult.workflows || [])
      setSources(sourceResult.sources || [])
      setTemplates(templateResult.templates || [])
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
      const workflowResult = await listWorkflowSkills()
      setWorkflows(workflowResult.workflows || [])
      setMsg('技能已重新加载')
    } catch (error) {
      setMsg(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!draft.name.trim() || !draft.description.trim()) return
    try {
      await createSkill(draft)
      setDraft({ name: '', description: '' })
      await handleReload()
    } catch (error) {
      setMsg(error.message)
    }
  }

  async function handleDelete(skill) {
    if (!window.confirm(`删除技能 ${skill.name}？`)) return
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

  async function handleCreateWorkflow() {
    try {
      await saveWorkflowDraft({ draft: SAMPLE_FLASK_WORKFLOW, changelog: '初始工作流草案。' })
      await load()
      setMsg('工作流技能已保存')
    } catch (error) {
      setMsg(error.message)
    }
  }

  async function handleRunWorkflow(workflow) {
    try {
      const result = await startWorkflowRun(workflow.id)
      setActiveRun(result.run)
      setMsg(`运行：${RUN_STATUS_LABELS[result.run.status] || result.run.status}`)
    } catch (error) {
      setMsg(error.message)
    }
  }

  async function handleConfirmRun(accepted) {
    if (!activeRun) return
    try {
      const result = await confirmWorkflowStep(activeRun.runId, accepted)
      setActiveRun(result.run)
      setMsg(`运行：${RUN_STATUS_LABELS[result.run.status] || result.run.status}`)
      await load()
    } catch (error) {
      setMsg(error.message)
    }
  }

  async function handleTerminateRun() {
    if (!activeRun) return
    try {
      const result = await terminateWorkflowRun(activeRun.runId)
      setActiveRun(result.run)
      setMsg('运行已终止')
    } catch (error) {
      setMsg(error.message)
    }
  }

  async function handleExport(workflow) {
    try {
      const result = await exportWorkflowSkill(workflow.id)
      setMsg(`已导出：${result.packagePath}`)
    } catch (error) {
      setMsg(error.message)
    }
  }

  async function handleDisable(workflow) {
    try {
      await disableWorkflowSkill(workflow.id)
      await load()
    } catch (error) {
      setMsg(error.message)
    }
  }

  async function handleDeleteWorkflow(workflow) {
    if (!window.confirm(`删除工作流 ${zh(workflow.name)}？`)) return
    try {
      await deleteWorkflowSkill(workflow.id)
      await load()
    } catch (error) {
      setMsg(error.message)
    }
  }

  async function handleAddSource() {
    if (!sourceUrl.trim()) return
    try {
      await addWorkflowTemplateSource({ url: sourceUrl.trim() })
      setSourceUrl('')
      await load()
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
          <button type="button" onClick={handleReload} className="h-8 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-tertiary)] flex items-center gap-1"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> 刷新</button>
        </div>
      </div>

      <div className="space-y-3 border-b border-[color:var(--border)] pb-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">工作流技能</h3>
            <p className="text-xs text-[color:var(--text-muted)]">结构化、带版本的工作流，会按风险等级受控确认后运行。</p>
          </div>
          <button type="button" onClick={handleCreateWorkflow} className="h-8 rounded-md bg-[color:var(--accent)] px-3 text-xs text-white flex items-center gap-1"><Plus size={13} /> Flask</button>
        </div>

        {activeRun && (
          <div className="rounded-lg border border-[color:var(--border)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">运行：{RUN_STATUS_LABELS[activeRun.status] || activeRun.status}</div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">{activeRun.currentStepId || activeRun.runId}</div>
              </div>
              <div className="flex gap-1">
                {activeRun.status === 'waiting_confirmation' && (
                  <>
                    <button type="button" onClick={() => handleConfirmRun(true)} className="h-7 rounded-md bg-[color:var(--success)] px-2 text-xs text-white">确认</button>
                    <button type="button" onClick={() => handleConfirmRun(false)} className="h-7 rounded-md border border-[color:var(--border)] px-2 text-xs">拒绝</button>
                  </>
                )}
                {['running', 'waiting_confirmation', 'paused', 'failed'].includes(activeRun.status) && (
                  <button type="button" onClick={handleTerminateRun} className="h-7 rounded-md border border-[color:var(--border)] px-2 text-xs text-[color:var(--error)]">终止</button>
                )}
              </div>
            </div>
            {activeRun.stepResults?.length > 0 && (
              <div className="mt-2 max-h-24 space-y-1 overflow-y-auto text-[11px] text-[color:var(--text-muted)]">
                {activeRun.stepResults.map((result) => (
                  <div key={`${result.stepId}-${result.startedAt}`} className="flex justify-between gap-2">
                    <span className="truncate">{result.stepId}</span>
                    <span>{RUN_STATUS_LABELS[result.status] || result.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          {workflows.map((workflow) => (
            <div key={workflow.id} className="rounded-lg border border-[color:var(--border)] p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{zh(workflow.name)}</span>
                    <span className="rounded border border-[color:var(--border)] px-1.5 py-0.5 text-[10px] text-[color:var(--text-muted)]">v{workflow.currentVersion}</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${riskClass(workflow.riskSummary?.maxRiskLevel)}`}>{RISK_LABELS[workflow.riskSummary?.maxRiskLevel] || '低风险'}</span>
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--text-muted)]">{zh(workflow.description)}</p>
                  <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">{workflow.stepCount || 0} 步 · {(workflow.technologyStack || []).join(', ') || '通用'}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => handleRunWorkflow(workflow)} className="h-7 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-tertiary)]" title="运行工作流"><Play size={12} /></button>
                  <button type="button" onClick={() => handleExport(workflow)} className="h-7 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-tertiary)]" title="导出"><Download size={12} /></button>
                  <button type="button" onClick={() => handleDisable(workflow)} className="h-7 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-tertiary)]" title="禁用"><ShieldAlert size={12} /></button>
                  <button type="button" onClick={() => handleDeleteWorkflow(workflow)} className="h-7 rounded-md border border-[color:var(--border)] px-2 text-xs text-[color:var(--error)] hover:bg-[color:var(--bg-tertiary)]" title="删除"><Trash2 size={12} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-[color:var(--border)] p-3">
          <div className="text-sm font-medium">模板源</div>
          <div className="mt-2 flex gap-2">
            <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://example.com/manifest.json" className="min-w-0 flex-1 h-8 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-2 text-xs outline-none focus:border-[color:var(--accent)]" />
            <button type="button" onClick={handleAddSource} className="h-8 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-tertiary)]">添加</button>
          </div>
          <div className="mt-2 space-y-1 text-[11px] text-[color:var(--text-muted)]">
            {sources.map((source) => <div key={source.sourceId} className="truncate">{source.name} · {TRUST_LABELS[source.trustState] || source.trustState}</div>)}
            {templates.length > 0 && <div>{templates.length} 个模板可用</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-lg border border-[color:var(--border)] p-3">
        <div className="text-sm font-medium">创建用户技能</div>
        <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="my-skill" className="h-9 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 text-sm outline-none focus:border-[color:var(--accent)]" />
        <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="这个技能适合在什么情况下使用" className="h-9 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 text-sm outline-none focus:border-[color:var(--accent)]" />
        <button type="button" onClick={handleCreate} className="h-8 w-fit rounded-md bg-[color:var(--accent)] px-3 text-xs text-white flex items-center gap-1"><Plus size={13} /> 创建</button>
      </div>

      <div className="space-y-2">
        {skills.map((skill) => (
          <div key={`${skill.name}-${skill.path}`} className="rounded-lg border border-[color:var(--border)] p-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{zh(skill.name)}</span>
                  <span className="rounded border border-[color:var(--border)] px-1.5 py-0.5 text-[10px] text-[color:var(--text-muted)]">{skill.readonly ? '内置' : '用户'}</span>
                </div>
                <p className="mt-1 text-xs text-[color:var(--text-muted)]">{zh(skill.description)}</p>
                {skill.tools?.length > 0 && <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">工具：{skill.tools.join(', ')}</p>}
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
      {msg && <div className="text-xs text-[color:var(--text-muted)]">{zh(msg)}</div>}
    </div>
  )
}
