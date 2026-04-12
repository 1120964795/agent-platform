import { useEffect, useState } from 'react'
import { Shield, ShieldCheck } from 'lucide-react'
import { getConfig, setConfig } from '../lib/api.js'

const DEFAULT_FORM = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  temperature: 0.7,
  permissionMode: 'default'
}

export default function SettingsPanel() {
  const [form, setForm] = useState(DEFAULT_FORM)
  const [maskedKey, setMaskedKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let ignored = false

    async function loadConfig() {
      try {
        const r = await getConfig()
        if (ignored || !r.config) return
        setMaskedKey(r.config.apiKey || '')
        const mode = r.config.permissionMode || 'default'
        setForm({
          apiKey: '',
          baseUrl: r.config.baseUrl || DEFAULT_FORM.baseUrl,
          model: r.config.model || DEFAULT_FORM.model,
          temperature: r.config.temperature ?? DEFAULT_FORM.temperature,
          permissionMode: mode
        })
        localStorage.setItem('agentdev-permission-mode', mode)
      } catch (e) {
        if (!ignored) setMsg('读取配置失败: ' + e.message)
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
        temperature: Number(form.temperature)
      }
      if (!patch.apiKey) delete patch.apiKey
      const r = await setConfig(patch)
      setMaskedKey(r.config?.apiKey || '')
      setForm(current => ({ ...current, apiKey: '' }))
      // 同步权限模式到 localStorage 并广播事件
      const mode = r.config?.permissionMode || form.permissionMode
      localStorage.setItem('agentdev-permission-mode', mode)
      window.dispatchEvent(new CustomEvent('agentdev:permission-changed', { detail: { mode } }))
      setMsg('已保存')
      setTimeout(() => setMsg(''), 2000)
    } catch (e) {
      setMsg('保存失败: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  function handlePermissionChange(mode) {
    setForm(current => ({ ...current, permissionMode: mode }))
  }

  const isFull = form.permissionMode === 'full'

  return (
    <div className="p-6 space-y-5">
      {/* 权限模式 */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">权限模式</h2>
        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => handlePermissionChange('default')}
            className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
              !isFull
                ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/5'
                : 'border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]'
            }`}
          >
            <Shield size={18} className={!isFull ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-muted)]'} />
            <div>
              <div className="text-sm font-medium">默认模式</div>
              <div className="text-xs text-[color:var(--text-muted)] mt-0.5">
                仅限对话和文档生成，不访问本地文件系统
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => handlePermissionChange('full')}
            className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
              isFull
                ? 'border-[color:var(--success)] bg-[color:var(--success)]/5'
                : 'border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]'
            }`}
          >
            <ShieldCheck size={18} className={isFull ? 'text-[color:var(--success)]' : 'text-[color:var(--text-muted)]'} />
            <div>
              <div className="text-sm font-medium">全权限模式</div>
              <div className="text-xs text-[color:var(--text-muted)] mt-0.5">
                可浏览和引用本地文件，AI 主动协助文件操作
              </div>
            </div>
          </button>
        </div>
        {isFull && (
          <div className="text-xs text-[color:var(--warning,#f59e0b)] bg-[color:var(--warning,#f59e0b)]/5 rounded-md px-3 py-2">
            全权限模式下，应用可以读取你电脑上的文件。请确保你信任当前的 AI 服务提供商。
          </div>
        )}
      </div>

      {/* 分隔线 */}
      <div className="border-t border-[color:var(--border)]" />

      {/* 模型配置 */}
      <h2 className="text-lg font-semibold">模型配置</h2>

      <div className="space-y-2">
        <label className="text-xs text-[color:var(--text-muted)]">DeepSeek API Key</label>
        <input
          type="password"
          value={form.apiKey}
          onChange={e => setForm({ ...form, apiKey: e.target.value })}
          placeholder={maskedKey || 'sk-...'}
          className="w-full px-3 py-2 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] text-sm focus:outline-none focus:border-[color:var(--accent)]"
        />
        {maskedKey && <div className="text-xs text-[color:var(--text-muted)]">当前: {maskedKey}</div>}
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[color:var(--text-muted)]">Base URL</label>
        <input
          type="text"
          value={form.baseUrl}
          onChange={e => setForm({ ...form, baseUrl: e.target.value })}
          className="w-full px-3 py-2 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] text-sm focus:outline-none focus:border-[color:var(--accent)]"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[color:var(--text-muted)]">模型名</label>
        <select
          value={form.model}
          onChange={e => setForm({ ...form, model: e.target.value })}
          className="w-full px-3 py-2 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] text-sm focus:outline-none focus:border-[color:var(--accent)]"
        >
          <option value="deepseek-chat">deepseek-chat</option>
          <option value="deepseek-reasoner">deepseek-reasoner</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[color:var(--text-muted)]">Temperature: {form.temperature}</label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={form.temperature}
          onChange={e => setForm({ ...form, temperature: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full h-9 rounded-md bg-[color:var(--accent)] text-white text-sm font-medium disabled:opacity-50"
      >
        {saving ? '保存中...' : '保存'}
      </button>
      {msg && <div className="text-xs text-[color:var(--text-muted)]">{msg}</div>}
    </div>
  )
}
