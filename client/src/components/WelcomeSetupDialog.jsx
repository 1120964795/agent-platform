import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  KeyRound,
  RefreshCcw,
  X
} from 'lucide-react'

const GUIDE_STEPS = [
  { key: 'models', label: '模型 API', hint: '填写必须由你提供的凭据' },
  { key: 'verify', label: '检查并开始', hint: '检测必填项并进入司南' }
]

const API_KEY_LINKS = {
  deepseek: 'https://platform.deepseek.com/api_keys',
  qwen: 'https://bailian.console.aliyun.com/',
  doubao: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  browserUse: 'https://zenmux.ai/'
}

const DEFAULT_FORM = {
  deepseekApiKey: '',
  deepseekBaseUrl: 'https://api.deepseek.com',
  fallbackModel: 'deepseek-chat',
  qwenApiKey: '',
  qwenBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  qwenPrimaryModel: 'qwen-max-latest',
  qwenCodingModel: 'qwen3-coder-plus',
  doubaoVisionApiKey: '',
  doubaoVisionEndpoint: 'https://ark.cn-beijing.volces.com/api/v3',
  doubaoVisionModel: 'doubao-seed-1-6-vision-250815',
  browserUseApiKey: '',
  browserUseEndpoint: 'https://zenmux.ai/api/v1',
  browserUseModel: 'openai/gpt-5.5',
  browserUseVisionEnabled: true,
  browserUseHeadless: false
}

const MODEL_CARDS = [
  {
    key: 'deepseek',
    title: 'DeepSeek',
    role: '对话、规划和代码任务的主模型',
    apiField: 'deepseekApiKey',
    apiLabel: 'DeepSeek API Key',
    apiPlaceholder: 'sk-...',
    link: API_KEY_LINKS.deepseek,
    fields: [
      ['deepseekBaseUrl', 'Base URL'],
      ['fallbackModel', '模型']
    ]
  },
  {
    key: 'qwen',
    title: 'Qwen / DashScope',
    role: '浏览器理解、结构化任务和备用推理',
    apiField: 'qwenApiKey',
    apiLabel: 'DashScope API Key',
    apiPlaceholder: 'sk-...',
    link: API_KEY_LINKS.qwen,
    fields: [
      ['qwenBaseUrl', 'Base URL'],
      ['qwenPrimaryModel', '主模型'],
      ['qwenCodingModel', '代码模型']
    ]
  },
  {
    key: 'doubao',
    title: 'Doubao Vision',
    role: '桌面截图理解和 UI-TARS 视觉动作',
    apiField: 'doubaoVisionApiKey',
    apiLabel: 'Volcengine Ark API Key',
    apiPlaceholder: 'Ark API Key',
    link: API_KEY_LINKS.doubao,
    fields: [
      ['doubaoVisionEndpoint', 'Endpoint'],
      ['doubaoVisionModel', '视觉模型']
    ]
  },
  {
    key: 'browserUse',
    title: 'Browser Use / ZenMux',
    role: '浏览器自动化任务执行和页面视觉理解',
    apiField: 'browserUseApiKey',
    apiLabel: 'ZenMux API Key',
    apiPlaceholder: 'ZenMux API Key',
    link: API_KEY_LINKS.browserUse,
    fields: [
      ['browserUseEndpoint', 'Endpoint'],
      ['browserUseModel', '模型']
    ]
  }
]

function setupInvoke(channel, payload) {
  const invoke = window.electronAPI?.invoke
  if (!invoke) throw new Error('Electron bridge is unavailable')
  return invoke(channel, payload)
}

async function openExternalUrl(url) {
  try {
    if (window.electronAPI?.openExternal) await window.electronAPI.openExternal(url)
    else await window.electronAPI?.invoke?.('app:open-external', { url })
    if (!window.electronAPI?.openExternal && !window.electronAPI?.invoke) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  } catch (error) {
    console.error('Failed to open external link', error)
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

function getStatusText(value, positive = '已就绪', negative = '待配置') {
  if (value === undefined || value === null) return '未检测'
  return value ? positive : negative
}

function StatusPill({ ok, children }) {
  const known = typeof ok === 'boolean'
  const className = ok
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : known
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-[color:var(--border)] bg-[color:var(--bg-secondary)] text-[color:var(--text-muted)]'

  return (
    <span className={`inline-flex h-6 items-center rounded-full border px-2 text-xs ${className}`}>
      {children}
    </span>
  )
}

function StepIndicator({ current, onSelect }) {
  return (
    <div className="grid gap-2 border-b border-[color:var(--border)] px-5 py-4 sm:grid-cols-2">
      {GUIDE_STEPS.map((item, index) => {
        const done = index < current
        const active = index === current
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(index)}
            className={`min-h-[72px] rounded-md border px-3 py-2 text-left transition ${
              active
                ? 'border-[color:var(--accent)] bg-blue-50 text-[color:var(--text-primary)] shadow-[var(--shadow-sm)]'
                : 'border-[color:var(--border)] bg-[color:var(--bg-primary)] text-[color:var(--text-muted)] hover:bg-[color:var(--bg-secondary)]'
            }`}
            aria-current={active ? 'step' : undefined}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  done || active ? 'bg-[color:var(--accent)] text-white' : 'bg-[color:var(--bg-tertiary)]'
                }`}
              >
                {done ? <CheckCircle2 size={14} aria-hidden="true" /> : index + 1}
              </span>
              <span className="text-sm font-semibold">{item.label}</span>
            </div>
            <div className="mt-2 text-xs leading-relaxed">{item.hint}</div>
          </button>
        )
      })}
    </div>
  )
}

function ApiKeyInput({ card, form, maskedKeys, onPatch }) {
  const masked = maskedKeys[card.apiField]
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs font-medium text-[color:var(--text-muted)]" htmlFor={`welcome-${card.apiField}`}>
          {card.apiLabel}
        </label>
        {masked && <StatusPill ok>已保存</StatusPill>}
      </div>
      <div className="flex items-center gap-2">
        <input
          id={`welcome-${card.apiField}`}
          type="password"
          value={form[card.apiField] || ''}
          onChange={(event) => onPatch({ [card.apiField]: event.target.value })}
          placeholder={masked || card.apiPlaceholder}
          className="min-w-0 flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
        />
        <button
          type="button"
          onClick={() => openExternalUrl(card.link)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--border)] text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)] hover:text-[color:var(--accent)]"
          aria-label={`打开 ${card.title} 配置页面`}
          title={`打开 ${card.title} 配置页面`}
        >
          <ExternalLink size={15} />
        </button>
      </div>
    </div>
  )
}

function ModelCard({ card, form, maskedKeys, onPatch }) {
  return (
    <section className="space-y-3 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-[color:var(--accent)]">
          <KeyRound size={17} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{card.title}</h3>
            <StatusPill ok={Boolean(maskedKeys[card.apiField] || form[card.apiField])}>
              {maskedKeys[card.apiField] || form[card.apiField] ? '可用' : '需配置'}
            </StatusPill>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-muted)]">{card.role}</p>
        </div>
      </div>

      <ApiKeyInput card={card} form={form} maskedKeys={maskedKeys} onPatch={onPatch} />

      <div className="grid gap-2 sm:grid-cols-2">
        {card.fields.map(([field, label]) => (
          <label key={field} className="space-y-1 text-xs font-medium text-[color:var(--text-muted)]">
            {label}
            <input
              type="text"
              value={form[field] || ''}
              onChange={(event) => onPatch({ [field]: event.target.value })}
              className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm font-normal text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
            />
          </label>
        ))}
      </div>

      {card.key === 'browserUse' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-xs text-[color:var(--text-muted)]">
            <input
              type="checkbox"
              checked={form.browserUseVisionEnabled !== false}
              onChange={(event) => onPatch({ browserUseVisionEnabled: event.target.checked })}
              className="h-4 w-4 rounded border-[color:var(--border)]"
            />
            启用视觉理解
          </label>
          <label className="flex items-center gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-xs text-[color:var(--text-muted)]">
            <input
              type="checkbox"
              checked={form.browserUseHeadless !== true}
              onChange={(event) => onPatch({ browserUseHeadless: !event.target.checked })}
              className="h-4 w-4 rounded border-[color:var(--border)]"
            />
            显示浏览器窗口
          </label>
        </div>
      )}
    </section>
  )
}

function ConfigStatusRow({ label, ready }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <StatusPill ok={ready}>{getStatusText(ready)}</StatusPill>
    </div>
  )
}

function PreparedItem({ title, desc }) {
  return (
    <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CheckCircle2 size={15} className="text-emerald-600" aria-hidden="true" />
        {title}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-muted)]">{desc}</p>
    </div>
  )
}

export default function WelcomeSetupDialog({ open, onClose, onMarkSeen }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [maskedKeys, setMaskedKeys] = useState({})
  const [setupStatus, setSetupStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const modelReadyCount = useMemo(() => {
    return MODEL_CARDS.filter((card) => maskedKeys[card.apiField] || form[card.apiField]).length
  }, [form, maskedKeys])

  useEffect(() => {
    if (!open) return
    let ignored = false

    async function loadInitialState() {
      setStep(0)
      setMessage('')
      setError('')
      setLoading(true)
      try {
        const [configResult, setupResult] = await Promise.allSettled([
          setupInvoke('config:get'),
          setupInvoke('setup:status')
        ])
        if (ignored) return
        if (configResult.status === 'fulfilled') applyConfig(configResult.value?.config || {})
        if (setupResult.status === 'fulfilled') setSetupStatus(setupResult.value || null)
      } catch {
        if (!ignored) setMessage('当前是浏览器预览环境，保存和检测会在 Electron 中生效。')
      } finally {
        if (!ignored) setLoading(false)
      }
    }

    loadInitialState()
    return () => {
      ignored = true
    }
  }, [open])

  function applyConfig(config = {}) {
    setMaskedKeys({
      deepseekApiKey: config.deepseekApiKey || config.apiKey || '',
      qwenApiKey: config.qwenApiKey || '',
      doubaoVisionApiKey: config.doubaoVisionApiKey || '',
      browserUseApiKey: config.browserUseApiKey || ''
    })
    setForm((current) => ({
      ...current,
      ...config,
      deepseekApiKey: '',
      qwenApiKey: '',
      doubaoVisionApiKey: '',
      browserUseApiKey: ''
    }))
  }

  function patch(partial) {
    setForm((current) => ({ ...current, ...partial }))
  }

  async function detectSetup() {
    setLoading(true)
    setMessage('')
    setError('')
    try {
      const result = await setupInvoke('setup:status')
      setSetupStatus(result || null)
      setMessage('一键检测完成。')
    } catch (err) {
      setError(err?.message || '一键检测失败，请确认 Electron 主进程已启动。')
    } finally {
      setLoading(false)
    }
  }

  async function saveConfig(markSeen = false) {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const payload = { ...form }
      for (const field of ['deepseekApiKey', 'qwenApiKey', 'doubaoVisionApiKey', 'browserUseApiKey']) {
        if (!payload[field]) delete payload[field]
      }
      const result = await setupInvoke('config:set', payload)
      applyConfig(result?.config || {})
      if (markSeen) {
        await setupInvoke('setup:mark-welcome-shown')
        onMarkSeen?.(true)
        onClose?.()
      } else {
        setMessage('配置已保存。')
      }
    } catch (err) {
      setError(err?.message || '保存配置失败。')
    } finally {
      setSaving(false)
    }
  }

  function nextStep() {
    setStep((current) => Math.min(current + 1, GUIDE_STEPS.length - 1))
  }

  function previousStep() {
    setStep((current) => Math.max(current - 1, 0))
  }

  if (!open) return null

  const deps = setupStatus?.deps || {}
  const configReady = {
    deepseek: Boolean(maskedKeys.deepseekApiKey || form.deepseekApiKey || deps.deepseekKey),
    qwen: Boolean(maskedKeys.qwenApiKey || form.qwenApiKey),
    doubao: Boolean(maskedKeys.doubaoVisionApiKey || form.doubaoVisionApiKey || deps.doubaoKey),
    browserUse: Boolean(maskedKeys.browserUseApiKey || form.browserUseApiKey)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-3 py-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-setup-title"
    >
      <section className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-primary)] shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b border-[color:var(--border)] px-5 py-4">
          <div>
            <h2 id="welcome-setup-title" className="text-lg font-semibold">
              司南 API 配置向导
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[color:var(--text-muted)]">
              安装与首次启动已自动准备本地默认项；这里仅保留必须由你提供的模型 API、Endpoint 和 Model。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)] hover:text-[color:var(--text-primary)]"
            aria-label="关闭配置向导"
            title="关闭"
          >
            <X size={17} />
          </button>
        </header>

        <StepIndicator current={step} onSelect={setStep} />

        {(error || message) && (
          <div className="border-b border-[color:var(--border)] px-5 py-3">
            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            ) : (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto bg-[color:var(--bg-secondary)] p-5">
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">模型 API 配置</h3>
                  <p className="mt-1 text-sm text-[color:var(--text-muted)]">
                    当前已识别 {modelReadyCount} / {MODEL_CARDS.length} 个模型凭据。空白 Key 不会覆盖已保存的密钥。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => saveConfig(false)}
                  disabled={saving}
                  className="h-9 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)] disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存模型配置'}
                </button>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {MODEL_CARDS.map((card) => (
                  <ModelCard key={card.key} card={card} form={form} maskedKeys={maskedKeys} onPatch={patch} />
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">一键检测</h3>
                  <p className="mt-1 text-sm text-[color:var(--text-muted)]">
                    保存前检测模型凭据是否已经填写。检测只读取状态，不会写入配置。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={detectSetup}
                  disabled={loading}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)] disabled:opacity-50"
                >
                  <RefreshCcw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
                  {loading ? '检测中...' : '一键检测'}
                </button>
              </div>

              <section className="grid gap-3 md:grid-cols-2">
                <div className="space-y-3 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] p-4">
                  <h4 className="text-sm font-semibold">需要你配置</h4>
                  <div className="grid gap-2">
                    <ConfigStatusRow label="DeepSeek Key" ready={configReady.deepseek} />
                    <ConfigStatusRow label="Qwen / DashScope Key" ready={configReady.qwen} />
                    <ConfigStatusRow label="Doubao Vision Key" ready={configReady.doubao} />
                    <ConfigStatusRow label="Browser Use / ZenMux Key" ready={configReady.browserUse} />
                  </div>
                </div>

                <div className="space-y-3 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] p-4">
                  <h4 className="text-sm font-semibold">安装与首次启动已自动准备</h4>
                  <div className="grid gap-2">
                    <PreparedItem title="桥接进程" desc="随 Electron 主进程启动并维护本地连接，不再需要在向导里手动启动。" />
                    <PreparedItem title="浏览器执行依赖" desc="打包时放入随包目录，启动桥接进程时自动注入 Python 搜索路径。" />
                    <PreparedItem title="本地默认值" desc="目录、模拟执行开关和审批策略使用安装默认值，后续可在设置页细调。" />
                  </div>
                </div>
              </section>

              <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-800">
                完成后，司南会把配置保存到本机；模型 Key 留空时不会覆盖已有值。后续也可以从设置页重新打开 API 配置向导。
              </section>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--border)] px-5 py-4">
          <button
            type="button"
            onClick={previousStep}
            disabled={step === 0}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={15} aria-hidden="true" />
            上一步
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => saveConfig(false)}
              disabled={saving}
              className="h-9 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)] disabled:opacity-50"
            >
              {saving ? '保存中...' : '仅保存'}
            </button>
            {step < GUIDE_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={nextStep}
                className="inline-flex h-9 items-center gap-1 rounded-md bg-[color:var(--accent)] px-3 text-sm font-medium text-white"
              >
                下一步
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => saveConfig(true)}
                disabled={saving}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-[color:var(--accent)] px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                保存并进入司南
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  )
}
