import { useEffect, useState } from 'react'
import { FolderOpen, Shield, ShieldCheck } from 'lucide-react'
import { getConfig, setConfig } from '../lib/api.js'
import SkillsTab from './SkillsTab.jsx'
import RulesTab from './RulesTab.jsx'
import BackupTab from './BackupTab.jsx'

const DEFAULT_FORM = {
  modelProvider: 'deepseek',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  minimaxApiKey: '',
  minimaxBaseUrl: 'https://api.minimax.io',
  minimaxModel: 'MiniMax-M2.7',
  temperature: 0.7,
  permissionMode: 'default',
  workspace_root: '',
  shell_whitelist_extra: '',
  shell_blacklist_extra: '',
  session_confirm_cache_enabled: true
}

const TABS = [
  { id: 'model', label: '模型' },
  { id: 'workspace', label: '工作区' },
  { id: 'skills', label: '技能' },
  { id: 'backup', label: '备份' },
  { id: 'rules', label: '偏好' }
]

function listToText(value) {
  return Array.isArray(value) ? value.join('\n') : ''
}

function textToList(value) {
  return String(value || '').split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)
}

export default function SettingsPanel() {
  const [tab, setTab] = useState('model')
  const [form, setForm] = useState(DEFAULT_FORM)
  const [maskedKey, setMaskedKey] = useState('')
  const [maskedMinimaxKey, setMaskedMinimaxKey] = useState('')
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
        setMaskedKey(config.apiKey || '')
        setMaskedMinimaxKey(config.minimaxApiKey || '')
        setForm({
          modelProvider: config.modelProvider || DEFAULT_FORM.modelProvider,
          apiKey: '',
          baseUrl: config.baseUrl || DEFAULT_FORM.baseUrl,
          model: config.model || DEFAULT_FORM.model,
          minimaxApiKey: '',
          minimaxBaseUrl: config.minimaxBaseUrl || DEFAULT_FORM.minimaxBaseUrl,
          minimaxModel: config.minimaxModel || DEFAULT_FORM.minimaxModel,
          temperature: config.temperature ?? DEFAULT_FORM.temperature,
          permissionMode: mode,
          workspace_root: config.workspace_root || '',
          shell_whitelist_extra: listToText(config.shell_whitelist_extra),
          shell_blacklist_extra: listToText(config.shell_blacklist_extra),
          session_confirm_cache_enabled: config.session_confirm_cache_enabled !== false
        })
        localStorage.setItem('agentdev-permission-mode', mode)
      } catch (error) {
        if (!ignored) setMsg(`加载失败：${error.message}`)
      }
    }
    loadConfig()
    return () => { ignored = true }
  }, [])

  async function handleSave() {
    setSaving(true)
    setMsg('')
    try {
      const patch = {
        ...form,
        temperature: Number(form.temperature),
        shell_whitelist_extra: textToList(form.shell_whitelist_extra),
        shell_blacklist_extra: textToList(form.shell_blacklist_extra)
      }
      if (!patch.apiKey) delete patch.apiKey
      if (!patch.minimaxApiKey) delete patch.minimaxApiKey
      const result = await setConfig(patch)
      const mode = result.config?.permissionMode || form.permissionMode
      setMaskedKey(result.config?.apiKey || '')
      setMaskedMinimaxKey(result.config?.minimaxApiKey || '')
      setForm((current) => ({ ...current, apiKey: '', minimaxApiKey: '' }))
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
    if (selected) setForm((current) => ({ ...current, workspace_root: selected }))
  }

  const isFull = form.permissionMode === 'full'

  return (
    <div className="p-6 space-y-5">
      <div className="flex gap-1 border-b border-[color:var(--border)] pb-2">
        {TABS.map((item) => (
          <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`h-8 rounded-md px-3 text-sm ${tab === item.id ? 'bg-[color:var(--accent)] text-white' : 'text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)]'}`}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'model' && (
        <div className="space-y-5">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">权限模式</h2>
            <div className="grid grid-cols-1 gap-2">
              <button type="button" onClick={() => setForm({ ...form, permissionMode: 'default' })} className={`flex items-start gap-3 rounded-lg border p-3 text-left ${!isFull ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/5' : 'border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]'}`}>
                <Shield size={18} className={!isFull ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-muted)]'} />
                <div><div className="text-sm font-medium">普通模式</div><div className="text-xs text-[color:var(--text-muted)]">只进行普通对话，隐藏工具和技能。</div></div>
              </button>
              <button type="button" onClick={() => setForm({ ...form, permissionMode: 'full' })} className={`flex items-start gap-3 rounded-lg border p-3 text-left ${isFull ? 'border-[color:var(--success)] bg-[color:var(--success)]/5' : 'border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]'}`}>
                <ShieldCheck size={18} className={isFull ? 'text-[color:var(--success)]' : 'text-[color:var(--text-muted)]'} />
                <div><div className="text-sm font-medium">完整权限</div><div className="text-xs text-[color:var(--text-muted)]">Agent 可以调用本地文件、Shell、技能和文档工具。</div></div>
              </button>
            </div>
          </div>

          <div className="border-t border-[color:var(--border)]" />
          <h2 className="text-lg font-semibold">模型</h2>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">模型提供商<select value={form.modelProvider} onChange={(event) => setForm({ ...form, modelProvider: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"><option value="deepseek">DeepSeek V4</option><option value="minimax">MiniMax</option></select></label>
          {form.modelProvider === 'deepseek' ? (
            <>
              <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">DeepSeek API Key<input type="password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder={maskedKey || 'sk-...'} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
              <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">DeepSeek Base URL<input value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
              <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">DeepSeek 模型<select value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"><option value="deepseek-v4-flash">deepseek-v4-flash</option><option value="deepseek-v4-pro">deepseek-v4-pro</option><option value="deepseek-chat">deepseek-chat（将停用）</option><option value="deepseek-reasoner">deepseek-reasoner（将停用）</option></select></label>
            </>
          ) : (
            <>
              <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">MiniMax API Key<input type="password" value={form.minimaxApiKey} onChange={(event) => setForm({ ...form, minimaxApiKey: event.target.value })} placeholder={maskedMinimaxKey || 'minimax key'} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
              <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">MiniMax Base URL<input value={form.minimaxBaseUrl} onChange={(event) => setForm({ ...form, minimaxBaseUrl: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
              <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">MiniMax 模型<select value={form.minimaxModel} onChange={(event) => setForm({ ...form, minimaxModel: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"><option value="MiniMax-M2.7">MiniMax-M2.7</option><option value="MiniMax-M2.7-highspeed">MiniMax-M2.7-highspeed</option><option value="MiniMax-M2.5">MiniMax-M2.5</option><option value="MiniMax-M2.1">MiniMax-M2.1</option><option value="MiniMax-M2">MiniMax-M2</option></select></label>
              <div className="rounded-md bg-[color:var(--bg-secondary)] p-2 text-xs text-[color:var(--text-muted)]">MiniMax 文本 Chat 接口用于对话和工具调用；图片理解需要后续接入 MiniMax 官方 MCP 或单独的视觉能力。</div>
            </>
          )}
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">温度：{form.temperature}<input type="range" min="0" max="2" step="0.1" value={form.temperature} onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) })} className="w-full" /></label>
        </div>
      )}

      {tab === 'workspace' && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold">工作区</h2>
            <p className="text-xs text-[color:var(--text-muted)]">Shell 命令和生成产物的默认工作目录；这不是严格的文件访问边界。</p>
          </div>
          <div className="flex gap-2">
            <input value={form.workspace_root} onChange={(event) => setForm({ ...form, workspace_root: event.target.value })} className="min-w-0 flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]" />
            <button type="button" onClick={chooseWorkspace} className="h-9 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)] flex items-center gap-1"><FolderOpen size={14} /> 选择</button>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.session_confirm_cache_enabled} onChange={(event) => setForm({ ...form, session_confirm_cache_enabled: event.target.checked })} /> 本会话记住已批准的灰色 Shell 命令</label>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">额外 Shell 白名单<textarea value={form.shell_whitelist_extra} onChange={(event) => setForm({ ...form, shell_whitelist_extra: event.target.value })} rows={4} placeholder="每行一个命令" className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">额外 Shell 黑名单<textarea value={form.shell_blacklist_extra} onChange={(event) => setForm({ ...form, shell_blacklist_extra: event.target.value })} rows={4} placeholder="每行一个命令" className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
        </div>
      )}

      {tab === 'skills' && <SkillsTab />}
      {tab === 'backup' && <BackupTab setMsg={setMsg} />}
      {tab === 'rules' && <RulesTab />}

      {(tab === 'model' || tab === 'workspace') && (
        <button type="button" onClick={handleSave} disabled={saving} className="w-full h-9 rounded-md bg-[color:var(--accent)] text-white text-sm font-medium disabled:opacity-50">{saving ? '正在保存...' : '保存设置'}</button>
      )}
      {msg && <div className="text-xs text-[color:var(--text-muted)]">{msg}</div>}
    </div>
  )
}
