import { useEffect, useState } from 'react'
import { getConfig, setConfig } from '../lib/api.js'

const DEFAULT_FORM = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  temperature: 0.7
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
        setForm({
          apiKey: '',
          baseUrl: r.config.baseUrl || DEFAULT_FORM.baseUrl,
          model: r.config.model || DEFAULT_FORM.model,
          temperature: r.config.temperature ?? DEFAULT_FORM.temperature
        })
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
      setMsg('已保存')
      setTimeout(() => setMsg(''), 2000)
    } catch (e) {
      setMsg('保存失败: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
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
