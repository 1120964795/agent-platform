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
        <div className="aurora" />
        <div className="stars">
          <i style={{ top: '12%', left: '24%', animationDelay: '0s' }} />
          <i style={{ top: '30%', left: '80%', animationDelay: '0.8s' }} />
          <i style={{ top: '58%', left: '12%', animationDelay: '1.5s' }} />
          <i style={{ top: '80%', left: '62%', animationDelay: '2.2s' }} />
          <i style={{ top: '8%',  left: '60%', animationDelay: '0.4s' }} />
          <i style={{ top: '42%', left: '46%', animationDelay: '1.8s' }} />
          <i style={{ top: '72%', left: '88%', animationDelay: '0.3s' }} />
          <i style={{ top: '22%', left: '6%',  animationDelay: '1.1s' }} />
          <i style={{ top: '88%', left: '30%', animationDelay: '0.6s' }} />
        </div>
        <div className="mb-content">
          <div className="brand-row">
            <div className="brand-mark" />
            <span className="brand-name">AgentDev Lite</span>
          </div>

          <div className="stage">
            <svg className="loop-svg" viewBox="0 0 600 320" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="frontFace" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.98" />
                  <stop offset="50%"  stopColor="#dbeafe" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.85" />
                </linearGradient>
                <linearGradient id="backFace" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%"   stopColor="#475569" stopOpacity="0.95" />
                  <stop offset="50%"  stopColor="#334155" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#1e293b" stopOpacity="0.95" />
                </linearGradient>
                <radialGradient id="haloGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor="#a78bfa" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                </radialGradient>
                <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="5" />
                </filter>
                <filter id="groundBlur" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="7" />
                </filter>
                <path id="strandA" d="M 530,160 C 530,40 380,40 300,160 C 220,280 70,280 70,160" />
                <path id="strandB" d="M 70,160 C 70,40 220,40 300,160 C 380,280 530,280 530,160" />
                {/* Double-traversal figure-8 path used only for the flowing text.
                    The geometry visually overlaps itself (same on-screen figure-8) but
                    the underlying path length is 2x one loop, which keeps the text
                    coverage clean: every screen point is hit by at most one occurrence. */}
                <path id="textRoute" fill="none" d="
                  M 530,160
                  C 530,40 380,40 300,160 C 220,280 70,280 70,160 C 70,40 220,40 300,160 C 380,280 530,280 530,160
                  C 530,40 380,40 300,160 C 220,280 70,280 70,160 C 70,40 220,40 300,160 C 380,280 530,280 530,160
                " />
              </defs>

              {/* Atmospheric halo */}
              <ellipse cx="300" cy="160" rx="270" ry="130" fill="url(#haloGrad)" />
              {/* Ground shadow */}
              <ellipse cx="300" cy="295" rx="230" ry="14" fill="#000" opacity="0.4" filter="url(#groundBlur)" />

              {/* BACK strand (dark face — the strip's "other side") */}
              <use href="#strandA" fill="none" stroke="url(#backFace)" strokeWidth="48" strokeLinecap="round" />
              <use href="#strandA" fill="none" stroke="rgba(5,8,22,0.65)" strokeWidth="1.5" transform="translate(0,23)" />
              <use href="#strandA" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" transform="translate(0,-23)" />

              {/* Cast shadow from front strand onto back strand */}
              <use href="#strandB" fill="none" stroke="rgba(5,8,22,0.55)" strokeWidth="54" strokeLinecap="round"
                   transform="translate(4,8)" filter="url(#softShadow)" opacity="0.85" />

              {/* FRONT strand (light face — near side of the strip) */}
              <use href="#strandB" fill="none" stroke="url(#frontFace)" strokeWidth="48" strokeLinecap="round" />
              <use href="#strandB" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" transform="translate(0,-23)" />
              <use href="#strandB" fill="none" stroke="rgba(15,23,42,0.45)" strokeWidth="1.5" transform="translate(0,23)" />

              {/* Flowing workflow text on a 2-loop path. Text length ~ 2/3 of one
                  loop ensures no two text occurrences overlap on the same screen point.
                  Animation runs startOffset 0% -> 50% (one loop on a 2-loop path),
                  making end-state identical to start-state for a seamless cycle. */}
              <text className="flow-text">
                <textPath href="#textRoute" startOffset="0%">
                  {'INTENT  ·  PLAN  ·  ACT  ·  TRACE  ·  ∞  ·  INTENT  ·  PLAN  ·  ACT  ·  TRACE  ·  ∞'}
                  <animate attributeName="startOffset" from="0%" to="50%" dur="40s" repeatCount="indefinite" />
                </textPath>
              </text>
            </svg>
          </div>

          <div className="tagline">
            <div className="tag-eyebrow">A NEVER-ENDING LOOP</div>
            <div className="tag-headline">每一次想法<br />都是 <em>下一次</em> 的起点</div>
          </div>
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
      .auth-left {
        flex: 1;
        position: relative;
        overflow: hidden;
        padding: 28px 32px;
        display: flex;
        flex-direction: column;
        background: linear-gradient(180deg, #050816 0%, #0a1124 60%, #08102a 100%);
      }

      .aurora {
        position: absolute; inset: 0;
        background:
          radial-gradient(ellipse 50% 40% at 20% 25%, rgba(99,102,241,0.45) 0%, transparent 60%),
          radial-gradient(ellipse 45% 50% at 80% 75%, rgba(59,130,246,0.40) 0%, transparent 60%),
          radial-gradient(ellipse 40% 40% at 70% 20%, rgba(168,85,247,0.32) 0%, transparent 60%);
        background-size: 140% 140%, 160% 160%, 130% 130%;
        animation: auroraDrift 18s ease-in-out infinite alternate;
        pointer-events: none;
      }
      @keyframes auroraDrift {
        0%   { background-position: 0% 0%, 100% 100%, 100% 0%; }
        100% { background-position: 100% 100%, 0% 0%, 0% 100%; }
      }

      .stars { position: absolute; inset: 0; pointer-events: none; }
      .stars i {
        position: absolute;
        width: 2px; height: 2px;
        border-radius: 50%;
        background: #cbd5e1;
        animation: twinkle 3.2s ease-in-out infinite alternate;
      }
      @keyframes twinkle {
        0%, 100% { opacity: 0.15; }
        50%      { opacity: 1; }
      }

      .mb-content {
        position: relative;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .brand-row {
        display: flex;
        align-items: center;
        gap: 11px;
        color: #fff;
      }
      .brand-mark {
        width: 28px; height: 28px;
        border-radius: 8px;
        background: linear-gradient(135deg, #60a5fa, #a78bfa);
        box-shadow: 0 4px 14px rgba(99,102,241,0.5);
        flex-shrink: 0;
      }
      .brand-name {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: -0.2px;
      }

      .stage {
        flex: 1;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 0;
      }

      .loop-svg {
        width: 100%;
        height: 100%;
        overflow: visible;
        animation: breathe 6s ease-in-out infinite alternate;
      }
      @keyframes breathe {
        0%   { transform: translateY(0); }
        100% { transform: translateY(-6px); }
      }

      .flow-text {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 5px;
        fill: #ffffff;
        mix-blend-mode: difference;
        font-family: 'SF Pro Display', -apple-system, 'Helvetica Neue', sans-serif;
      }

      .tagline { position: relative; text-align: left; }
      .tag-eyebrow {
        font-size: 10.5px;
        color: #a78bfa;
        letter-spacing: 3.5px;
        text-transform: uppercase;
        margin-bottom: 8px;
        font-weight: 600;
      }
      .tag-headline {
        font-size: 24px;
        font-weight: 700;
        color: #f8fafc;
        line-height: 1.35;
        letter-spacing: -0.5px;
      }
      .tag-headline em {
        font-style: normal;
        background: linear-gradient(90deg, #60a5fa, #a78bfa);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }

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
      @media (prefers-reduced-motion: reduce) {
        .aurora,
        .stars i,
        .loop-svg {
          animation: none !important;
        }
      }
    `}</style>
  )
}
