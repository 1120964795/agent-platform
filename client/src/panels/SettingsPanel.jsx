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
  qwenApiKey: '',
  qwenBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  qwenModel: 'qwen-plus',
  embeddingModel: '',
  temperature: 0.7,
  permissionMode: 'default',
  workspace_root: '',
  shell_whitelist_extra: '',
  shell_blacklist_extra: '',
  session_confirm_cache_enabled: true,
  advancedRiskExecutionEnabled: false
}

const TABS = [
  { id: 'model', label: 'Model' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'skills', label: 'Skills' },
  { id: 'backup', label: 'Backup' },
  { id: 'rules', label: 'Rules' }
]

function listToText(value) {
  return Array.isArray(value) ? value.join('\n') : ''
}

function textToList(value) {
  return String(value || '').split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)
}

function permissionModeKey(username) {
  return `agentdev-permission-mode:${username || 'guest'}`
}

export default function SettingsPanel({ currentUser }) {
  const username = currentUser?.username || 'guest'
  const [tab, setTab] = useState('model')
  const [form, setForm] = useState(DEFAULT_FORM)
  const [maskedKey, setMaskedKey] = useState('')
  const [maskedQwenKey, setMaskedQwenKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let ignored = false
    async function loadConfig() {
      try {
        const result = await getConfig(username)
        if (ignored || !result.config) return
        const config = result.config
        const mode = config.permissionMode || 'default'
        setMaskedKey(config.apiKey || '')
        setMaskedQwenKey(config.qwenApiKey || '')
        setForm({
          modelProvider: config.modelProvider || DEFAULT_FORM.modelProvider,
          apiKey: '',
          baseUrl: config.baseUrl || DEFAULT_FORM.baseUrl,
          model: config.model || DEFAULT_FORM.model,
          qwenApiKey: '',
          qwenBaseUrl: config.qwenBaseUrl || DEFAULT_FORM.qwenBaseUrl,
          qwenModel: config.qwenModel || DEFAULT_FORM.qwenModel,
          embeddingModel: config.embeddingModel || DEFAULT_FORM.embeddingModel,
          temperature: config.temperature ?? DEFAULT_FORM.temperature,
          permissionMode: mode,
          workspace_root: config.workspace_root || '',
          shell_whitelist_extra: listToText(config.shell_whitelist_extra),
          shell_blacklist_extra: listToText(config.shell_blacklist_extra),
          session_confirm_cache_enabled: config.session_confirm_cache_enabled !== false,
          advancedRiskExecutionEnabled: config.advancedRiskExecutionEnabled === true
        })
        localStorage.setItem(permissionModeKey(username), mode)
      } catch (error) {
        if (!ignored) setMessage(`Load failed: ${error.message}`)
      }
    }

    loadConfig()
    return () => {
      ignored = true
    }
  }, [username])

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      const patch = {
        ...form,
        temperature: Number(form.temperature),
        shell_whitelist_extra: textToList(form.shell_whitelist_extra),
        shell_blacklist_extra: textToList(form.shell_blacklist_extra)
      }
      if (!patch.apiKey) delete patch.apiKey
      if (!patch.qwenApiKey) delete patch.qwenApiKey

      const result = await setConfig(patch, username)
      const mode = result.config?.permissionMode || form.permissionMode
      setMaskedKey(result.config?.apiKey || '')
      setMaskedQwenKey(result.config?.qwenApiKey || '')
      setForm((current) => ({ ...current, apiKey: '', qwenApiKey: '' }))
      localStorage.setItem(permissionModeKey(username), mode)
      window.dispatchEvent(new CustomEvent('agentdev:permission-changed', { detail: { mode, username } }))
      window.dispatchEvent(new CustomEvent('agentdev:config-changed', {
        detail: {
          username,
          apiKeyConfigured: Boolean(result.config?.apiKey || result.config?.qwenApiKey),
          modelProvider: result.config?.modelProvider || form.modelProvider
        }
      }))
      setMessage('Saved.')
      setTimeout(() => setMessage(''), 2000)
    } catch (error) {
      setMessage(`Save failed: ${error.message}`)
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
    <div className="space-y-5 p-6">
      <div className="flex gap-1 border-b border-[color:var(--border)] pb-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`h-8 rounded-md px-3 text-sm ${tab === item.id ? 'bg-[color:var(--accent)] text-white' : 'text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)]'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'model' && (
        <div className="space-y-5">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Permission Mode</h2>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, permissionMode: 'default' })}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left ${!isFull ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/5' : 'border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]'}`}
              >
                <Shield size={18} className={!isFull ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-muted)]'} />
                <div>
                  <div className="text-sm font-medium">Default mode</div>
                  <div className="text-xs text-[color:var(--text-muted)]">Chat only, without local tool calls.</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, permissionMode: 'full' })}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left ${isFull ? 'border-[color:var(--success)] bg-[color:var(--success)]/5' : 'border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]'}`}
              >
                <ShieldCheck size={18} className={isFull ? 'text-[color:var(--success)]' : 'text-[color:var(--text-muted)]'} />
                <div>
                  <div className="text-sm font-medium">Full permission</div>
                  <div className="text-xs text-[color:var(--text-muted)]">Allow local files, shell, skills, and diagnostics.</div>
                </div>
              </button>
            </div>
          </div>

          <div className="border-t border-[color:var(--border)]" />

          <h2 className="text-lg font-semibold">Model Settings</h2>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">
            Model provider
            <select
              value={form.modelProvider}
              onChange={(event) => setForm({ ...form, modelProvider: event.target.value })}
              className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
            >
              <option value="deepseek">DeepSeek V4</option>
              <option value="qwen">Qwen</option>
            </select>
          </label>
          {form.modelProvider === 'deepseek' ? (
            <>
              <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">
                DeepSeek API Key
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                  placeholder={maskedKey || 'sk-...'}
                  className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                />
              </label>
              <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">
                DeepSeek Base URL
                <input
                  value={form.baseUrl}
                  onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
                  className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                />
              </label>
              <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">
                DeepSeek model
                <select
                  value={form.model}
                  onChange={(event) => setForm({ ...form, model: event.target.value })}
                  className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                >
                  <option value="deepseek-v4-flash">deepseek-v4-flash</option>
                  <option value="deepseek-v4-pro">deepseek-v4-pro</option>
                  <option value="deepseek-chat">deepseek-chat</option>
                  <option value="deepseek-reasoner">deepseek-reasoner</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">
                Qwen API Key
                <input
                  type="password"
                  value={form.qwenApiKey}
                  onChange={(event) => setForm({ ...form, qwenApiKey: event.target.value })}
                  placeholder={maskedQwenKey || 'DashScope API key'}
                  className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                />
              </label>
              <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">
                Qwen Base URL
                <input
                  value={form.qwenBaseUrl}
                  onChange={(event) => setForm({ ...form, qwenBaseUrl: event.target.value })}
                  className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                />
              </label>
              <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">
                Qwen model
                <select
                  value={form.qwenModel}
                  onChange={(event) => setForm({ ...form, qwenModel: event.target.value })}
                  className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                >
                  <option value="qwen-plus">qwen-plus</option>
                  <option value="qwen-turbo">qwen-turbo</option>
                  <option value="qwen-max">qwen-max</option>
                  <option value="qwen-long">qwen-long</option>
                </select>
              </label>
              <div className="rounded-md bg-[color:var(--bg-secondary)] p-2 text-xs text-[color:var(--text-muted)]">
                Qwen uses the DashScope OpenAI-compatible Chat API for conversations and tool calls.
              </div>
            </>
          )}
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">
            Temperature: {form.temperature}
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={form.temperature}
              onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) })}
              className="w-full"
            />
          </label>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">
            Embedding model
            <input
              value={form.embeddingModel}
              onChange={(event) => setForm({ ...form, embeddingModel: event.target.value })}
              placeholder="OpenAI-compatible /v1/embeddings model name"
              className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
            />
          </label>
        </div>
      )}

      {tab === 'workspace' && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Workspace</h2>
            <p className="text-xs text-[color:var(--text-muted)]">Default directory for shell commands and generated files.</p>
          </div>
          <div className="flex gap-2">
            <input
              value={form.workspace_root}
              onChange={(event) => setForm({ ...form, workspace_root: event.target.value })}
              className="min-w-0 flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
            />
            <button type="button" onClick={chooseWorkspace} className="flex h-9 items-center gap-1 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)]">
              <FolderOpen size={14} />
              Choose
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.session_confirm_cache_enabled}
              onChange={(event) => setForm({ ...form, session_confirm_cache_enabled: event.target.checked })}
            />
            Remember approved shell commands for this session
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.advancedRiskExecutionEnabled}
              onChange={(event) => setForm({ ...form, advancedRiskExecutionEnabled: event.target.checked })}
            />
            Enable advanced risk execution mode
          </label>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">
            Extra shell allowlist
            <textarea
              value={form.shell_whitelist_extra}
              onChange={(event) => setForm({ ...form, shell_whitelist_extra: event.target.value })}
              rows={4}
              placeholder="One command per line"
              className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
            />
          </label>
          <label className="block space-y-2 text-xs text-[color:var(--text-muted)]">
            Extra shell blocklist
            <textarea
              value={form.shell_blacklist_extra}
              onChange={(event) => setForm({ ...form, shell_blacklist_extra: event.target.value })}
              rows={4}
              placeholder="One command per line"
              className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
            />
          </label>
        </div>
      )}

      {tab === 'skills' && <SkillsTab />}
      {tab === 'backup' && <BackupTab setMsg={setMessage} />}
      {tab === 'rules' && <RulesTab currentUser={currentUser} />}

      {(tab === 'model' || tab === 'workspace') && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="h-9 w-full rounded-md bg-[color:var(--accent)] text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      )}

      {message && <div className="text-xs text-[color:var(--text-muted)]">{message}</div>}
    </div>
  )
}

