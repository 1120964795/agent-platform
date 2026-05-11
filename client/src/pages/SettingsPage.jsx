import { useEffect, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { getConfig, getRuntimeStatus, setConfig } from '../lib/api.js'

const DEFAULT_FORM = {
  qwenApiKey: '',
  deepseekApiKey: '',
  deepseekBaseUrl: 'https://api.deepseek.com',
  fallbackModel: 'deepseek-chat',
  qwenBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  qwenPrimaryModel: 'qwen-max-latest',
  qwenCodingModel: 'qwen3-coder-plus',
  doubaoVisionEndpoint: 'https://ark.cn-beijing.volces.com/api/v3',
  doubaoVisionModel: 'doubao-seed-1-6-vision-250815',
  doubaoVisionApiKey: '',
  browserUseEndpoint: 'https://zenmux.ai/api/v1',
  browserUseModel: 'openai/gpt-5.5',
  browserUseApiKey: '',
  browserUseVisionEnabled: true,
  browserUseHeadless: false,
  workspace_root: '',
  permissionMode: 'default'
}

const TABS = [
  ['models', '模型'],
  ['runtime', '运行环境'],
  ['safety', '安全'],
  ['about', '关于']
]

const API_KEY_LINKS = {
  qwen: 'https://bailian.console.aliyun.com/',
  deepseek: 'https://platform.deepseek.com/api_keys',
  doubao: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  browserUse: 'https://zenmux.ai/'
}

async function openExternalUrl(url) {
  try {
    if (window.electronAPI?.openExternal) await window.electronAPI.openExternal(url)
    else await window.electronAPI?.invoke?.('app:open-external', { url })
  } catch (error) {
    console.error('Failed to open external link', error)
  }
}

function ApiKeyInput({ id, label, value, onChange, placeholder, url, savedValue }) {
  return (
    <div className="space-y-1 text-xs text-[color:var(--text-muted)]">
      <div className="flex items-center gap-2">
        <label htmlFor={id}>{label}</label>
        {savedValue && (
          <span className="rounded border border-[color:var(--border)] px-1.5 py-0.5 text-[10px] text-[color:var(--text-muted)]">
            已保存
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="password"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
        />
        <button
          type="button"
          onClick={() => openExternalUrl(url)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--border)] text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)] hover:text-[color:var(--accent)]"
          aria-label={`Open ${label} page`}
          title={url}
        >
          <ExternalLink size={14} />
        </button>
      </div>
    </div>
  )
}

function BridgeDetailCard({ label, bridge = {}, bridgeKey, onRestart, restarting = false }) {
  const diagnostics = bridge.diagnostics || {}
  const failed = bridge.state === 'failed'
  const running = bridge.state === 'running'
  const stateLabel = running ? 'Running' : failed ? 'Failed' : bridge.state || 'Unknown'
  const stateClass = running ? 'text-[color:var(--success)]' : failed ? 'text-red-500' : 'text-amber-500'

  return (
    <section className="space-y-2 rounded-md border border-[color:var(--border)] p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium">{label}</div>
        <div className="flex items-center gap-2">
          <div className={`text-xs ${stateClass}`}>{stateLabel}</div>
          {bridgeKey && (
            <button
              type="button"
              onClick={() => onRestart?.(bridgeKey)}
              disabled={restarting}
              className="h-7 rounded-md border border-[color:var(--border)] px-2 text-xs text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {restarting ? 'Restarting' : 'Restart'}
            </button>
          )}
        </div>
      </div>
      {(bridge.lastError || diagnostics.lastError) && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {bridge.lastError || diagnostics.lastError}
        </div>
      )}
      {diagnostics.nextSteps?.length > 0 && (
        <div className="space-y-1 text-xs text-[color:var(--text-muted)]">
          <div className="font-medium text-[color:var(--text-primary)]">Next steps</div>
          {diagnostics.nextSteps.map((step) => <div key={step}>- {step}</div>)}
        </div>
      )}
      {(diagnostics.stdoutLog || diagnostics.stderrLog) && (
        <div className="grid gap-1 text-xs text-[color:var(--text-muted)]">
          {diagnostics.stdoutLog && <div>stdoutLog: {diagnostics.stdoutLog}</div>}
          {diagnostics.stderrLog && <div>stderrLog: {diagnostics.stderrLog}</div>}
        </div>
      )}
    </section>
  )
}

export default function SettingsPage({ onClose, initialTab = 'models' }) {
  const [tab, setTab] = useState(initialTab)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [maskedKeys, setMaskedKeys] = useState({})
  const [runtime, setRuntime] = useState(null)
  const [bridges, setBridges] = useState({})
  const [restartingBridge, setRestartingBridge] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  function applyConfig(config = {}) {
    setMaskedKeys({
      qwenApiKey: config.qwenApiKey || '',
      deepseekApiKey: config.deepseekApiKey || config.apiKey || '',
      doubaoVisionApiKey: config.doubaoVisionApiKey || '',
      browserUseApiKey: config.browserUseApiKey || ''
    })
    setForm(current => ({ ...current, ...config, qwenApiKey: '', deepseekApiKey: '', doubaoVisionApiKey: '', browserUseApiKey: '' }))
  }

  useEffect(() => {
    let ignored = false
    async function load() {
      try {
        const bridgeStatus = window.electronAPI?.invoke?.('bridge:status') || Promise.resolve({ bridges: {} })
        const [configResult, runtimeResult, bridgeResult] = await Promise.allSettled([getConfig(), getRuntimeStatus(), bridgeStatus])
        if (ignored) return
        if (configResult.status === 'fulfilled') applyConfig(configResult.value.config || {})
        if (runtimeResult.status === 'fulfilled') setRuntime(runtimeResult.value)
        if (bridgeResult.status === 'fulfilled') setBridges(bridgeResult.value.bridges || {})
      } catch {}
    }
    load()
    return () => { ignored = true }
  }, [])

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  function patch(partial) {
    setForm(current => ({ ...current, ...partial }))
  }

  async function refreshBridgeStatus() {
    const result = await window.electronAPI?.invoke?.('bridge:status')
    setBridges(result?.bridges || {})
  }

  async function restartBridge(key) {
    setRestartingBridge(key)
    setMessage('')
    try {
      await window.electronAPI?.invoke?.('bridge:restart', { key })
      await refreshBridgeStatus()
      setMessage(`${key} restarted`)
    } catch (error) {
      setMessage(`Restart failed: ${error.message}`)
    } finally {
      setRestartingBridge('')
    }
  }

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      const payload = { ...form }
      if (!payload.qwenApiKey) delete payload.qwenApiKey
      if (!payload.deepseekApiKey) delete payload.deepseekApiKey
      if (!payload.doubaoVisionApiKey) delete payload.doubaoVisionApiKey
      if (!payload.browserUseApiKey) delete payload.browserUseApiKey
      const result = await setConfig(payload)
      applyConfig(result.config || {})
      setMessage('已保存')
    } catch (error) {
      setMessage(`保存失败：${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  function openWelcomeGuide() {
    window.dispatchEvent(new CustomEvent('aionui:open-welcome'))
    onClose?.()
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
      <section className="mx-auto flex h-full max-h-[820px] w-full max-w-3xl flex-col rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] shadow-xl">
        <header className="flex h-14 items-center justify-between border-b border-[color:var(--border)] px-5">
          <div>
            <h2 className="text-base font-semibold">设置</h2>
            <p className="text-xs text-[color:var(--text-muted)]">模型、运行环境和安全策略</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openWelcomeGuide}
              className="h-8 rounded-md border border-[color:var(--border)] px-3 text-sm text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)]"
            >
              API 配置向导
            </button>
            <button type="button" onClick={onClose} className="rounded p-1 hover:bg-[color:var(--bg-tertiary)]" aria-label="关闭设置">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="flex gap-1 border-b border-[color:var(--border)] px-5 py-3">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`h-8 rounded-md px-3 text-sm ${tab === id ? 'bg-[color:var(--accent)] text-white' : 'text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)]'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'models' && (
            <div className="space-y-5">
              <section className="space-y-3 rounded-md border border-[color:var(--border)] p-3">
                <h3 className="text-sm font-medium">Qwen</h3>
                <ApiKeyInput id="settings-qwen-api-key" label="Qwen API Key" value={form.qwenApiKey} onChange={(event) => patch({ qwenApiKey: event.target.value })} placeholder={maskedKeys.qwenApiKey || 'DashScope API Key'} url={API_KEY_LINKS.qwen} savedValue={maskedKeys.qwenApiKey} />
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Base URL<input value={form.qwenBaseUrl} onChange={(event) => patch({ qwenBaseUrl: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Primary Model<input value={form.qwenPrimaryModel} onChange={(event) => patch({ qwenPrimaryModel: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Coding Model<input value={form.qwenCodingModel} onChange={(event) => patch({ qwenCodingModel: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
              </section>

              <section className="space-y-3 rounded-md border border-[color:var(--border)] p-3">
                <h3 className="text-sm font-medium">DeepSeek</h3>
                <ApiKeyInput id="settings-deepseek-api-key" label="DeepSeek API Key" value={form.deepseekApiKey} onChange={(event) => patch({ deepseekApiKey: event.target.value })} placeholder={maskedKeys.deepseekApiKey || 'sk-...'} url={API_KEY_LINKS.deepseek} savedValue={maskedKeys.deepseekApiKey} />
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Base URL<input value={form.deepseekBaseUrl} onChange={(event) => patch({ deepseekBaseUrl: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Model<input value={form.fallbackModel} onChange={(event) => patch({ fallbackModel: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
              </section>

              <section className="space-y-3 rounded-md border border-[color:var(--border)] p-3">
                <h3 className="text-sm font-medium">Doubao Vision</h3>
                <ApiKeyInput id="settings-doubao-api-key" label="Doubao Vision API Key" value={form.doubaoVisionApiKey} onChange={(event) => patch({ doubaoVisionApiKey: event.target.value })} placeholder={maskedKeys.doubaoVisionApiKey || 'Volcengine Ark API Key'} url={API_KEY_LINKS.doubao} savedValue={maskedKeys.doubaoVisionApiKey} />
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Endpoint<input value={form.doubaoVisionEndpoint} onChange={(event) => patch({ doubaoVisionEndpoint: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Model<input value={form.doubaoVisionModel} onChange={(event) => patch({ doubaoVisionModel: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
              </section>

              <section className="space-y-3 rounded-md border border-[color:var(--border)] p-3">
                <h3 className="text-sm font-medium">Browser Use</h3>
                <ApiKeyInput id="settings-browser-use-api-key" label="Browser Use API Key" value={form.browserUseApiKey} onChange={(event) => patch({ browserUseApiKey: event.target.value })} placeholder={maskedKeys.browserUseApiKey || 'ZenMux API Key'} url={API_KEY_LINKS.browserUse} savedValue={maskedKeys.browserUseApiKey} />
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Endpoint<input value={form.browserUseEndpoint} onChange={(event) => patch({ browserUseEndpoint: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Model<input value={form.browserUseModel} onChange={(event) => patch({ browserUseModel: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
                <label className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]"><input type="checkbox" checked={form.browserUseVisionEnabled !== false} onChange={(event) => patch({ browserUseVisionEnabled: event.target.checked })} className="h-4 w-4 rounded border border-[color:var(--border)] bg-[color:var(--bg-secondary)]" />Vision enabled</label>
                <label className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]"><input type="checkbox" checked={form.browserUseHeadless !== true} onChange={(event) => patch({ browserUseHeadless: !event.target.checked })} className="h-4 w-4 rounded border border-[color:var(--border)] bg-[color:var(--bg-secondary)]" />Show browser window</label>
              </section>
            </div>
          )}

          {tab === 'runtime' && (
            <div className="space-y-4">
              <div className="grid gap-3">
                <BridgeDetailCard label="Browser-Use Bridge" bridge={bridges.browserUse} bridgeKey="browserUse" onRestart={restartBridge} restarting={restartingBridge === 'browserUse'} />
                <BridgeDetailCard label="UI-TARS Bridge" bridge={bridges.uitars} bridgeKey="uitars" onRestart={restartBridge} restarting={restartingBridge === 'uitars'} />
              </div>
              <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Python 路径<input value={form.pythonPath || ''} onChange={(event) => patch({ pythonPath: event.target.value })} placeholder="python" className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
              <pre className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] p-3 text-xs whitespace-pre-wrap">{JSON.stringify(runtime || {}, null, 2)}</pre>
            </div>
          )}

          {tab === 'safety' && (
            <div className="grid gap-2">
              {[
                ['default', '安全模式', '普通聊天和工具调用都经过策略检查。'],
                ['full', '全权限', '兼容旧工具，风险操作仍需要确认。'],
                ['readonly', '只读', '仅允许读取和解释，不执行写入。']
              ].map(([mode, label, desc]) => (
                <button key={mode} type="button" onClick={() => patch({ permissionMode: mode })} className={`rounded-md border p-3 text-left ${form.permissionMode === mode ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/5' : 'border-[color:var(--border)] hover:bg-[color:var(--bg-tertiary)]'}`}>
                  <div className="text-sm font-medium">{label}</div>
                  <div className="mt-1 text-xs text-[color:var(--text-muted)]">{desc}</div>
                </button>
              ))}
            </div>
          )}

          {tab === 'about' && (
            <div className="space-y-2 text-sm">
              <div>版本：0.1.0</div>
              <div>Electron：{window.electronAPI?.isElectron ? '已连接' : '浏览器预览'}</div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-[color:var(--border)] px-5 py-3">
          <div className="text-xs text-[color:var(--text-muted)]">{message}</div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)]">取消</button>
            <button type="button" onClick={save} disabled={saving} className="h-9 rounded-md bg-[color:var(--accent)] px-3 text-sm text-white disabled:opacity-50">{saving ? '保存中...' : '保存'}</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
