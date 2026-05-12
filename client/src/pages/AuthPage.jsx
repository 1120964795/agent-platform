import { useState } from 'react'
import { login as authLogin, setup as authSetup, storeToken, ERROR_MESSAGES } from '../lib/auth.js'

export default function AuthPage({ needsSetup = false, onLogin }) {
  const [mode, setMode] = useState(needsSetup ? 'register' : 'login')
  const [showPwd, setShowPwd] = useState(false)
  const [showPwd2, setShowPwd2] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ account: '', password: '', confirm: '' })
  const [remember, setRemember] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const isSetup = mode === 'register'

  function switchMode(next) {
    if (next === mode) return
    setMode(next)
    setErrorMsg('')
    setForm(f => ({ ...f, confirm: '' }))
  }

  function validate() {
    if (!form.account.trim()) return '请输入用户名'
    if (!form.password) return '请输入密码'
    if (isSetup) {
      if (!/^[A-Za-z0-9_-]{3,32}$/.test(form.account)) return ERROR_MESSAGES.INVALID_USERNAME
      if (form.password !== form.confirm) return '两次输入的密码不一致'
    }
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorMsg('')
    const v = validate()
    if (v) { setErrorMsg(v); return }
    setLoading(true)
    try {
      const result = isSetup
        ? await authSetup(form.account.trim(), form.password)
        : await authLogin(form.account.trim(), form.password, remember)
      if (!result.ok) {
        setErrorMsg(ERROR_MESSAGES[result.error] || (isSetup ? '注册失败,请重试' : '登录失败,请重试'))
        return
      }
      // Setup always persists session (TTL 30d). Otherwise honor "remember".
      storeToken(result.token, isSetup ? true : remember)
      onLogin?.(result.user)
    } catch (err) {
      console.error('[auth] submit failed', err)
      setErrorMsg(ERROR_MESSAGES.NETWORK)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      {/* ════════ LEFT PANEL ════════ */}
      <div className="auth-left">
        <div className="window-light" />

        {/* Sparkles */}
        <Spark style={{ top: 120, right: 280 }} size={20} />
        <Spark style={{ top: 380, left: 480, animationDelay: '1s' }} size={14} />
        <Spark style={{ top: 80,  right: 120, animationDelay: '2s' }} size={16} />
        <Spark style={{ top: 300, left: 140, animationDelay: '0.6s' }} size={12} />

        {/* Code decorations */}
        <div className="deco-code" style={{ top: 140, right: 350 }}>&lt;/&gt;</div>
        <div className="deco-code" style={{ bottom: 280, right: 200 }}>&lt;/&gt;</div>

        {/* Folder decoration */}
        <svg className="deco-folder" style={{ top: 200, right: 160 }} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#c7d6ff" strokeWidth="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>

        {/* Animated wires */}
        <svg className="wires" xmlns="http://www.w3.org/2000/svg">
          <path className="wire" d="M250,155 C280,155 290,210 300,225" />
          <path className="wire" d="M430,260 C480,260 495,275 510,290" />
          <path className="wire" d="M252,210 C400,210 480,260 510,310" style={{ opacity: 0.4 }} />
          <path className="wire" d="M295,440 C340,470 380,490 410,510" style={{ opacity: 0.5 }} />
          <path className="wire" d="M345,420 C360,460 380,490 410,510" style={{ opacity: 0.5 }} />
          <circle className="wire-endpoint" cx="250" cy="155" r="3" />
          <circle className="wire-endpoint" cx="300" cy="225" r="3" />
          <circle className="wire-endpoint" cx="430" cy="260" r="3" />
          <circle className="wire-endpoint" cx="510" cy="290" r="3" />
        </svg>

        {/* Cards */}
        <div className="glass card-kb">
          <CardHeader label="知识库" />
          <CardRow icon="📄" text="产品文档" />
          <CardRow icon="📋" text="开发规范" />
          <CardRow icon="📁" text="项目资料" />
          <CardRow icon="📝" text="会议纪要" />
        </div>

        <div className="glass card-wf">
          <CardHeader label="工作流" />
          <CardRow icon="🔍" text="需求分析" dots={[true, true]} />
          <CardRow icon="🎨" text="方案设计" dots={[true, true]} />
          <CardRow icon="💻" text="代码生成" dots={[false, false]} />
          <CardRow icon="✅" text="测试验证" dots={[false, false]} />
        </div>

        <div className="glass card-mem">
          <CardHeader label="记忆" />
          <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.9, paddingTop: 2 }}>
            记住你的偏好<br />延续你的思路
          </div>
        </div>

        <div className="glass card-code">
          <div className="c-head">
            <span className="dot amber" />
            <span style={{ color: '#92400e' }}>Agent 正在启动...</span>
          </div>
          <pre className="code-pre">{`def run():
  plan  = analyze()
  tools = prepare()
  result = execute()
  return result`}</pre>
          <div className="status-row">
            <span className="status-dot" />
            状态：就绪
          </div>
        </div>

        {/* Crystal sphere stage */}
        <div className="sphere-stage">
          <div className="floor-glow" />
          <div className="pulse-ring" />
          <div className="pulse-ring p2" />
          <div className="pulse-ring p3" />
          <div className="podium">
            <div className="ring ring-1" />
            <div className="ring ring-2" />
            <div className="ring ring-3" />
          </div>
          <div className="sphere-reflection" />
          <div className="sphere-wrap">
            <div className="sphere">
              <div className="sphere-logo">
                <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                  <defs>
                    <linearGradient id="logoGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
                      <stop offset="100%" stopColor="#dbeafe" stopOpacity="0.85" />
                    </linearGradient>
                  </defs>
                  <path d="M28 8L46 44H10L28 8Z" fill="url(#logoGrad)" />
                  <line x1="18" y1="32" x2="38" y2="32" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="brand">
          <h2>AgentDev Lite</h2>
          <p>轻盈的智能开发助手</p>
        </div>
      </div>

      {/* ════════ RIGHT PANEL ════════ */}
      <div className="auth-right">
        <form className="login-box" onSubmit={handleSubmit}>
          <div className="logo-row">
            <div className="logo-icon">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 4L28 28H4L16 4Z" fill="white" />
                <line x1="10" y1="20" x2="22" y2="20" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="platform-chip">AI Agent Workflow Platform</span>
              <span className="logo-name">AgentDev <span className="lite">Lite</span></span>
            </div>
          </div>

          <h1 className="main-title">{isSetup ? '注册你的账号' : '从登录开始，接入你的智能工作流'}</h1>
          <p className="sub-title">{isSetup ? '创建一个本地账号，凭据加密保存于本机' : '连接知识、工具与执行，释放团队的创造力'}</p>

          <div className="tabs">
            <button type="button" className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => switchMode('login')}>登录</button>
            <button type="button" className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => switchMode('register')}>注册</button>
          </div>

          {errorMsg && <div className="auth-error" role="alert">{errorMsg}</div>}

          <div className="field">
            <span className="field-icon"><UserIcon /></span>
            <input
              className="field-input"
              type="text"
              placeholder={isSetup ? '用户名（3-32 位字母/数字/_-）' : '用户名'}
              value={form.account}
              onChange={e => setForm(f => ({ ...f, account: e.target.value }))}
              autoComplete="username"
              disabled={loading}
            />
          </div>

          <div className="field">
            <span className="field-icon"><LockIcon /></span>
            <input
              className="field-input"
              type={showPwd ? 'text' : 'password'}
              placeholder={isSetup ? '设置密码（≥ 8 位，含至少两类字符）' : '密码'}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              autoComplete={isSetup ? 'new-password' : 'current-password'}
              disabled={loading}
            />
            <button type="button" className="eye-btn" onClick={() => setShowPwd(v => !v)}>
              {showPwd ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>

          {isSetup && (
            <div className="field">
              <span className="field-icon"><LockIcon /></span>
              <input
                className="field-input"
                type={showPwd2 ? 'text' : 'password'}
                placeholder="确认密码"
                value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                autoComplete="new-password"
                disabled={loading}
              />
              <button type="button" className="eye-btn" onClick={() => setShowPwd2(v => !v)}>
                {showPwd2 ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          )}

          {!isSetup && (
            <div className="meta-row">
              <label className="check-label">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                记住我
              </label>
            </div>
          )}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading
              ? <span>{isSetup ? '创建中...' : '登录中...'}</span>
              : (<><span>{isSetup ? '创建并登录' : '登录'}</span><ArrowIcon /></>)}
          </button>

          <div className="terms">
            <ShieldIcon />
            登录即代表同意
            <a href="#">《用户协议》</a> 与 <a href="#">《隐私政策》</a>
          </div>
        </form>

      </div>

      <AuthStyles />
    </div>
  )
}

/* ── Sub-components ── */
function CardHeader({ label }) {
  return (
    <div className="c-head">
      <span className="dot" />
      <span>{label}</span>
      <span className="close">×</span>
    </div>
  )
}

function CardRow({ icon, text, dots }) {
  return (
    <div className="c-row">
      <div className="c-icon">{icon}</div>
      {text}
      {dots && (
        <div className="c-dots">
          {dots.map((on, i) => <div key={i} className={`cd ${on ? 'on' : 'off'}`} />)}
        </div>
      )}
    </div>
  )
}

function Spark({ style, size = 16 }) {
  return (
    <svg className="deco-spark" style={style} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0l2.4 7.6L22 10l-7.6 2.4L12 20l-2.4-7.6L2 10l7.6-2.4L12 0z" />
    </svg>
  )
}

/* ── Icons ── */
const UserIcon = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
const LockIcon = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
const EyeIcon = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
const EyeOffIcon = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
const ArrowIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
const ShieldIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>

/* ── Scoped CSS injected inline so this page works without touching theme.css ── */
function AuthStyles() {
  return (
    <style>{`
      .auth-page {
        display: flex; height: 100vh; overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
        color: #0f172a;
        background:
          radial-gradient(ellipse 80% 70% at 20% 30%, rgba(186,222,255,0.55) 0%, transparent 60%),
          radial-gradient(ellipse 60% 60% at 60% 70%, rgba(199,210,254,0.45) 0%, transparent 60%),
          radial-gradient(ellipse 50% 50% at 30% 90%, rgba(219,234,254,0.6) 0%, transparent 60%),
          linear-gradient(135deg, #f0f6ff 0%, #e8eeff 40%, #f0f4ff 70%, #f4f7fc 100%);
      }
      .auth-left { flex: 1; position: relative; overflow: hidden; }
      .window-light {
        position: absolute; top: -10%; left: -10%;
        width: 50%; height: 90%;
        background: linear-gradient(125deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 50%);
        transform: skewX(-15deg);
        pointer-events: none; filter: blur(20px);
      }

      .deco-spark { position: absolute; pointer-events: none; color: #93c5fd; opacity: 0.6;
        animation: twinkle 3s ease-in-out infinite; }
      .deco-code { position: absolute; pointer-events: none;
        color: #c7d6ff; font-family: 'Courier New', monospace;
        font-weight: 600; font-size: 18px; opacity: 0.6;
        animation: floatSlow 8s ease-in-out infinite; }
      .deco-folder { position: absolute; pointer-events: none; opacity: 0.6;
        animation: floatSlow 7s ease-in-out infinite 1s; }
      @keyframes twinkle { 0%,100% { opacity: 0.3; transform: scale(0.8) } 50% { opacity: 0.9; transform: scale(1.1) } }
      @keyframes floatSlow { 0%,100% { transform: translateY(0) rotate(0) } 50% { transform: translateY(-12px) rotate(3deg) } }

      .glass {
        position: absolute;
        padding: 13px 15px;
        border-radius: 14px;
        background: linear-gradient(135deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.55) 100%);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 1px solid rgba(255,255,255,0.85);
        box-shadow: 0 1px 0 0 rgba(255,255,255,0.9) inset,
                    0 12px 32px rgba(99,140,221,0.12),
                    0 2px 8px rgba(99,140,221,0.06);
      }
      .glass::before {
        content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.95), transparent);
        border-radius: 14px 14px 0 0;
      }
      .card-kb   { top: 60px;  left: 60px;  width: 190px; animation: floatA 6s ease-in-out infinite; }
      .card-wf   { top: 180px; left: 220px; width: 210px; animation: floatB 7s ease-in-out infinite 0.6s; }
      .card-mem  { top: 230px; right: 60px; width: 175px; animation: floatC 5.5s ease-in-out infinite 0.3s; }
      .card-code { bottom: 145px; left: 50px; width: 245px; animation: floatD 8s ease-in-out infinite 1.4s; }
      @keyframes floatA { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
      @keyframes floatB { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-13px)} }
      @keyframes floatC { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      @keyframes floatD { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }

      .c-head { display: flex; align-items: center; gap: 7px; margin-bottom: 10px;
        font-size: 12.5px; font-weight: 600; color: #1e3a8a; }
      .c-head .dot { width: 8px; height: 8px; border-radius: 50%;
        background: linear-gradient(135deg, #60a5fa, #2563eb);
        box-shadow: 0 0 8px rgba(59,130,246,0.6); flex-shrink: 0; }
      .c-head .dot.amber {
        background: linear-gradient(135deg, #fbbf24, #f59e0b);
        box-shadow: 0 0 8px rgba(245,158,11,0.6);
      }
      .c-head .close { margin-left: auto; color: #cbd5e1; font-size: 15px; line-height: 1; cursor: pointer; }
      .c-row { display: flex; align-items: center; gap: 9px; padding: 4px 0;
        font-size: 12px; color: #334155; }
      .c-icon { width: 22px; height: 22px; border-radius: 5px;
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; flex-shrink: 0;
        background: linear-gradient(135deg, rgba(219,234,254,0.9), rgba(186,222,255,0.7));
        box-shadow: 0 1px 2px rgba(59,130,246,0.1); }
      .c-dots { margin-left: auto; display: flex; gap: 4px; }
      .cd { width: 6px; height: 6px; border-radius: 50%; }
      .cd.on { background: #3b82f6; box-shadow: 0 0 4px rgba(59,130,246,0.5); }
      .cd.off { background: #d6e0ed; }
      .code-pre { background: rgba(15,23,42,0.04); border-radius: 7px;
        padding: 9px 11px; font-family: 'JetBrains Mono','Courier New',monospace;
        font-size: 10.5px; line-height: 1.75; color: #334155; margin: 2px 0 0; white-space: pre; }
      .status-row { display: flex; align-items: center; gap: 6px; margin-top: 9px;
        font-size: 11.5px; color: #047857; font-weight: 500; }
      .status-dot { width: 7px; height: 7px; border-radius: 50%;
        background: #10b981; box-shadow: 0 0 6px rgba(16,185,129,0.7);
        animation: pulseDot 1.4s ease-in-out infinite; }
      @keyframes pulseDot { 0%,100% { opacity: 1; transform: scale(1) } 50% { opacity: 0.5; transform: scale(0.85) } }

      .wires { position: absolute; inset: 0; width: 100%; height: 100%;
        pointer-events: none; overflow: visible; }
      .wire { fill: none; stroke: #93c5fd; stroke-width: 1.4;
        stroke-dasharray: 5 5; stroke-linecap: round; opacity: 0.7;
        animation: dashFlow 1.8s linear infinite; }
      @keyframes dashFlow { to { stroke-dashoffset: -20 } }
      .wire-endpoint { fill: #3b82f6; filter: drop-shadow(0 0 4px rgba(59,130,246,0.7)); }

      .sphere-stage { position: absolute; bottom: 50px; left: 50%;
        transform: translateX(-50%); width: 360px; height: 360px;
        display: flex; align-items: flex-end; justify-content: center;
        pointer-events: none; }
      .floor-glow { position: absolute; bottom: 30px; left: 50%;
        transform: translateX(-50%); width: 320px; height: 80px;
        background: radial-gradient(ellipse at center, rgba(96,165,250,0.45) 0%, transparent 70%);
        filter: blur(20px); }
      .podium { position: absolute; bottom: 50px; left: 50%;
        transform: translateX(-50%); width: 290px; height: 80px;
        pointer-events: none; }
      .ring { position: absolute; left: 50%;
        border-radius: 50%; transform: translateX(-50%);
        border: 1.5px solid rgba(96,165,250,0.4);
        background: radial-gradient(ellipse at center, rgba(186,222,255,0.15) 0%, transparent 70%); }
      .ring-1 { width: 260px; height: 50px; bottom: 18px; opacity: 0.6; }
      .ring-2 { width: 200px; height: 38px; bottom: 24px; opacity: 0.75;
        border-color: rgba(96,165,250,0.55); }
      .ring-3 { width: 140px; height: 26px; bottom: 30px; opacity: 0.9;
        border-color: rgba(59,130,246,0.65);
        background: linear-gradient(180deg, rgba(186,222,255,0.4), rgba(255,255,255,0.7)); }
      .pulse-ring { position: absolute; left: 50%; bottom: 40px;
        transform: translateX(-50%); width: 200px; height: 40px;
        border-radius: 50%; border: 1.5px solid rgba(59,130,246,0.5);
        opacity: 0; animation: pulseRing 3s ease-out infinite; }
      .pulse-ring.p2 { animation-delay: 1s; }
      .pulse-ring.p3 { animation-delay: 2s; }
      @keyframes pulseRing {
        0% { transform: translateX(-50%) scale(0.4); opacity: 0.8 }
        100% { transform: translateX(-50%) scale(1.6); opacity: 0 }
      }
      .sphere-wrap { position: absolute; bottom: 60px; left: 50%;
        transform: translateX(-50%); width: 150px; height: 150px;
        animation: bob 4s ease-in-out infinite; }
      @keyframes bob {
        0%,100% { transform: translateX(-50%) translateY(0) }
        50% { transform: translateX(-50%) translateY(-6px) }
      }
      .sphere { position: relative; width: 100%; height: 100%;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 30%,
          rgba(255,255,255,0.95) 0%, rgba(219,234,254,0.85) 18%,
          rgba(147,197,253,0.7) 38%, rgba(59,130,246,0.55) 65%,
          rgba(37,99,235,0.4) 88%, rgba(29,78,216,0.5) 100%);
        box-shadow:
          inset -15px -25px 40px rgba(29,78,216,0.35),
          inset 12px 18px 35px rgba(255,255,255,0.85),
          inset 0 0 60px rgba(147,197,253,0.4),
          0 25px 50px rgba(59,130,246,0.5),
          0 0 80px rgba(96,165,250,0.45),
          0 0 30px rgba(147,197,253,0.6);
        animation: sphereGlow 3s ease-in-out infinite;
      }
      @keyframes sphereGlow {
        0%,100% { box-shadow:
          inset -15px -25px 40px rgba(29,78,216,0.35),
          inset 12px 18px 35px rgba(255,255,255,0.85),
          inset 0 0 60px rgba(147,197,253,0.4),
          0 25px 50px rgba(59,130,246,0.5),
          0 0 80px rgba(96,165,250,0.45),
          0 0 30px rgba(147,197,253,0.6); }
        50% { box-shadow:
          inset -15px -25px 40px rgba(29,78,216,0.4),
          inset 12px 18px 35px rgba(255,255,255,0.95),
          inset 0 0 60px rgba(147,197,253,0.55),
          0 25px 60px rgba(59,130,246,0.65),
          0 0 120px rgba(96,165,250,0.6),
          0 0 50px rgba(147,197,253,0.8); }
      }
      .sphere::before { content: ''; position: absolute;
        top: 8%; left: 15%; width: 45%; height: 35%;
        background: radial-gradient(ellipse at center, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 70%);
        border-radius: 50%; filter: blur(2px); }
      .sphere::after { content: ''; position: absolute;
        bottom: 8%; right: 18%; width: 30%; height: 18%;
        background: radial-gradient(ellipse at center, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 70%);
        border-radius: 50%; filter: blur(3px); }
      .sphere-logo { position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -50%); z-index: 2;
        filter: drop-shadow(0 2px 4px rgba(29,78,216,0.4)); }
      .sphere-reflection { position: absolute; bottom: 35px; left: 50%;
        transform: translateX(-50%); width: 110px; height: 18px;
        background: radial-gradient(ellipse at center, rgba(59,130,246,0.5) 0%, transparent 70%);
        border-radius: 50%; filter: blur(6px); }

      .brand { position: absolute; bottom: 28px; left: 60px; z-index: 10; }
      .brand h2 { font-size: 19px; font-weight: 700; color: #1e3a8a; letter-spacing: -0.3px; }
      .brand p { font-size: 12.5px; color: #60a5fa; margin-top: 3px; }

      /* Right panel */
      .auth-right {
        width: 500px; flex-shrink: 0;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.96)),
          radial-gradient(ellipse at top right, rgba(219,234,254,0.5), transparent 60%);
        border-left: 1px solid rgba(226,232,240,0.6);
        box-shadow: -16px 0 60px rgba(59,130,246,0.06);
        display: flex; align-items: center; justify-content: center;
        position: relative;
      }
      .login-box { width: 400px; }
      .logo-row { display: flex; align-items: center; gap: 14px; margin-bottom: 30px; }
      .logo-icon { position: relative; width: 54px; height: 54px;
        border-radius: 14px;
        background: linear-gradient(145deg, #60a5fa 0%, #3b82f6 50%, #1d4ed8 100%);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 8px 20px rgba(59,130,246,0.4),
                    0 2px 6px rgba(59,130,246,0.25),
                    inset 0 1px 0 rgba(255,255,255,0.3);
        flex-shrink: 0; }
      .logo-icon::after { content: ''; position: absolute;
        top: 2px; left: 2px; right: 2px; height: 50%;
        border-radius: 12px 12px 0 0;
        background: linear-gradient(180deg, rgba(255,255,255,0.25), transparent);
        pointer-events: none; }
      .platform-chip { display: inline-flex; align-items: center;
        background: linear-gradient(135deg, #eff6ff, #dbeafe);
        color: #2563eb; font-size: 11px; font-weight: 500;
        padding: 3px 10px; border-radius: 20px;
        width: fit-content; border: 1px solid rgba(96,165,250,0.25); }
      .logo-name { font-size: 24px; font-weight: 800;
        color: #0f172a; letter-spacing: -0.5px; margin-top: 3px; }
      .logo-name .lite { color: #3b82f6; font-weight: 700; }

      .main-title { font-size: 26px; font-weight: 700;
        color: #0f172a; letter-spacing: -0.5px;
        margin-bottom: 10px; line-height: 1.3; }
      .sub-title { font-size: 14px; color: #64748b; margin-bottom: 30px; }

      .tabs { display: flex; background: #f1f5fb;
        border: 1px solid #e8eef6; border-radius: 11px;
        padding: 4px; margin-bottom: 22px; }
      .tab { flex: 1; padding: 10px; border: none;
        background: transparent; font-size: 14px;
        font-weight: 500; color: #64748b; cursor: pointer;
        border-radius: 8px; font-family: inherit; transition: all 0.2s; }
      .tab.active { background: white; color: #1e40af;
        font-weight: 600;
        box-shadow: 0 1px 4px rgba(15,23,42,0.06),
                    0 0 0 0.5px rgba(15,23,42,0.04); }

      .field { position: relative; margin-bottom: 14px; }
      .field-icon { position: absolute; left: 15px; top: 50%;
        transform: translateY(-50%); color: #94a3b8;
        display: flex; pointer-events: none; }
      .field-input { width: 100%; padding: 14px 14px 14px 44px;
        border: 1.5px solid #e5edf7; border-radius: 11px;
        font-size: 14px; font-family: inherit; color: #0f172a;
        background: #f9fbfe; outline: none; transition: all 0.2s; }
      .field-input::placeholder { color: #b8c4d6; }
      .field-input:focus { border-color: #3b82f6;
        background: white;
        box-shadow: 0 0 0 4px rgba(59,130,246,0.12); }
      .eye-btn { position: absolute; right: 15px; top: 50%;
        transform: translateY(-50%); background: none; border: none;
        color: #94a3b8; cursor: pointer; padding: 0; display: flex; }
      .eye-btn:hover { color: #475569; }

      .meta-row { display: flex; align-items: center;
        justify-content: space-between; margin-bottom: 22px; }
      .check-label { display: flex; align-items: center;
        gap: 8px; cursor: pointer; user-select: none;
        font-size: 13.5px; color: #334155; }
      .check-label input { width: 16px; height: 16px;
        accent-color: #3b82f6; cursor: pointer; }

      .login-btn { position: relative; overflow: hidden;
        width: 100%; padding: 15px; border: none;
        border-radius: 12px;
        background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 35%, #2563eb 70%, #1d4ed8 100%);
        color: white; font-size: 16px; font-weight: 600;
        font-family: inherit; cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 10px;
        box-shadow: 0 8px 24px rgba(59,130,246,0.45),
                    0 2px 6px rgba(59,130,246,0.25),
                    inset 0 1px 0 rgba(255,255,255,0.3);
        transition: all 0.25s; margin-bottom: 26px; }
      .login-btn::after { content: ''; position: absolute;
        top: 0; left: -150%; width: 60%; height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
        transform: skewX(-25deg); transition: left 0.6s; }
      .login-btn:hover { transform: translateY(-2px);
        box-shadow: 0 12px 30px rgba(59,130,246,0.55),
                    0 4px 10px rgba(59,130,246,0.3),
                    inset 0 1px 0 rgba(255,255,255,0.4); }
      .login-btn:hover::after { left: 150%; }
      .login-btn:active { transform: translateY(0); }
      .login-btn:disabled { opacity: 0.8; cursor: not-allowed; }

      .terms { text-align: center; font-size: 12px;
        color: #94a3b8; display: flex; align-items: center;
        justify-content: center; gap: 4px; flex-wrap: wrap; }
      .terms a { color: #3b82f6; text-decoration: none; }
      .terms a:hover { text-decoration: underline; }

      .auth-error {
        margin-bottom: 14px;
        padding: 10px 14px;
        border-radius: 10px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #b91c1c;
        font-size: 13px;
        line-height: 1.5;
      }
    `}</style>
  )
}
