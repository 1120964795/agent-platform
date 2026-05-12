# 登录页 UI 重设计 设计文档

> **日期:** 2026-05-12
> **状态:** 设计完成
> **范围:** 仅 `agent-platform/client/src/pages/AuthPage.jsx`

**Goal:** 优化登录页视觉，传达 AionUi 的 "agent 工作流不停循环" 品牌叙事；同时把右侧表单中没有 API 后端的"假入口"（语言切换 / 忘记密码 / 三方登录）全部移除，保证 UI 业务路径只与现有 `lib/auth.js` 关联，不引入任何新依赖。

---

## 1. 背景与动因

### 1.1 当前痛点

- **左侧装饰区"塑料感"明显**：水晶球 + 玻璃浮窗（知识库/工作流/记忆/代码块）+ 动效连线 + 粒子，元素堆叠多、视觉沉重；玻璃质感和 3D 球体在当前项目其他界面都不复用，造成登录页与主界面气质割裂。
- **右侧表单存在"假入口"**：语言切换按钮、"忘记密码"链接、飞书/GitHub/Microsoft 三方登录按钮，点击后只弹出"敬请期待"toast。这些入口没有任何 API 实现，对用户构成假承诺；对维护者构成将来必须逐个对接的隐形负债。
- **品牌叙事弱**：现有左侧仅展示"功能化"卡片（"产品文档""开发规范"），不像 agent 平台应该呈现的"会做事的小队"形象。

### 1.2 改动目标

- 视觉：去除塑料感、增加叙事感、整体大气克制。
- 业务：UI 只依赖 `lib/auth.js`（即 `auth:get-status` / `auth:login` / `auth:setup` / `auth:logout` 四个 IPC channel）。不增加新的 IPC、不引入新的 API 接口、不引入新的依赖。
- 范围：只动 `AuthPage.jsx` 这一个文件；不动 `auth.js`、不动其他组件。

---

## 2. 范围

### 2.1 改动文件

| 文件 | 改动 |
|------|------|
| `agent-platform/client/src/pages/AuthPage.jsx` | 左右两侧全面重写：左侧装饰区替换；右侧移除三组无后端入口；保留所有 API 调用逻辑（validate / handleSubmit / login / setup / storeToken / onLogin）原封不动。 |

### 2.2 不动的文件

- `agent-platform/client/src/lib/auth.js` —— API client，原样保留。
- `agent-platform/client/src/App.jsx` —— 路由/状态管理，原样保留。
- 其他所有 UI 组件 —— 范围外。

### 2.3 不动的业务逻辑

`AuthPage.jsx` 内部的以下逻辑必须原样保留：

- `useState` 状态：`mode` / `showPwd` / `showPwd2` / `loading` / `form` / `remember` / `errorMsg`
- `validate()` 函数（用户名/密码校验）
- `handleSubmit()` 函数（调用 `authLogin` / `authSetup` / `storeToken` / `onLogin`）
- `switchMode()` 函数
- 所有错误提示分支（`ERROR_MESSAGES`）

---

## 3. 删除项与保留项

### 3.1 删除项（右侧表单中没有 API 后端的元素）

| 元素 | 当前实现 | 删除理由 |
|------|---------|---------|
| 语言切换按钮 `.lang-btn` | 仅渲染，无 onClick 实现 | 无 i18n 后端 |
| "忘记密码？" 链接 `.forgot` | 点击仅 `notReady('找回密码')` 弹 toast | 无后端 |
| 三方登录区 `.socials`（飞书/GitHub/Microsoft 三个按钮 + "其他登录方式" 分隔线 `.divider`） | 点击仅 `notReady(...)` 弹 toast | 无任何 OAuth 后端，无相关 IPC channel |
| `notReady()` 函数 | 与上面联动 | 没有调用者后即可删除 |
| `toast` 状态 + `useEffect` 自动隐藏 + `.auth-toast` DOM | 仅服务于 `notReady` | 同上 |

### 3.2 保留项（接 API 或服务于核心交互的元素）

| 元素 | 关联 |
|------|------|
| 品牌区（Logo Icon + "AI Agent Workflow Platform" chip + "AgentDev Lite" 名称） | 静态展示 |
| 主标题 + 副标题（登录/注册两套文案分别保留） | 静态展示 |
| 登录 / 注册 Tab（`.tabs`） | 控制 `mode` state |
| 用户名输入框（`.field` + `UserIcon`） | → `form.account` → `validate` → `authLogin`/`authSetup` |
| 密码输入框 + 眼睛切换（`LockIcon` + `eye-btn`） | → `form.password` → API |
| 确认密码（仅注册模式） | → `form.confirm` → `validate` |
| "记住我" checkbox | → `remember` state → `storeToken(token, remember)` |
| 登录按钮（`.login-btn`） | → `handleSubmit` |
| 错误提示 `.auth-error` | 显示 `ERROR_MESSAGES` |
| 用户协议（`.terms`） | 静态链接，无 onClick；保留作为合规展示 |

---

## 4. 视觉设计

### 4.1 整体布局

保留现有 60/40 左右两栏（左侧装饰区 / 右侧表单区）。窗口 100vh，无滚动。

### 4.2 左侧：莫比乌斯环 + 极光夜空

> **核心隐喻**：莫比乌斯环 = agent 工作流永不停止的循环。「INTENT · PLAN · ACT · TRACE · ∞」沿环面流动，文字穿过中央交叠时自动从亮面跨到暗面，呼应莫比乌斯"一个面走完所有面"的拓扑。

#### 4.2.1 背景

- 深色基底：`linear-gradient(180deg, #050816 0% → #0a1124 60% → #08102a 100%)`
- 极光层：三层 radial-gradient 叠加（紫蓝紫三色斑），通过 `background-position` 漂移做 18s 缓慢动画
  - 紫光（`#6366f1`）位于左上区
  - 蓝光（`#3b82f6`）位于右下区
  - 紫光（`#a855f7`）位于右上区

#### 4.2.2 星点

- 9 颗静态 `<i>` 元素散布，2px 圆点，`animation: twinkle 3.2s ease-in-out infinite alternate`（透明度 0.15 ↔ 1），各自不同 `animation-delay`。

#### 4.2.3 莫比乌斯环

实现为一个 SVG，viewBox `0 0 600 320`。

**几何**：两条 cubic Bezier 路径表示 ∞ 的两条 "strand"，stroke 加粗成带子：

```
strandA: M 530,160 C 530,40 380,40 300,160 C 220,280 70,280 70,160
strandB: M 70,160  C 70,40  220,40 300,160 C 380,280 530,280 530,160
```

绘制顺序确保 strandB 在 strandA 之上（自然交叠形成 X 交叉）。

**渲染层次**（从下到上）：

1. 大气光晕：`<ellipse>` + radialGradient `#halo`（紫到透明）
2. 地面投影：`<ellipse>` + 黑色 0.4 opacity + `feGaussianBlur(7)`
3. **strandA = 暗面**：stroke `url(#backFace)`（中灰→深灰渐变 `#475569 → #334155 → #1e293b`），stroke-width 48，linecap round
4. strandA 上下边描线：上沿 `rgba(255,255,255,0.18)` 1px 高光；下沿 `rgba(5,8,22,0.65)` 1.5px 阴影
5. **strandB 投影**：相同 strandB path，stroke 暗色 `rgba(5,8,22,0.55)` 54px，translate(4,8)，`feGaussianBlur(5)`，opacity 0.85——制造"前面那条带子在后面那条上落阴影"的立体感
6. **strandB = 亮面**：stroke `url(#frontFace)`（白→浅蓝渐变 `#ffffff → #dbeafe → #93c5fd`），stroke-width 48
7. strandB 上下边描线：上沿 `rgba(255,255,255,0.75)` 1.5px；下沿 `rgba(15,23,42,0.45)` 1.5px

**流动文字**：

```
<text class="flow-text">
  <textPath href="#textRoute" startOffset="0%">
    INTENT  ·  PLAN  ·  ACT  ·  TRACE  ·  ∞  ·  INTENT  ·  PLAN  ·  ACT  ·  TRACE  ·  ∞
    <animate attributeName="startOffset" from="0%" to="50%" dur="40s" repeatCount="indefinite"/>
  </textPath>
</text>
```

`#textRoute` 是 ∞ 路径**重复 2 圈**（同样的 cubic 序列连写两次，构成长度为 2L 的连续 path）。文字内容长度约 0.7L。这样保证：

- 任意时刻屏幕上的每个点最多被一段文字覆盖 → 无重叠
- `startOffset` 在 0% ↔ 50%（即 2L path 的一半 = 1 圈）之间循环，端点状态视觉等价 → 无缝循环

文字样式：

- `fill: #ffffff` + `mix-blend-mode: difference`：在亮面自动呈深色、在暗面自动呈白色，无需手工分段着色
- font-size 13px，weight 600，letter-spacing 5px，sans-serif

**环整体动画**：外层 `<svg>` `animation: breathe 6s ease-in-out infinite`，`translateY(0 ↔ -6px)`。

#### 4.2.4 tagline

环下方一组文字（左对齐）：

- **eyebrow**：`A NEVER-ENDING LOOP`，font-size 10.5px，letter-spacing 3.5px，uppercase，色 `#a78bfa`
- **headline**：`每一次想法 / 都是 下一次 的起点`（"下一次"用蓝→紫渐变），font-size 24px，weight 700

#### 4.2.5 顶部品牌

`<div class="brand-row">`：26×26 圆角渐变色块（`#60a5fa → #a78bfa`）+ "AgentDev Lite" 白色 14px 700。

### 4.3 右侧：克制的表单

宽度保持 500px（参考现有）。背景纯白带一层右上极淡蓝渐变；左缘 1px 浅边。

**纵向顺序**（从上到下）：

1. 平台 chip（`AI Agent Workflow Platform`，蓝色 11px 700，浅蓝胶囊背景）
2. "AgentDev Lite" 名称（26px 800，"Lite" 蓝色）
3. 主标题 `从登录开始,接入你的智能工作流`（22px 700，注册模式时切换为 `注册你的账号`）
4. 副标题 `连接知识、工具与执行,释放团队的创造力`（13px，灰）
5. 登录/注册 Tab（保持现有 `.tabs` 样式）
6. 错误提示 `.auth-error`（如有）
7. 用户名 field
8. 密码 field（带眼睛切换）
9. 确认密码 field（仅注册模式）
10. "记住我" checkbox（仅登录模式；移除右侧的"忘记密码"链接，整行只剩 checkbox）
11. 登录按钮（保持现有渐变按钮样式，loading 文案分支保留）
12. 用户协议 `.terms`（保留）

**注意：第 6 项至 11 项之间没有 "其他登录方式" 分隔线 + 社交按钮区**——直接删除。

### 4.4 动画清单

| 元素 | 动画 | 周期 |
|------|------|------|
| 极光背景 | `background-position` 漂移 | 18s alternate |
| 星点 | `opacity` 闪烁 | 3.2s alternate（各点 delay 不同） |
| 莫比乌斯环整体 | `translateY` 呼吸 | 6s alternate |
| 流动文字 | `startOffset` 0%↔50% | 40s infinite |

所有动画 CSS `prefers-reduced-motion: reduce` 媒体查询下需禁用（无障碍要求）。

---

## 5. 实现要点

### 5.1 文件结构

继续沿用现有方式：所有样式以内联 `<style>` 形式放在 `AuthStyles` 子组件中，由 `AuthPage` 末尾 `<AuthStyles />` 渲染。**不引入新文件、不动 `theme.css`、不引入第三方组件库。**

### 5.2 SVG

莫比乌斯环作为 inline SVG 直接写在 `AuthPage.jsx` 的 JSX 中（不抽组件，因为只在登录页使用一次，抽出来反而增加文件跳读成本）。`<defs>` 内定义所有 gradient / filter / path。

### 5.3 删除清单（代码级）

- 删除组件函数：`CardHeader`、`CardRow`、`Spark`（仅服务于旧装饰）
- 删除 icon 组件：`GlobeIcon`、`ChevronIcon`、`FeishuIcon`、`GitHubIcon`、`MicrosoftIcon`（仅用于即将删除的入口）
- 保留 icon 组件：`UserIcon`、`LockIcon`、`EyeIcon`、`EyeOffIcon`、`ArrowIcon`、`ShieldIcon`
- 删除函数：`notReady`
- 删除 state：`toast` 及其 `useEffect`

### 5.4 业务路径不变

`handleSubmit`、`validate`、`switchMode` 三个函数体一字不动。`useState` 列表删掉 `toast` 之后保留其余项。

### 5.5 浏览器兼容

应用主体跑在 Electron 内置 Chromium 上（参考 README "Windows 10/11 + electron"）。这意味着：

- `mix-blend-mode: difference` 可用
- SVG `<animate>` + `textPath` 可用
- `backdrop-filter` 已经在用，不引入新依赖

但需要确认：当前 Electron 版本对 SVG SMIL（`<animate>` 元素）的支持——Chromium 一直保留 SMIL，应该没问题，实现阶段做一次手测。

---

## 6. 验收

### 6.1 视觉

- [ ] 启动应用进入登录页，左侧能看到深色极光背景缓慢漂移、9 颗星点闪烁、莫比乌斯环呼吸式上下浮动、文字沿环流动
- [ ] 文字穿过中央交叠时颜色自动反转（亮面深色、暗面白色），不再出现"右侧空白"
- [ ] 右侧表单不再存在：右上角语言切换、"忘记密码"链接、"其他登录方式"分隔线、飞书/GitHub/Microsoft 三个圆形按钮
- [ ] 切换登录/注册 Tab，表单字段与文案按现有逻辑切换

### 6.2 业务

- [ ] 输入合法用户名+密码可登录，进入主界面（API 路径不变）
- [ ] 输入非法用户名（注册模式）报 `INVALID_USERNAME`
- [ ] 密码不匹配报 `BAD_CREDENTIALS`
- [ ] 注册完成后自动登录
- [ ] "记住我" 勾选时刷新页面仍保持登录态

### 6.3 性能

- [ ] 登录页加载在低端机上不卡顿；CSS 动画 60fps
- [ ] `prefers-reduced-motion: reduce` 下所有动画被禁用

### 6.4 代码

- [ ] `AuthPage.jsx` 行数 < 现有 714 行（删除的装饰逻辑多于新增的 SVG）
- [ ] `npm test` 通过
- [ ] `npm run build:client` 通过
- [ ] 无新增 npm 依赖

---

## 7. 不做项 / 越界保护

- **不改** `lib/auth.js`
- **不改** 任何 IPC channel 定义、main 进程
- **不引入** i18n 库 / OAuth SDK / 任何新的 npm 包
- **不改** 主应用 Layout、Sidebar、ChatArea、Settings 等任何其他 UI
- **不删** 用户协议链接（合规相关，即使两个 `<a>` 当前都是 `href="#"`）
- **不增加** 第二种登录入口（例如手机号、邮箱）
- **不动** WelcomeSetupDialog（首次登录后弹的引导，与登录页本身无关）

---

## 8. 实现风险

| 风险 | 缓解 |
|------|------|
| SVG SMIL `<animate>` 在某些 Electron 版本可能行为异常 | 实现期跑一次 `npm run electron:dev` 实测；若有问题用 CSS keyframe + `animation-delay` 替代 |
| `mix-blend-mode: difference` 在 SVG `<text>` 上的渲染在不同 GPU 上有差异 | 实现期截图对比；若有偏差再退回手工分段着色（按 strandA / strandB 分两层 text，颜色固定） |
| 文字 path 长度 vs 文字字符数估算偏差，导致重叠或留白回归 | 验收期视觉走查；若失衡，微调 textPath 内字符数（保留 ∞ 符号始终在前缀） |
