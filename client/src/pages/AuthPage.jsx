import { useEffect, useState } from 'react'
import { ChevronDown, Eye, EyeOff, LogIn, UserCircle, UserPlus } from 'lucide-react'

const INITIAL_FORM = {
  username: '',
  password: '',
  confirmPassword: ''
}

function getInitialLoginForm(initialLoginPrefs) {
  if (!initialLoginPrefs?.rememberPassword) {
    return INITIAL_FORM
  }

  return {
    ...INITIAL_FORM,
    username: initialLoginPrefs.username || '',
    password: initialLoginPrefs.password || ''
  }
}

function getInitialOptions(initialLoginPrefs) {
  return {
    rememberPassword: Boolean(initialLoginPrefs?.rememberPassword),
    autoLogin: Boolean(initialLoginPrefs?.autoLogin)
  }
}

function validateAuthForm(mode, form) {
  const fieldErrors = {}
  const username = form.username.trim()
  const password = form.password
  const confirmPassword = form.confirmPassword

  if (!username) {
    fieldErrors.username = '请输入用户名'
  }

  if (!password) {
    fieldErrors.password = '请输入密码'
  } else if (password.length < 6) {
    fieldErrors.password = '密码长度不能少于 6 位'
  }

  if (mode === 'register') {
    if (!confirmPassword) {
      fieldErrors.confirmPassword = '请再次输入密码'
    } else if (password && confirmPassword !== password) {
      fieldErrors.confirmPassword = '两次输入的密码不一致'
    }
  }

  return fieldErrors
}

export default function AuthPage({
  initialLoginPrefs,
  usernameOptions = [],
  onLogin,
  onRegister,
  message
}) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(() => getInitialLoginForm(initialLoginPrefs))
  const [fieldErrors, setFieldErrors] = useState({})
  const [formMessage, setFormMessage] = useState(message || null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [usernameMenuOpen, setUsernameMenuOpen] = useState(false)
  const [options, setOptions] = useState(() => getInitialOptions(initialLoginPrefs))
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setForm(getInitialLoginForm(initialLoginPrefs))
    setOptions(getInitialOptions(initialLoginPrefs))
  }, [initialLoginPrefs])

  useEffect(() => {
    setFormMessage(message || null)
  }, [message])

  const isRegister = mode === 'register'
  const loginUsernameOptions = isRegister ? [] : usernameOptions
  const hasUsernameOptions = loginUsernameOptions.length > 0
  const title = isRegister ? '注册账号' : '登录账号'
  const submitLabel = isRegister ? '注册' : '登录'
  const SubmitIcon = isRegister ? UserPlus : LogIn

  function updateField(name, value) {
    setForm(current => ({ ...current, [name]: value }))
    setFieldErrors(current => ({ ...current, [name]: '' }))
    if (formMessage?.type === 'error') {
      setFormMessage(null)
    }
    if (name === 'username') {
      setUsernameMenuOpen(false)
    }
  }

  function updateOption(name, checked) {
    setOptions(current => {
      if (name === 'autoLogin' && checked) {
        return { rememberPassword: true, autoLogin: true }
      }

      if (name === 'rememberPassword' && !checked) {
        return { rememberPassword: false, autoLogin: false }
      }

      return { ...current, [name]: checked }
    })
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    setForm(nextMode === 'login' ? getInitialLoginForm(initialLoginPrefs) : INITIAL_FORM)
    setOptions(nextMode === 'login' ? getInitialOptions(initialLoginPrefs) : {
      rememberPassword: false,
      autoLogin: false
    })
    setFieldErrors({})
    setFormMessage(null)
    setShowPassword(false)
    setShowConfirmPassword(false)
    setUsernameMenuOpen(false)
  }

  function selectUsername(username) {
    const shouldFillPassword =
      initialLoginPrefs?.rememberPassword && initialLoginPrefs.username === username

    setForm(current => ({
      ...current,
      username,
      password: shouldFillPassword ? initialLoginPrefs.password || '' : ''
    }))
    setOptions(current => ({
      ...current,
      rememberPassword: shouldFillPassword ? true : current.rememberPassword,
      autoLogin: shouldFillPassword ? Boolean(initialLoginPrefs?.autoLogin) : false
    }))
    setFieldErrors(current => ({ ...current, username: '', password: '' }))
    setFormMessage(null)
    setUsernameMenuOpen(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (isSubmitting) return

    const nextErrors = validateAuthForm(mode, form)
    setFieldErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      setFormMessage({ type: 'error', text: '请先修正表单中的问题' })
      return
    }

    let result
    setIsSubmitting(true)
    try {
      result = isRegister
        ? await onRegister?.(form)
        : await onLogin?.({
            ...form,
            rememberPassword: options.rememberPassword,
            autoLogin: options.autoLogin
          })
    } catch (error) {
      result = { ok: false, message: error?.message || '操作失败，请稍后重试' }
    } finally {
      setIsSubmitting(false)
    }

    if (result?.ok) {
      if (isRegister) {
        setMode('login')
        setForm(INITIAL_FORM)
        setFieldErrors({})
        setOptions({ rememberPassword: false, autoLogin: false })
        setShowPassword(false)
        setShowConfirmPassword(false)
        setFormMessage({ type: 'success', text: '注册成功，请使用新账号登录。' })
      }
      return
    }

    setFormMessage({
      type: 'error',
      text: result?.message || '操作失败，请稍后重试'
    })
  }

  return (
    <main className="flex h-full min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_50%,#0f766e_100%)] px-5 py-5 text-[color:var(--text-primary)]">
      <section className="grid h-[calc(100vh-80px)] min-h-[560px] max-h-[680px] w-full max-w-[1120px] rounded-lg bg-white shadow-[0_24px_70px_rgba(2,6,23,0.32)] ring-1 ring-white/15 md:grid-cols-[minmax(0,1fr)_420px]">
        <div className="hidden min-h-0 flex-col justify-between overflow-hidden rounded-l-lg border-r border-white/10 bg-[linear-gradient(145deg,#1e3a8a_0%,#155e75_58%,#064e3b_100%)] p-10 text-white md:flex">
            <div>
              <div className="inline-flex rounded-md border border-white/20 bg-white/12 px-3 py-1.5 text-base font-semibold text-white shadow-[var(--shadow-sm)] backdrop-blur">
                AgentDev Lite
              </div>
              <h1 className="mt-12 max-w-md text-3xl font-semibold leading-tight text-white">
                进入你的智能助理工作台
              </h1>
              <div className="mt-9 rounded-lg border border-white/18 bg-white/12 p-4 shadow-[0_16px_36px_rgba(2,6,23,0.18)] backdrop-blur">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                </div>
                <div className="mt-5 space-y-3">
                  <div className="h-3 w-3/4 rounded bg-white/35" />
                  <div className="h-3 w-11/12 rounded bg-cyan-200/35" />
                  <div className="h-3 w-2/3 rounded bg-white/25" />
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <div className="h-14 rounded-md bg-sky-300/20" />
                  <div className="h-14 rounded-md bg-cyan-300/20" />
                  <div className="h-14 rounded-md bg-emerald-300/20" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm text-white/75">
              <div className="rounded-md border border-white/16 bg-white/12 p-4 shadow-[var(--shadow-sm)] backdrop-blur">
                <div className="font-semibold text-white">对话</div>
                <div className="mt-2">统一管理多种助理会话</div>
              </div>
              <div className="rounded-md border border-white/16 bg-white/12 p-4 shadow-[var(--shadow-sm)] backdrop-blur">
                <div className="font-semibold text-white">文件</div>
                <div className="mt-2">连接本地任务与产物</div>
              </div>
            </div>
        </div>

        <div className="relative flex min-h-0 flex-col justify-center overflow-hidden rounded-lg bg-white px-6 py-8 md:rounded-l-none md:rounded-r-lg sm:px-10">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#2563eb,#0891b2)] md:rounded-tr-lg" />
            <div className="mb-8 md:hidden">
              <div className="inline-flex rounded-md bg-blue-50 px-3 py-1.5 text-base font-semibold text-blue-700">
                AgentDev Lite
              </div>
              <h1 className="mt-8 text-3xl font-semibold leading-tight text-slate-950">
                进入你的智能助理工作台
              </h1>
            </div>

            <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>

            {formMessage && (
              <div
                className={`mt-4 rounded-md border px-4 py-3 text-sm ${
                  formMessage.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
                role="status"
              >
                {formMessage.text}
              </div>
            )}

            <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                用户名
                <div className="relative">
                  <input
                    type="text"
                    value={form.username}
                    onChange={event => updateField('username', event.target.value)}
                    className={`h-11 w-full rounded-md border bg-slate-50 px-3 pr-11 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 ${
                      fieldErrors.username ? 'border-red-300' : 'border-slate-200'
                    }`}
                    autoComplete="username"
                  />
                  {hasUsernameOptions && (
                    <button
                      type="button"
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => setUsernameMenuOpen(value => !value)}
                      className="absolute bottom-1.5 right-2 flex h-8 w-8 items-center justify-center rounded text-slate-500 transition hover:bg-blue-50 hover:text-blue-700"
                      aria-label="选择历史用户名"
                      aria-expanded={usernameMenuOpen}
                      title="选择历史用户名"
                    >
                      <ChevronDown
                        size={16}
                        className={`transition ${usernameMenuOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                  )}
                  {usernameMenuOpen && hasUsernameOptions && (
                    <div className="absolute right-0 top-[calc(100%+6px)] z-20 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-[0_16px_36px_rgba(15,23,42,0.16)]">
                      {loginUsernameOptions.map(username => (
                        <button
                          type="button"
                          key={username}
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => selectUsername(username)}
                          className="mb-1 flex h-11 w-full items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 text-left text-sm transition last:mb-0 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white text-blue-600 shadow-[var(--shadow-sm)]">
                            <UserCircle size={17} />
                          </span>
                          <span className="min-w-0 flex-1 truncate font-semibold">{username}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {fieldErrors.username && (
                  <span className="text-xs font-normal text-red-600">{fieldErrors.username}</span>
                )}
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                密码
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={event => updateField('password', event.target.value)}
                    className={`h-11 w-full rounded-md border bg-slate-50 px-3 pr-11 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 ${
                      fieldErrors.password ? 'border-red-300' : 'border-slate-200'
                    }`}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-slate-500 transition hover:bg-blue-50 hover:text-blue-700"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    title={showPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <span className="text-xs font-normal text-red-600">{fieldErrors.password}</span>
                )}
              </label>

              {!isRegister && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <label className="flex cursor-pointer items-center gap-2 text-slate-600 transition hover:text-blue-700">
                    <input
                      type="checkbox"
                      checked={options.autoLogin}
                      onChange={event => updateOption('autoLogin', event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                    />
                    <span>自动登录</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-slate-600 transition hover:text-blue-700">
                    <input
                      type="checkbox"
                      checked={options.rememberPassword}
                      onChange={event => updateOption('rememberPassword', event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                    />
                    <span>记住密码</span>
                  </label>
                </div>
              )}

              {isRegister && (
                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  确认密码
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={form.confirmPassword}
                      onChange={event => updateField('confirmPassword', event.target.value)}
                      className={`h-11 w-full rounded-md border bg-slate-50 px-3 pr-11 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 ${
                        fieldErrors.confirmPassword
                          ? 'border-red-300'
                          : 'border-slate-200'
                      }`}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(value => !value)}
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-slate-500 transition hover:bg-blue-50 hover:text-blue-700"
                      aria-label={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                      title={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && (
                    <span className="text-xs font-normal text-red-600">
                      {fieldErrors.confirmPassword}
                    </span>
                  )}
                </label>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 flex h-11 items-center justify-center gap-2 rounded-md bg-[linear-gradient(90deg,#2563eb,#0891b2)] px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(37,99,235,0.24)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <SubmitIcon size={16} />
                {isSubmitting ? '处理中...' : submitLabel}
              </button>

              <div className="pt-1 text-center text-sm text-slate-500">
                {isRegister ? '已有账号？' : '没有账号？'}
                <button
                  type="button"
                  onClick={() => switchMode(isRegister ? 'login' : 'register')}
                  className="ml-1 font-semibold text-blue-700 hover:text-teal-700 hover:underline"
                >
                  {isRegister ? '去登录' : '去注册'}
                </button>
              </div>
            </form>
        </div>
      </section>
    </main>
  )
}
