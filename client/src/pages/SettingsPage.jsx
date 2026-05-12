import { useEffect, useState } from 'react'
import { ExternalLink, FileText, Presentation, RefreshCw, Trash2, X } from 'lucide-react'
import { deleteArtifact, getConfig, getRuntimeStatus, listArtifacts, openFile, setConfig } from '../lib/api.js'

const DEFAULT_FORM = {
  deepseekApiKey: '',
  deepseekBaseUrl: 'https://api.deepseek.com',
  fallbackModel: 'deepseek-chat',
  browserUseEndpoint: 'https://zenmux.ai/api/v1',
  browserUseModel: 'openai/gpt-5.5',
  browserUseApiKey: '',
  browserUseVisionEnabled: true,
  browserUseHeadless: false,
  desktopUseEndpoint: 'https://zenmux.ai/api/v1',
  desktopUseModel: 'openai/gpt-5.5',
  desktopUseApiKey: '',
  desktopUseGroundingBackend: 'manual-coordinate',
  desktopUseAllowBrowserFallback: true,
  workspace_root: '',
  permissionMode: 'default'
}

const TABS = [
  ['artifacts', 'Artifacts'],
  ['models', 'Models'],
  ['runtime', 'Runtime'],
  ['safety', 'Safety'],
  ['about', 'About']
]

const API_KEY_LINKS = {
  deepseek: 'https://platform.deepseek.com/api_keys',
  browserUse: 'https://zenmux.ai/',
  desktopUse: 'https://zenmux.ai/'
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
            Saved
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

function formatArtifactTime(value) {
  if (!value) return 'Unknown time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  return date.toLocaleString()
}

function artifactTitle(artifact = {}) {
  return artifact.title || artifact.name || artifact.filename || artifact.id || 'Untitled artifact'
}

function artifactIcon(type = '') {
  const normalized = String(type).toLowerCase()
  if (normalized.includes('ppt') || normalized.includes('presentation')) return <Presentation size={16} />
  return <FileText size={16} />
}

export default function SettingsPage({ onClose, initialTab = 'models' }) {
  const [tab, setTab] = useState(initialTab)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [maskedKeys, setMaskedKeys] = useState({})
  const [runtime, setRuntime] = useState(null)
  const [bridges, setBridges] = useState({})
  const [artifacts, setArtifacts] = useState([])
  const [artifactsLoading, setArtifactsLoading] = useState(false)
  const [restartingBridge, setRestartingBridge] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  function applyConfig(config = {}) {
    setMaskedKeys({
      deepseekApiKey: config.deepseekApiKey || config.apiKey || '',
      browserUseApiKey: config.browserUseApiKey || '',
      desktopUseApiKey: config.desktopUseApiKey || ''
    })
    setForm(current => ({
      ...current,
      ...config,
      deepseekApiKey: '',
      browserUseApiKey: '',
      desktopUseApiKey: ''
    }))
  }

  async function refreshArtifacts() {
    setArtifactsLoading(true)
    try {
      const result = await listArtifacts()
      const items = Array.isArray(result?.items) ? result.items : Array.isArray(result) ? result : []
      setArtifacts(items)
    } catch (error) {
      setMessage(`Artifact refresh failed: ${error.message}`)
    } finally {
      setArtifactsLoading(false)
    }
  }

  useEffect(() => {
    let ignored = false
    async function load() {
      try {
        const bridgeStatus = window.electronAPI?.invoke?.('bridge:status') || Promise.resolve({ bridges: {} })
        const [configResult, runtimeResult, bridgeResult, artifactsResult] = await Promise.allSettled([getConfig(), getRuntimeStatus(), bridgeStatus, listArtifacts()])
        if (ignored) return
        if (configResult.status === 'fulfilled') applyConfig(configResult.value.config || {})
        if (runtimeResult.status === 'fulfilled') setRuntime(runtimeResult.value)
        if (bridgeResult.status === 'fulfilled') setBridges(bridgeResult.value.bridges || {})
        if (artifactsResult.status === 'fulfilled') {
          const items = Array.isArray(artifactsResult.value?.items) ? artifactsResult.value.items : []
          setArtifacts(items)
        }
      } catch {}
    }
    load()
    return () => { ignored = true }
  }, [])

  useEffect(() => {
    function handleArtifactCreated() {
      refreshArtifacts()
    }
    window.addEventListener('agentdev:artifact-created', handleArtifactCreated)
    return () => window.removeEventListener('agentdev:artifact-created', handleArtifactCreated)
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

  async function openArtifact(artifact) {
    const filePath = artifact?.path || artifact?.filePath
    if (!filePath) {
      setMessage('Artifact has no file path')
      return
    }
    try {
      await openFile(filePath)
    } catch (error) {
      setMessage(`Open failed: ${error.message}`)
    }
  }

  async function removeArtifact(artifact) {
    if (!artifact?.id) return
    setMessage('')
    try {
      await deleteArtifact(artifact.id)
      await refreshArtifacts()
      setMessage('Artifact deleted')
    } catch (error) {
      setMessage(`Delete failed: ${error.message}`)
    }
  }

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      const payload = { ...form }
      if (!payload.deepseekApiKey) delete payload.deepseekApiKey
      if (!payload.browserUseApiKey) delete payload.browserUseApiKey
      if (!payload.desktopUseApiKey) delete payload.desktopUseApiKey
      const result = await setConfig(payload)
      applyConfig(result.config || {})
      setMessage('Saved')
    } catch (error) {
      setMessage(`Save failed: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
      <section className="mx-auto flex h-full max-h-[820px] w-full max-w-3xl flex-col rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] shadow-xl">
        <header className="flex h-14 items-center justify-between border-b border-[color:var(--border)] px-5">
          <div>
            <h2 className="text-base font-semibold">Settings</h2>
            <p className="text-xs text-[color:var(--text-muted)]">Models, automation runtimes, and safety policy</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-[color:var(--bg-tertiary)]" aria-label="Close settings">
            <X size={16} />
          </button>
        </header>

        <div className="flex gap-1 border-b border-[color:var(--border)] px-5 py-3">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`h-8 rounded-md px-3 text-sm ${tab === id ? 'bg-[color:var(--accent)] text-white' : 'text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)]'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'artifacts' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">Artifacts</h3>
                  <p className="text-xs text-[color:var(--text-muted)]">Generated Word, PowerPoint, and file outputs.</p>
                </div>
                <button
                  type="button"
                  onClick={refreshArtifacts}
                  disabled={artifactsLoading}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)] disabled:opacity-50"
                >
                  <RefreshCw size={14} className={artifactsLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              {artifacts.length === 0 && (
                <div className="rounded-md border border-dashed border-[color:var(--border)] p-6 text-center text-sm text-[color:var(--text-muted)]">
                  No artifacts yet.
                </div>
              )}

              <div className="space-y-2">
                {artifacts.map((artifact) => (
                  <article key={artifact.id || artifact.path || artifact.filename} className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--border)] p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--bg-secondary)] text-[color:var(--accent)]">
                        {artifactIcon(artifact.type || artifact.kind || artifact.filename)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{artifactTitle(artifact)}</div>
                        <div className="truncate text-xs text-[color:var(--text-muted)]">
                          {(artifact.type || 'file')} - {formatArtifactTime(artifact.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openArtifact(artifact)}
                        className="h-8 rounded-md border border-[color:var(--border)] px-3 text-xs hover:bg-[color:var(--bg-tertiary)]"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => removeArtifact(artifact)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--border)] text-red-500 hover:bg-red-50"
                        aria-label={`Delete ${artifactTitle(artifact)}`}
                        title="Delete artifact"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {tab === 'models' && (
            <div className="space-y-5">
              <section className="space-y-3 rounded-md border border-[color:var(--border)] p-3">
                <h3 className="text-sm font-medium">DeepSeek</h3>
                <ApiKeyInput id="settings-deepseek-api-key" label="DeepSeek API Key" value={form.deepseekApiKey} onChange={(event) => patch({ deepseekApiKey: event.target.value })} placeholder={maskedKeys.deepseekApiKey || 'sk-...'} url={API_KEY_LINKS.deepseek} savedValue={maskedKeys.deepseekApiKey} />
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Base URL<input value={form.deepseekBaseUrl} onChange={(event) => patch({ deepseekBaseUrl: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Model<input value={form.fallbackModel} onChange={(event) => patch({ fallbackModel: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
              </section>

              <section className="space-y-3 rounded-md border border-[color:var(--border)] p-3">
                <h3 className="text-sm font-medium">Browser Use</h3>
                <ApiKeyInput id="settings-browser-use-api-key" label="Browser Use API Key" value={form.browserUseApiKey} onChange={(event) => patch({ browserUseApiKey: event.target.value })} placeholder={maskedKeys.browserUseApiKey || 'ZenMux API Key'} url={API_KEY_LINKS.browserUse} savedValue={maskedKeys.browserUseApiKey} />
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Endpoint<input value={form.browserUseEndpoint} onChange={(event) => patch({ browserUseEndpoint: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Model<input value={form.browserUseModel} onChange={(event) => patch({ browserUseModel: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
                <label className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]"><input type="checkbox" checked={form.browserUseVisionEnabled !== false} onChange={(event) => patch({ browserUseVisionEnabled: event.target.checked })} className="h-4 w-4 rounded border border-[color:var(--border)] bg-[color:var(--bg-secondary)]" />Vision enabled</label>
                <label className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]"><input type="checkbox" checked={form.browserUseHeadless !== true} onChange={(event) => patch({ browserUseHeadless: !event.target.checked })} className="h-4 w-4 rounded border border-[color:var(--border)] bg-[color:var(--bg-secondary)]" />Show browser window</label>
              </section>

              <section className="space-y-3 rounded-md border border-[color:var(--border)] p-3">
                <h3 className="text-sm font-medium">Desktop Use</h3>
                <ApiKeyInput id="settings-desktop-use-api-key" label="Desktop Use API Key" value={form.desktopUseApiKey} onChange={(event) => patch({ desktopUseApiKey: event.target.value })} placeholder={maskedKeys.desktopUseApiKey || 'ZenMux API Key'} url={API_KEY_LINKS.desktopUse} savedValue={maskedKeys.desktopUseApiKey} />
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Endpoint<input value={form.desktopUseEndpoint} onChange={(event) => patch({ desktopUseEndpoint: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Model<input value={form.desktopUseModel} onChange={(event) => patch({ desktopUseModel: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Grounding backend<input value={form.desktopUseGroundingBackend} onChange={(event) => patch({ desktopUseGroundingBackend: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
                <label className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]"><input type="checkbox" checked={form.desktopUseAllowBrowserFallback !== false} onChange={(event) => patch({ desktopUseAllowBrowserFallback: event.target.checked })} className="h-4 w-4 rounded border border-[color:var(--border)] bg-[color:var(--bg-secondary)]" />Allow Browser Use key fallback</label>
              </section>
            </div>
          )}

          {tab === 'runtime' && (
            <div className="space-y-4">
              <div className="grid gap-3">
                <BridgeDetailCard label="Browser Use Bridge" bridge={bridges.browserUse} bridgeKey="browserUse" onRestart={restartBridge} restarting={restartingBridge === 'browserUse'} />
                <BridgeDetailCard label="Desktop Use Bridge" bridge={bridges.desktopUse || bridges.uitars} bridgeKey={bridges.desktopUse ? 'desktopUse' : 'uitars'} onRestart={restartBridge} restarting={restartingBridge === 'desktopUse' || restartingBridge === 'uitars'} />
              </div>
              <pre className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] p-3 text-xs whitespace-pre-wrap">{JSON.stringify(runtime || {}, null, 2)}</pre>
            </div>
          )}

          {tab === 'safety' && (
            <div className="grid gap-2">
              {[
                ['default', 'Safe mode', 'Use policy checks and confirmations for risky actions.'],
                ['full', 'Full workspace mode', 'Allow broader workspace access while keeping high-risk confirmations.']
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
              <div>Version: 0.1.0</div>
              <div>Electron: {window.electronAPI?.isElectron ? 'connected' : 'browser preview'}</div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-[color:var(--border)] px-5 py-3">
          <div className="text-xs text-[color:var(--text-muted)]">{message}</div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)]">Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="h-9 rounded-md bg-[color:var(--accent)] px-3 text-sm text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
