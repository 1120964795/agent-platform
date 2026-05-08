import { useEffect, useState } from 'react'
import { FolderOpen, Shield, ShieldCheck } from 'lucide-react'
import { getConfig, setConfig } from '../lib/api.js'
import SkillsTab from './SkillsTab.jsx'
import RulesTab from './RulesTab.jsx'

const DEFAULT_FORM = {
  qwenApiKey: '',
  qwenBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  qwenPrimaryModel: 'qwen-max-latest',
  qwenCodingModel: 'qwen3-coder-plus',
  fallbackProvider: '',
  deepseekApiKey: '',
  deepseekBaseUrl: 'https://api.deepseek.com',
  fallbackModel: 'deepseek-chat',
  openInterpreterEndpoint: '',
  openInterpreterCommand: '',
  uiTarsEndpoint: '',
  uiTarsCommand: '',
  uiTarsScreenAuthorized: false,
  dryRunEnabled: true,
  permissionMode: 'default',
  workspace_root: '',
  session_confirm_cache_enabled: true
}

const TABS = [
  { id: 'models', label: '模型' },
  { id: 'runtimes', label: '运行时' },
  { id: 'safety', label: '安全' },
  { id: 'skills', label: '技能' },
  { id: 'rules', label: '偏好' }
]

export default function SettingsPanel() {
  const [tab, setTab] = useState('models')
  const [form, setForm] = useState(DEFAULT_FORM)
  const [masked, setMasked] = useState({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let ignored = false
    async function loadConfig() {
      try {
        const result = await getConfig()
        if (ignored || !result.config) return
        const config = result.config
        const mode = config.permissionMode || 'default'
        setMasked({ qwenApiKey: config.qwenApiKey, deepseekApiKey: config.deepseekApiKey, apiKey: config.apiKey })
        setForm({
          ...DEFAULT_FORM,
          ...config,
          qwenApiKey: '',
          deepseekApiKey: '',
          permissionMode: mode
        })
        localStorage.setItem('agentdev-permission-mode', mode)
      } catch (error) {
        if (!ignored) setMsg(`加载失败：${error.message}`)
      }
    }
    loadConfig()
    return () => { ignored = true }
  }, [])

  function patch(partial) {
    setForm((current) => ({ ...current, ...partial }))
  }

  async function handleSave() {
    setSaving(true)
    setMsg('')
    try {
      const next = { ...form }
      if (!next.qwenApiKey) delete next.qwenApiKey
      if (!next.deepseekApiKey) delete next.deepseekApiKey
      const result = await setConfig(next)
      const mode = result.config?.permissionMode || form.permissionMode
      setMasked({ qwenApiKey: result.config?.qwenApiKey, deepseekApiKey: result.config?.deepseekApiKey, apiKey: result.config?.apiKey })
      patch({ qwenApiKey: '', deepseekApiKey: '' })
      localStorage.setItem('agentdev-permission-mode', mode)
      window.dispatchEvent(new CustomEvent('agentdev:permission-changed', { detail: { mode } }))
      setMsg('已保存')
      setTimeout(() => setMsg(''), 2000)
    } catch (error) {
      setMsg(`保存失败：${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function chooseWorkspace() {
    const selected = await window.electronAPI?.selectDirectory?.()
    if (selected) patch({ workspace_root: selected })
  }

  const isFull = form.permissionMode === 'full'

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap gap-1 border-b border-[color:var(--border)] pb-2">
        {TABS.map((item) => (
          <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`h-8 rounded-md px-3 text-sm ${tab === item.id ? 'bg-[color:var(--accent)] text-white' : 'text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)]'}`}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'models' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Qwen 配置</h2>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">API Key<input type="password" value={form.qwenApiKey} onChange={(event) => patch({ qwenApiKey: event.target.value })} placeholder={masked.qwenApiKey || 'DashScope API Key'} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">Base URL<input value={form.qwenBaseUrl} onChange={(event) => patch({ qwenBaseUrl: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">主模型<input value={form.qwenPrimaryModel} onChange={(event) => patch({ qwenPrimaryModel: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">代码模型<input value={form.qwenCodingModel} onChange={(event) => patch({ qwenCodingModel: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>

          <div className="border-t border-[color:var(--border)] pt-4 space-y-3">
            <h2 className="text-lg font-semibold">DeepSeek 备用聊天</h2>
            <p className="text-xs text-[color:var(--text-muted)]">仅作为普通聊天备用模型。DeepSeek 不会用于任务规划或动作意图。</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.fallbackProvider === 'deepseek'} onChange={(event) => patch({ fallbackProvider: event.target.checked ? 'deepseek' : '' })} /> 启用普通聊天备用模型</label>
            <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">DeepSeek API Key<input type="password" value={form.deepseekApiKey} onChange={(event) => patch({ deepseekApiKey: event.target.value })} placeholder={masked.deepseekApiKey || masked.apiKey || 'sk-...'} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
            <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">备用模型<input value={form.fallbackModel} onChange={(event) => patch({ fallbackModel: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
            <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">DeepSeek Base URL<input value={form.deepseekBaseUrl} onChange={(event) => patch({ deepseekBaseUrl: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
          </div>
        </div>
      )}

      {tab === 'runtimes' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">外部运行时</h2>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">Open Interpreter 端点<input value={form.openInterpreterEndpoint} onChange={(event) => patch({ openInterpreterEndpoint: event.target.value })} placeholder="http://127.0.0.1:8756" className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">Open Interpreter 启动命令<input value={form.openInterpreterCommand} onChange={(event) => patch({ openInterpreterCommand: event.target.value })} placeholder="外部 sidecar 启动命令" className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">UI-TARS 端点<input value={form.uiTarsEndpoint} onChange={(event) => patch({ uiTarsEndpoint: event.target.value })} placeholder="http://127.0.0.1:8765" className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">UI-TARS 启动命令<input value={form.uiTarsCommand} onChange={(event) => patch({ uiTarsCommand: event.target.value })} placeholder="外部适配器启动命令" className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.uiTarsScreenAuthorized} onChange={(event) => patch({ uiTarsScreenAuthorized: event.target.checked })} /> 已授权屏幕控制</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.dryRunEnabled} onChange={(event) => patch({ dryRunEnabled: event.target.checked })} /> 启用演示模式</label>
        </div>
      )}

      {tab === 'safety' && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold">安全设置</h2>
          <div className="grid grid-cols-1 gap-2">
            <button type="button" onClick={() => patch({ permissionMode: 'default' })} className={`flex items-start gap-3 rounded-md border p-3 text-left ${!isFull ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/5' : 'border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]'}`}>
              <Shield size={18} className={!isFull ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-muted)]'} />
              <div><div className="text-sm font-medium">聊天模式</div><div className="text-xs text-[color:var(--text-muted)]">普通对话。执行任务仍会走动作提案和审批流程。</div></div>
            </button>
            <button type="button" onClick={() => patch({ permissionMode: 'full' })} className={`flex items-start gap-3 rounded-md border p-3 text-left ${isFull ? 'border-[color:var(--success)] bg-[color:var(--success)]/5' : 'border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]'}`}>
              <ShieldCheck size={18} className={isFull ? 'text-[color:var(--success)]' : 'text-[color:var(--text-muted)]'} />
              <div><div className="text-sm font-medium">兼容工具模式</div><div className="text-xs text-[color:var(--text-muted)]">旧版本地工具保留为兼容能力，但不会暴露给执行模式。</div></div>
            </button>
          </div>
          <div className="flex gap-2">
            <input value={form.workspace_root} onChange={(event) => patch({ workspace_root: event.target.value })} className="min-w-0 flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]" />
            <button type="button" onClick={chooseWorkspace} className="h-9 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)] flex items-center gap-1"><FolderOpen size={14} /> 选择</button>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.session_confirm_cache_enabled} onChange={(event) => patch({ session_confirm_cache_enabled: event.target.checked })} /> 本会话记住已批准的兼容 shell 命令</label>
        </div>
      )}

      {tab === 'skills' && <SkillsTab />}
      {tab === 'rules' && <RulesTab />}

      {['models', 'runtimes', 'safety'].includes(tab) && (
        <button type="button" onClick={handleSave} disabled={saving} className="w-full h-9 rounded-md bg-[color:var(--accent)] text-white text-sm font-medium disabled:opacity-50">{saving ? '保存中...' : '保存设置'}</button>
      )}
      {msg && <div className="text-xs text-[color:var(--text-muted)]">{msg}</div>}
    </div>
  )
}
