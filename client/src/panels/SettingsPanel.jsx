import { useEffect, useState } from 'react'
import { FolderOpen, Shield, ShieldCheck } from 'lucide-react'
import { getConfig, setConfig } from '../lib/api.js'
import SkillsTab from './SkillsTab.jsx'
import RulesTab from './RulesTab.jsx'

const DEFAULT_FORM = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  temperature: 0.7,
  permissionMode: 'default',
  workspace_root: '',
  shell_whitelist_extra: '',
  shell_blacklist_extra: '',
  session_confirm_cache_enabled: true
}

const TABS = [
  { id: 'model', label: 'Model' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'skills', label: 'Skills' },
  { id: 'rules', label: 'Preferences' }
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
        setForm({
          apiKey: '',
          baseUrl: config.baseUrl || DEFAULT_FORM.baseUrl,
          model: config.model || DEFAULT_FORM.model,
          temperature: config.temperature ?? DEFAULT_FORM.temperature,
          permissionMode: mode,
          workspace_root: config.workspace_root || '',
          shell_whitelist_extra: listToText(config.shell_whitelist_extra),
          shell_blacklist_extra: listToText(config.shell_blacklist_extra),
          session_confirm_cache_enabled: config.session_confirm_cache_enabled !== false
        })
        localStorage.setItem('agentdev-permission-mode', mode)
      } catch (error) {
        if (!ignored) setMsg(`Load failed: ${error.message}`)
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
      const result = await setConfig(patch)
      const mode = result.config?.permissionMode || form.permissionMode
      setMaskedKey(result.config?.apiKey || '')
      setForm((current) => ({ ...current, apiKey: '' }))
      localStorage.setItem('agentdev-permission-mode', mode)
      window.dispatchEvent(new CustomEvent('agentdev:permission-changed', { detail: { mode } }))
      setMsg('Saved')
      setTimeout(() => setMsg(''), 2000)
    } catch (error) {
      setMsg(`Save failed: ${error.message}`)
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
            <h2 className="text-lg font-semibold">Permission Mode</h2>
            <div className="grid grid-cols-1 gap-2">
              <button type="button" onClick={() => setForm({ ...form, permissionMode: 'default' })} className={`flex items-start gap-3 rounded-lg border p-3 text-left ${!isFull ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/5' : 'border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]'}`}>
                <Shield size={18} className={!isFull ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-muted)]'} />
                <div><div className="text-sm font-medium">Normal</div><div className="text-xs text-[color:var(--text-muted)]">Plain chat. Tools and skills stay hidden.</div></div>
              </button>
              <button type="button" onClick={() => setForm({ ...form, permissionMode: 'full' })} className={`flex items-start gap-3 rounded-lg border p-3 text-left ${isFull ? 'border-[color:var(--success)] bg-[color:var(--success)]/5' : 'border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]'}`}>
                <ShieldCheck size={18} className={isFull ? 'text-[color:var(--success)]' : 'text-[color:var(--text-muted)]'} />
                <div><div className="text-sm font-medium">Full Permission</div><div className="text-xs text-[color:var(--text-muted)]">The agent can call local file, shell, skill, and document tools.</div></div>
              </button>
            </div>
          </div>

          <div className="border-t border-[color:var(--border)]" />
          <h2 className="text-lg font-semibold">Model</h2>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">DeepSeek API Key<input type="password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder={maskedKey || 'sk-...'} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">Base URL<input value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">Model<select value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"><option value="deepseek-chat">deepseek-chat</option><option value="deepseek-reasoner">deepseek-reasoner</option></select></label>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">Temperature: {form.temperature}<input type="range" min="0" max="2" step="0.1" value={form.temperature} onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) })} className="w-full" /></label>
        </div>
      )}

      {tab === 'workspace' && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Workspace</h2>
            <p className="text-xs text-[color:var(--text-muted)]">Default cwd for shell commands and generated outputs. This is not a hard file-access boundary.</p>
          </div>
          <div className="flex gap-2">
            <input value={form.workspace_root} onChange={(event) => setForm({ ...form, workspace_root: event.target.value })} className="min-w-0 flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]" />
            <button type="button" onClick={chooseWorkspace} className="h-9 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)] flex items-center gap-1"><FolderOpen size={14} /> Pick</button>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.session_confirm_cache_enabled} onChange={(event) => setForm({ ...form, session_confirm_cache_enabled: event.target.checked })} /> Remember approved gray shell commands for this session</label>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">Extra shell whitelist<textarea value={form.shell_whitelist_extra} onChange={(event) => setForm({ ...form, shell_whitelist_extra: event.target.value })} rows={4} placeholder="one command per line" className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">Extra shell blacklist<textarea value={form.shell_blacklist_extra} onChange={(event) => setForm({ ...form, shell_blacklist_extra: event.target.value })} rows={4} placeholder="one command per line" className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
        </div>
      )}

      {tab === 'skills' && <SkillsTab />}
      {tab === 'rules' && <RulesTab />}

      {(tab === 'model' || tab === 'workspace') && (
        <button type="button" onClick={handleSave} disabled={saving} className="w-full h-9 rounded-md bg-[color:var(--accent)] text-white text-sm font-medium disabled:opacity-50">{saving ? 'Saving...' : 'Save Settings'}</button>
      )}
      {msg && <div className="text-xs text-[color:var(--text-muted)]">{msg}</div>}
    </div>
  )
}