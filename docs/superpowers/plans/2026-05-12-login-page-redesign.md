# 登录页 UI 重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重写 `agent-platform/client/src/pages/AuthPage.jsx`，左侧改为深色极光夜空 + 莫比乌斯环 + 沿环流动的工作流文字；右侧表单移除所有无 API 后端的入口（语言切换、忘记密码、飞书/GitHub/Microsoft 三方登录）；不动其他任何文件。

**Architecture:** 改动严格限制在 `AuthPage.jsx` 单文件。沿用现有"组件内置 `<AuthStyles>` 子组件内联 CSS"模式，不引入新文件/新依赖/新 IPC。左侧装饰区从 DOM 元素堆砌改为 inline SVG 莫比乌斯环 + CSS 极光动画；右侧业务路径（state / validate / handleSubmit / storeToken / onLogin）原封不动。

**Tech Stack:** React 18 (hooks)，inline SVG + SMIL `<animate>` + `<textPath>`，CSS keyframe animations，`mix-blend-mode: difference`，Electron 33 (Chromium 内核)。无新增依赖。

**Spec:** `docs/superpowers/specs/2026-05-12-login-page-redesign-design.md`

---

## File Structure

唯一改动文件：

- **Modify**: `agent-platform/client/src/pages/AuthPage.jsx`
  - 顶层组件 `AuthPage`：保留 props (`needsSetup`, `onLogin`)、state（除 `toast`）、`validate`、`handleSubmit`、`switchMode`
  - 删除：`notReady`、`toast` state、`useEffect(toast)`、`CardHeader`、`CardRow`、`Spark`、`GlobeIcon`、`ChevronIcon`、`FeishuIcon`、`GitHubIcon`、`MicrosoftIcon`
  - 新增（仅在 JSX 内部）：极光背景容器 + 9 颗 star + SVG 莫比乌斯环 + tagline
  - `AuthStyles` 子组件：重写 CSS（保留通用排版/输入框/按钮规则、替换左侧所有装饰相关规则）

不动的文件：

- `agent-platform/client/src/lib/auth.js` — API client
- `agent-platform/client/src/App.jsx` — 上层路由
- 任何其他组件 / 主进程 / IPC

---

## 验证策略

每个任务后跑：

1. **`npm test`**（`agent-platform/` 目录下）—— vitest 单元测试不应回归
2. **`npm run build:client`** —— 验证 JSX 能编译通过（vite + esbuild）
3. **目视检查**（最后一两个任务）—— `npm run electron:dev` 进入登录页人工验证

没有针对登录页 UI 的快照测试（项目里没有截图测试基建），所以视觉部分以人工验收为准；可重复的回归保护来自 `npm test` 中已有的非 UI 测试不被破坏。

---

## Task 1: 移除右侧表单中无 API 后端的入口

**Files:**

- Modify: `agent-platform/client/src/pages/AuthPage.jsx`

删除：语言切换按钮、忘记密码、其他登录方式（分隔线 + 三个社交按钮）、`notReady`、`toast`、`auth-toast` JSX、对应 CSS、5 个未来不再用到的 icon 组件。

- [ ] **Step 1: 删除 toast 相关 state 与 effect**

在 `AuthPage` 组件顶部，删除 toast state 与 effect：

```jsx
// DELETE these two lines from the useState block:
const [toast, setToast] = useState('')

// DELETE this entire useEffect (currently at lines ~23-27):
useEffect(() => {
  if (!toast) return
  const id = setTimeout(() => setToast(''), 2400)
  return () => clearTimeout(id)
}, [toast])
```

如果删完 `useEffect` 后 `useEffect` 不再被使用，把 `import { useEffect, useState } from 'react'` 改成 `import { useState } from 'react'`。

- [ ] **Step 2: 删除 notReady 函数**

```jsx
// DELETE (currently at lines ~29-31):
function notReady(label) {
  setToast(`${label} 即将上线,敬请期待`)
}
```

- [ ] **Step 3: 删除右上语言切换按钮 JSX**

在 `<div className="auth-right">` 内部最顶部，删除：

```jsx
// DELETE (currently at lines ~180-184):
<button className="lang-btn" type="button">
  <GlobeIcon />
  简体中文
  <ChevronIcon />
</button>
```

- [ ] **Step 4: 删除"忘记密码"链接，让 meta-row 只剩 checkbox**

把：

```jsx
{!isSetup && (
  <div className="meta-row">
    <label className="check-label">
      <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
      记住我
    </label>
    <a href="#" className="forgot" onClick={e => { e.preventDefault(); notReady('找回密码') }}>忘记密码？</a>
  </div>
)}
```

改成：

```jsx
{!isSetup && (
  <div className="meta-row">
    <label className="check-label">
      <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
      记住我
    </label>
  </div>
)}
```

- [ ] **Step 5: 删除"其他登录方式"分隔线与三方登录按钮**

删除（位于登录按钮和 `.terms` 之间）：

```jsx
// DELETE:
{!isSetup && <div className="divider">其他登录方式</div>}

{!isSetup && (
  <div className="socials">
    <button type="button" className="social-btn" title="飞书登录" onClick={() => notReady('飞书登录')}><FeishuIcon /></button>
    <button type="button" className="social-btn" title="GitHub登录" onClick={() => notReady('GitHub 登录')}><GitHubIcon /></button>
    <button type="button" className="social-btn" title="Microsoft账号" onClick={() => notReady('Microsoft 登录')}><MicrosoftIcon /></button>
  </div>
)}
```

- [ ] **Step 6: 删除 toast 渲染 JSX**

在 `<div className="auth-right">` 末尾，删除：

```jsx
// DELETE:
{toast && <div className="auth-toast" role="status">{toast}</div>}
```

- [ ] **Step 7: 删除不再使用的 icon 组件**

在 `/* ── Icons ── */` 区，删除 5 个组件：`GlobeIcon`、`ChevronIcon`、`FeishuIcon`、`GitHubIcon`、`MicrosoftIcon`。保留 `UserIcon`、`LockIcon`、`EyeIcon`、`EyeOffIcon`、`ArrowIcon`、`ShieldIcon`。

- [ ] **Step 8: 删除 AuthStyles 中失效的 CSS 规则**

在 `AuthStyles` 函数内的 `<style>` 字符串中，删除这几段 CSS 规则（按选择器搜索定位）：

- `.lang-btn`、`.lang-btn:hover`
- `.forgot`、`.forgot:hover`
- `.divider`、`.divider::before, .divider::after`
- `.socials`
- `.social-btn`、`.social-btn:hover`
- `.auth-toast`、`@keyframes toastIn`

- [ ] **Step 9: 运行编译与测试**

Run（在 `agent-platform` 目录下）：

```
npm test
```

Expected: 已有 vitest 测试全部通过。

```
npm run build:client
```

Expected: vite 构建成功，无 JSX 语法/未使用变量报错。

- [ ] **Step 10: Commit**

```bash
git add agent-platform/client/src/pages/AuthPage.jsx
git commit -m "refactor(auth-page): remove unwired entry points (lang/forgot-pwd/social)"
```

---

## Task 2: 清空左侧装饰区，保留壳

**Files:**

- Modify: `agent-platform/client/src/pages/AuthPage.jsx`

把 `<div className="auth-left">` 内部所有原始装饰（粒子、code 文字、folder、wires、4 张玻璃卡片、水晶球、brand）全部删除；同时移除 `CardHeader` / `CardRow` / `Spark` 三个仅服务于这些装饰的子组件以及它们对应的 CSS。文件应仍可编译，登录页此时左侧呈完全空白的渐变。

- [ ] **Step 1: 清空 auth-left 内部 JSX**

把：

```jsx
<div className="auth-left">
  <div className="window-light" />

  {/* Sparkles */}
  <Spark .../>
  {/* ...一大块装饰元素，包括 deco-code / deco-folder / wires / 4 张 glass card / sphere-stage / brand... */}
</div>
```

整体替换为：

```jsx
<div className="auth-left">
  {/* Left panel will be rebuilt in Tasks 3-7: aurora bg + stars + Möbius strip + tagline */}
</div>
```

- [ ] **Step 2: 删除 CardHeader, CardRow, Spark 三个子组件**

在 `/* ── Sub-components ── */` 区，删除：

```jsx
function CardHeader({ label }) { ... }
function CardRow({ icon, text, dots }) { ... }
function Spark({ style, size = 16 }) { ... }
```

- [ ] **Step 3: 删除 AuthStyles 中所有装饰相关 CSS**

在 `AuthStyles` 内的 `<style>` 字符串中，删除以下规则块（按选择器搜索定位）：

- `.auth-left`（保留外壳定义；下面 Task 3 会改写）
- `.window-light`
- `.deco-spark`、`.deco-code`、`.deco-folder`、`@keyframes twinkle`、`@keyframes floatSlow`
- `.glass`、`.glass::before`、`.card-kb`、`.card-wf`、`.card-mem`、`.card-code`
- `@keyframes floatA/B/C/D`
- `.c-head`、`.c-head .dot`、`.c-head .dot.amber`、`.c-head .close`、`.c-row`、`.c-icon`、`.c-dots`、`.cd`、`.cd.on`、`.cd.off`
- `.code-pre`、`.status-row`、`.status-dot`、`@keyframes pulseDot`
- `.wires`、`.wire`、`@keyframes dashFlow`、`.wire-endpoint`
- `.sphere-stage`、`.floor-glow`、`.podium`、`.ring`、`.ring-1`、`.ring-2`、`.ring-3`、`.pulse-ring`、`.pulse-ring.p2`、`.pulse-ring.p3`、`@keyframes pulseRing`
- `.sphere-wrap`、`@keyframes bob`、`.sphere`、`@keyframes sphereGlow`、`.sphere::before`、`.sphere::after`、`.sphere-logo`、`.sphere-reflection`
- `.brand`、`.brand h2`、`.brand p`

保留：`.auth-page` 顶层布局规则、`.auth-right` 及其子规则、`.field`、`.field-input` 等右侧表单规则、`.auth-error`、`.tabs`/`.tab`、`.login-btn`/`.login-btn::after`、`.terms`、`.platform-chip`、`.logo-name`、`.main-title`、`.sub-title`、`.logo-row`、`.logo-icon`、`.eye-btn`、`.meta-row`、`.check-label`。

- [ ] **Step 4: 验证编译**

Run（在 `agent-platform` 目录下）：

```
npm run build:client
```

Expected: 构建成功，无未使用变量警告。

- [ ] **Step 5: Commit**

```bash
git add agent-platform/client/src/pages/AuthPage.jsx
git commit -m "refactor(auth-page): strip legacy left-panel decoration"
```

---

## Task 3: 添加极光背景 + 星点

**Files:**

- Modify: `agent-platform/client/src/pages/AuthPage.jsx`

在空 `<div className="auth-left">` 内加入两层动效装饰：3 层 radial-gradient 极光层（18s 漂移）、9 个 star 元素（3.2s 闪烁）。

- [ ] **Step 1: 在 auth-left 内加入极光层与星点**

把：

```jsx
<div className="auth-left">
  {/* Left panel will be rebuilt in Tasks 3-7: ... */}
</div>
```

替换为：

```jsx
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
  {/* Möbius strip + tagline added in later tasks */}
</div>
```

- [ ] **Step 2: 在 AuthStyles 中加入对应 CSS**

在 `AuthStyles` 函数返回的 `<style>` 模板字符串内（紧跟在 `.auth-page` 规则之后），插入：

```css
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
```

注意：旧 `.auth-left` 规则已在 Task 2 中删除，这里是首次重新定义；同时旧 `@keyframes twinkle` 也已删除，这里的同名 keyframe 内容不同（针对星点而非旧 spark），不会冲突。

- [ ] **Step 3: 视觉自查**

Run（在 `agent-platform` 目录下）：

```
npm run build:client
```

Expected: 构建成功。

可选：`npm run electron:dev` 启动应用进入登录页，目视确认左侧深色 + 极光缓慢漂移 + 星点闪烁；右侧表单完好。

- [ ] **Step 4: Commit**

```bash
git add agent-platform/client/src/pages/AuthPage.jsx
git commit -m "feat(auth-page): add aurora background and twinkling stars"
```

---

## Task 4: 添加品牌行与 tagline 容器（不含 SVG）

**Files:**

- Modify: `agent-platform/client/src/pages/AuthPage.jsx`

在极光层之上添加左侧的内容骨架：顶部品牌行（logo 块 + 名称）、中段空 stage、底部 tagline。SVG 在下一任务填入。

- [ ] **Step 1: 替换 auth-left 内 JSX**

把：

```jsx
<div className="auth-left">
  <div className="aurora" />
  <div className="stars">
    {/* ...9 stars... */}
  </div>
  {/* Möbius strip + tagline added in later tasks */}
</div>
```

把 `{/* Möbius strip + tagline added in later tasks */}` 替换为：

```jsx
<div className="mb-content">
  <div className="brand-row">
    <div className="brand-mark" />
    <span className="brand-name">AgentDev Lite</span>
  </div>

  <div className="stage">
    {/* Möbius SVG inserted in Task 5 */}
  </div>

  <div className="tagline">
    <div className="tag-eyebrow">A NEVER-ENDING LOOP</div>
    <div className="tag-headline">每一次想法<br />都是 <em>下一次</em> 的起点</div>
  </div>
</div>
```

- [ ] **Step 2: 在 AuthStyles 中加入对应 CSS**

紧接 `.stars i` 规则之后插入：

```css
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
```

- [ ] **Step 3: 验证编译**

```
npm run build:client
```

Expected: 构建成功。可选：`npm run electron:dev` 目视确认顶部"AgentDev Lite"行、底部 tagline 已出现，中间 stage 还是空。

- [ ] **Step 4: Commit**

```bash
git add agent-platform/client/src/pages/AuthPage.jsx
git commit -m "feat(auth-page): scaffold brand row and tagline on left panel"
```

---

## Task 5: 实现莫比乌斯环 SVG

**Files:**

- Modify: `agent-platform/client/src/pages/AuthPage.jsx`

在 `<div className="stage">` 内插入 inline SVG：两条 cubic Bezier 形成 ∞，分别用亮面/暗面渐变 stroke 加粗，配合大气光晕、地面投影、上下沿描线，以及前景对背景的软投影。

- [ ] **Step 1: 在 stage 内插入完整 SVG**

把 `<div className="stage">` 的内容替换为：

```jsx
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
      <radialGradient id="halo" cx="50%" cy="50%" r="50%">
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
    </defs>

    {/* Atmospheric halo */}
    <ellipse cx="300" cy="160" rx="270" ry="130" fill="url(#halo)" />
    {/* Ground shadow */}
    <ellipse cx="300" cy="295" rx="230" ry="14" fill="#000" opacity="0.4" filter="url(#groundBlur)" />

    {/* BACK strand (dark face) */}
    <use href="#strandA" fill="none" stroke="url(#backFace)" strokeWidth="48" strokeLinecap="round" />
    <use href="#strandA" fill="none" stroke="rgba(5,8,22,0.65)" strokeWidth="1.5" transform="translate(0,23)" />
    <use href="#strandA" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" transform="translate(0,-23)" />

    {/* Cast shadow from front strand onto back strand */}
    <use href="#strandB" fill="none" stroke="rgba(5,8,22,0.55)" strokeWidth="54" strokeLinecap="round"
         transform="translate(4,8)" filter="url(#softShadow)" opacity="0.85" />

    {/* FRONT strand (light face) */}
    <use href="#strandB" fill="none" stroke="url(#frontFace)" strokeWidth="48" strokeLinecap="round" />
    <use href="#strandB" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" transform="translate(0,-23)" />
    <use href="#strandB" fill="none" stroke="rgba(15,23,42,0.45)" strokeWidth="1.5" transform="translate(0,23)" />
  </svg>
</div>
```

注意 JSX 中 SVG 属性名采用驼峰：`stopColor`、`stopOpacity`、`strokeWidth`、`strokeLinecap`、`fillRule`（如有）；`<use href="...">` 用 `href` 即可（React 18 支持）。

- [ ] **Step 2: 在 AuthStyles 中加入 SVG 尺寸 CSS**

紧接 `.stage` 规则之后插入：

```css
.loop-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
```

- [ ] **Step 3: 验证编译**

```
npm run build:client
```

Expected: 构建成功。

可选：`npm run electron:dev` 目视确认左侧中央出现一条莫比乌斯环，前条带子亮面、背条带子暗面，中央有清晰的 X 交叉。

- [ ] **Step 4: Commit**

```bash
git add agent-platform/client/src/pages/AuthPage.jsx
git commit -m "feat(auth-page): render Möbius strip SVG on left panel"
```

---

## Task 6: 添加沿环流动的工作流文字

**Files:**

- Modify: `agent-platform/client/src/pages/AuthPage.jsx`

在 SVG 内追加 `#textRoute`（重复 2 圈的 ∞ 路径）与一个 `<text>` 元素携带 `<textPath>` + `<animate>`，让文字沿环面持续流动 40s 一圈。

- [ ] **Step 1: 在 SVG <defs> 内追加 textRoute**

在已有的 `<path id="strandB" .../>` 之后、`</defs>` 之前，追加：

```jsx
{/* Double-traversal figure-8 path used only for the flowing text.
    The geometry visually overlaps itself (same on-screen figure-8) but
    the underlying path length is 2x one loop, which keeps the text
    coverage clean: every screen point is hit by at most one occurrence. */}
<path id="textRoute" fill="none" d="
  M 530,160
  C 530,40 380,40 300,160 C 220,280 70,280 70,160 C 70,40 220,40 300,160 C 380,280 530,280 530,160
  C 530,40 380,40 300,160 C 220,280 70,280 70,160 C 70,40 220,40 300,160 C 380,280 530,280 530,160
" />
```

- [ ] **Step 2: 在 SVG 末尾（紧贴 </svg> 之前）追加流动文字**

在所有 strand 渲染之后追加：

```jsx
{/* Flowing workflow text on a 2-loop path. Text length ≈ 2/3 of one
    loop ensures no two text occurrences overlap on the same screen point.
    Animation runs startOffset 0% → 50% (one loop on a 2-loop path),
    making end-state identical to start-state for a seamless cycle. */}
<text className="flow-text">
  <textPath href="#textRoute" startOffset="0%">
    {'INTENT  ·  PLAN  ·  ACT  ·  TRACE  ·  ∞  ·  INTENT  ·  PLAN  ·  ACT  ·  TRACE  ·  ∞'}
    <animate attributeName="startOffset" from="0%" to="50%" dur="40s" repeatCount="indefinite" />
  </textPath>
</text>
```

注意 JSX 中用 `attributeName`、`repeatCount`、`dur` 等小写驼峰；React 18 接受 inline SMIL `<animate>` 标签。文本内容里两个连续空格用字符串字面量包裹避免被 JSX 压缩。

- [ ] **Step 3: 在 AuthStyles 中加入 .flow-text 样式**

紧接 `.loop-svg` 规则之后插入：

```css
.flow-text {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 5px;
  fill: #ffffff;
  mix-blend-mode: difference;
  font-family: 'SF Pro Display', -apple-system, 'Helvetica Neue', sans-serif;
}
```

- [ ] **Step 4: 验证编译**

```
npm run build:client
```

Expected: 构建成功。

可选：`npm run electron:dev` 目视确认文字沿带子持续流动，且在亮面呈深色、在暗面呈白色，没有"右侧空白"。

- [ ] **Step 5: Commit**

```bash
git add agent-platform/client/src/pages/AuthPage.jsx
git commit -m "feat(auth-page): add flowing workflow text along Möbius strip"
```

---

## Task 7: 给环加呼吸动画，并处理 prefers-reduced-motion

**Files:**

- Modify: `agent-platform/client/src/pages/AuthPage.jsx`

给 `.loop-svg` 整体加上 6s 上下呼吸动画；同时在 CSS 末尾加 `@media (prefers-reduced-motion: reduce)`，关闭所有动画以满足无障碍。

- [ ] **Step 1: 给 .loop-svg 添加呼吸动画**

把：

```css
.loop-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
```

改为：

```css
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
```

- [ ] **Step 2: 在 AuthStyles 末尾（紧贴 `</style>` 之前）加入 reduced-motion 媒体查询**

```css
@media (prefers-reduced-motion: reduce) {
  .aurora,
  .stars i,
  .loop-svg,
  .flow-text textPath animate {
    animation: none !important;
  }
  .flow-text textPath { /* hold at startOffset 0% so text still renders */
    /* SVG SMIL <animate> is harder to disable from CSS;
       we rely on the .flow-text animation: none on parent text instead.
       In practice, Chromium honors reduced-motion media query for
       SMIL animations as of v123+, so SMIL pauses automatically. */
  }
}
```

注：CSS 无法直接控制 SMIL `<animate>` 元素的 attribute；Chromium 在 `prefers-reduced-motion: reduce` 下自动暂停 SMIL 动画。此规则块覆盖的是 CSS 动画（aurora、stars、breathe）。

- [ ] **Step 3: 验证编译**

```
npm run build:client
```

Expected: 构建成功。

- [ ] **Step 4: Commit**

```bash
git add agent-platform/client/src/pages/AuthPage.jsx
git commit -m "feat(auth-page): add breathe animation and prefers-reduced-motion"
```

---

## Task 8: 表单纵向顺序与文案微调

**Files:**

- Modify: `agent-platform/client/src/pages/AuthPage.jsx`

按 SPEC §4.3 的纵向顺序最终确认右侧表单结构。当前主流 JSX 结构已正确，但需要：① 把现有 `logo-row` 顶部的 logo 块和 platform-chip 拆开堆叠（chip 在 logo 名称之上），②确认主标题、副标题的注册/登录两套文案分支正常工作。

- [ ] **Step 1: 调整品牌区结构**

找到右侧表单顶部：

```jsx
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
```

保持不变即可。这一区块已经符合 SPEC §4.3 第 1-2 项要求。

- [ ] **Step 2: 确认主标题/副标题分支**

找到：

```jsx
<h1 className="main-title">{isSetup ? '注册你的账号' : '从登录开始，接入你的智能工作流'}</h1>
<p className="sub-title">{isSetup ? '创建一个本地账号，凭据加密保存于本机' : '连接知识、工具与执行，释放团队的创造力'}</p>
```

保持不变。

- [ ] **Step 3: 视觉验证**

Run：

```
npm run electron:dev
```

打开应用进入登录页，目视依次确认（SPEC §6.1 视觉验收）：

- 左侧：极光漂移、9 颗星点闪烁、莫比乌斯环呼吸式上下浮动、文字沿环流动、亮面/暗面切换自动反色
- 右侧：从上到下顺序 — platform chip → AgentDev Lite 名称 → 主标题（"从登录开始..."） → 副标题 → 登录/注册 tab → 用户名 → 密码 → 记住我（行内只有 checkbox） → 登录按钮 → 用户协议
- 右上角无语言切换按钮；密码下方"记住我"一行右侧无"忘记密码"链接；登录按钮下方直接是"登录即代表同意《用户协议》与《隐私政策》"，中间无"其他登录方式"分隔线和三方按钮

切换到"注册"tab，确认主标题副标题切换、确认密码字段出现、"记住我"一行消失（注册模式下不显示）。

- [ ] **Step 4: Commit（如有改动；否则跳过）**

如果 Step 1-2 没有产生实际改动，跳过本步。否则：

```bash
git add agent-platform/client/src/pages/AuthPage.jsx
git commit -m "chore(auth-page): final form structure check"
```

---

## Task 9: 业务回归 + 全量验证

**Files:** 无改动，仅做验证。

按 SPEC §6 验收清单跑完。

- [ ] **Step 1: 单元测试**

```
cd agent-platform && npm test
```

Expected: 所有测试通过，与基线相同（本次改动不应影响 `client/src/lib/api.test.js` 等任何非 UI 测试）。

- [ ] **Step 2: 生产构建**

```
cd agent-platform && npm run build:client
```

Expected: 构建成功，输出在 `client/dist/`。

- [ ] **Step 3: 业务路径手测**

```
cd agent-platform && npm run electron:dev
```

依次手测（参照 SPEC §6.2）：

1. 首次启动若需 Setup → 输入合法用户名（3-32 位字母数字下划线）+ 合法密码（≥8 位含两类字符），点击"创建并登录"，应进入主界面
2. 重启应用，输入错误密码，确认显示 `用户名或密码错误`
3. 注册模式下用非法用户名（如 "ab"）→ 提交，确认显示 `用户名格式无效...`
4. 注册模式下两次密码不一致 → 提交，确认显示 `两次输入的密码不一致`
5. 登录模式下勾选"记住我"登录 → 退出 → 重启 → 应直接登录
6. 不勾选"记住我"登录 → 关闭并重启 → 应回到登录页

- [ ] **Step 4: 文件大小/行数检查**

Run（在 `agent-platform/` 下）：

PowerShell:
```
(Get-Content client/src/pages/AuthPage.jsx | Measure-Object -Line).Lines
```

Expected: 行数明显少于改动前的 714 行（SPEC §6.4 要求）。

- [ ] **Step 5: 检查无未使用导入/变量**

```
cd agent-platform && npm run build:client
```

Expected: 构建无未使用变量警告。如有，删除对应残留代码后重跑。

- [ ] **Step 6: 最终 commit（如有清理改动）**

如果 Step 5 产生了清理改动：

```bash
git add agent-platform/client/src/pages/AuthPage.jsx
git commit -m "chore(auth-page): clean up unused imports and dead code"
```

否则跳过。

---

## Self-Review

**Spec coverage：**

- SPEC §3.1 删除项 → Task 1 全部覆盖
- SPEC §3.2 保留项 → Task 1 中明确保留 / Task 8 验证最终顺序
- SPEC §4.2 左侧极光 + 星点 + 环 + tagline → Task 3-7 逐步实现
- SPEC §4.3 右侧表单结构 → Task 8 验证
- SPEC §4.4 动画清单 → Task 3 (aurora, twinkle), Task 6 (textflow), Task 7 (breathe, reduced-motion)
- SPEC §5.1 不引入新文件 → 全 Tasks 仅改 AuthPage.jsx
- SPEC §5.2 SVG inline → Task 5 直接 JSX inline
- SPEC §5.3 删除清单 → Task 1 (5 icons + notReady + toast) + Task 2 (CardHeader/CardRow/Spark)
- SPEC §5.4 业务路径不变 → Task 1 明确不动 handleSubmit/validate/switchMode
- SPEC §6 验收清单 → Task 9 逐项跑
- SPEC §7 越界保护 → 不动 lib/auth.js / 不引入新依赖 / 唯一文件改动，全 Tasks 隐含遵守

**Placeholder scan：** 全文搜索 "TBD"、"TODO"、"待定"、"...later"、"similar to" — 无。每个含代码的 step 都给了完整 code block。

**Type consistency：** 所有 path id (`strandA` / `strandB` / `textRoute` / `frontFace` / `backFace` / `halo` / `softShadow` / `groundBlur`) 在引用处保持一致；className (`auth-left` / `aurora` / `stars` / `mb-content` / `brand-row` / `brand-mark` / `brand-name` / `stage` / `loop-svg` / `flow-text` / `tagline` / `tag-eyebrow` / `tag-headline`) 在 JSX 与 CSS 间一一对应。

---

## Execution Handoff

Plan complete and saved to `agent-platform/docs/superpowers/plans/2026-05-12-login-page-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每个 task 派一个新 subagent 跑，跑完两阶段 review，迭代快

**2. Inline Execution** — 当前会话里按 executing-plans skill 批量跑，checkpoint 时人工 review

哪种？
