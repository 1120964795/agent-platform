# 模型切换 + API Key 引导 + 个性化增强 设计文档

> **日期:** 2026-05-11
> **状态:** 设计完成

**Goal:** 解决"只聊天不干活"问题：增加多模型支持、强化 system prompt、API Key 获取引导、增强用户偏好管理。

---

## 1. 背景与根因

当前 agent loop 仅使用 `deepseek-chat` 一个模型。该模型在面对"打开抖音"等操作请求时，倾向于用**文字描述行动**（"好的我来打开抖音"）而非发起 function call。这是模型行为特性，不是代码架构问题——agentLoop、tools、IPC、前端均正确连线。

## 2. 方案概览

三个改动 + 一个强化：

| # | 改动 | 目的 |
|---|------|------|
| 1 | 发送按钮左侧新增模型选择下拉框 | 用户可切换 tool-calling 更强的模型 |
| 2 | API Key 输入框旁增加官网跳转链接 | 新用户一键获取 API Key |
| 3 | 增强"偏好"Tab：手动添加/编辑 | 用户可手动录入偏好规则（补全现有只读列表） |
| 4 | System prompt 强化 | 明确工具调用规则，禁止文字替代 |

---

## 3. 优化 1：模型切换下拉框

### 3.1 UI 位置

InputBar 中，附件按钮和文本输入区之间。紧凑下拉框，显示当前选中模型名称。

### 3.2 模型选项

用户可见的模型选项（仅列出 agent loop 可用的对话模型）：

| 显示名 | 模型标识符 | 说明 |
|--------|-----------|------|
| DeepSeek V4 Flash | `deepseek-chat` | 快速对话，当前默认 |
| DeepSeek V4 Pro | `deepseek-reasoner` | 深度推理，tool-calling 更可靠 |
| 豆包 视觉 | `doubao-seed-1-6-vision` | 视觉理解 + 工具调用 |

**注：** 千问（Qwen）已从用户可见列表中移除——当前模型列表仅展示 agent loop 实际使用的对话模型。Qwen provider 保留在 `modelRouter.js` 中供内部 role-based 路由使用，但它不直接驱动 agent loop，因此不出现在用户下拉框中。

### 3.3 数据结构

```ts
type ModelOption = {
  id: string       // 模型标识符，如 "deepseek-chat"
  label: string    // 显示名称，如 "DeepSeek V4 Flash"
  provider: string // "deepseek" | "doubao"
}
```

provider 字段用于后端路由：agentLoop 根据 provider 选择对应的 API client（deepseek.js 或 doubao.js）。

### 3.4 数据流

```
InputBar 用户选择 model
  → useChat.sendUserMessage(text, model)
    → chat:send { convId, messages, model }
      → chat.js IPC 接收 model 参数
        → runTurn(..., { model })  // model 形如 "deepseek-chat"
          → 从 model 标识符推导 provider（deepseek/doubao）
            → deepseek.chat({ model }) 或 doubao.chat({ model })
```

**与 modelRouter 的关系：** 用户手动选择的 model 直接传入 agentLoop，**绕过** role-based 路由。`modelRouter.js` 保留用于：
- 内部非对话场景（TASK_PLANNING, CODING_REASONING）
- 未来多 provider 智能路由

Qwen provider（`qwenProvider.js`）保留不动，供 ROLE_REQUIREMENTS 中仍引用 QWEN 的角色使用。

### 3.5 新增 provider：doubao.js

豆包使用 OpenAI 兼容的 chat completions API。

```
Base URL: https://ark.cn-beijing.volces.com/api/v3
认证方式: Bearer Token（API Key）
API 路径: /chat/completions
请求格式: OpenAI 兼容（messages + tools + stream）
响应格式: OpenAI 兼容 SSE stream
```

`doubao.js` 导出 `chat({ messages, tools, model, signal })` 方法，签名与 `deepseek.js` 的 `chat()` 一致。

API Key 读取自 electron store: `config.doubaoVisionApiKey`，Endpoint 读取自 `config.doubaoVisionEndpoint`。

### 3.6 涉及文件

| 文件 | 变更 |
|------|------|
| `client/src/components/chat/ModelSelector.jsx` | **新建** — 下拉组件 |
| `client/src/components/chat/InputBar.jsx` | 修改 — 插入 ModelSelector |
| `client/src/hooks/useChat.js` | 修改 — sendUserMessage 接受 model 参数 |
| `electron/ipc/chat.js` | 修改 — 接收 model 传给 runTurn |
| `electron/services/agentLoop.js` | 修改 — 根据 model 选择 provider，替换硬编码 deepseek.chat() |
| `electron/services/doubao.js` | **新建** — 豆包 provider |
| `electron/services/models/modelTypes.js` | 修改 — MODEL_PROVIDERS 增加 DOUBAO |

### 3.7 模型选择持久化

用户选择的模型存储在 `localStorage` 中，key 为 `agentdev-selected-model`，默认值 `deepseek-chat`。`ModelSelector` 初始化时读取、切换时写入，确保刷新/重启后保持用户偏好。

---

## 4. 优化 2：API Key 官网跳转链接

### 4.1 UI 设计

SettingsPanel 模型 Tab 中，每个 API Key 输入框的标签旁增加 🔗 图标：

- **DeepSeek API Key** 旁 → 链接到 `https://platform.deepseek.com`
- **豆包 API Key** 旁 → 链接到 `https://console.volcengine.com/ark`

### 4.2 行为

点击链接图标 → `shell.openExternal(url)` 在默认浏览器打开。

### 4.3 涉及文件

| 文件 | 变更 |
|------|------|
| `client/src/panels/SettingsPanel.jsx` | 修改 — 两处 API Key 输入框旁加链接 |

---

## 5. 优化 3：增强"偏好"Tab — 手动添加/编辑

### 5.1 现状

代码库已有完整的用户偏好系统：

| 组件 | 文件 | 功能 |
|------|------|------|
| RulesTab | `client/src/panels/RulesTab.jsx` | 展示偏好列表 + 删除 + 打开文件 |
| userRules | `electron/services/userRules.js` | 文件存储、CRUD、`buildSystemPromptSection()` |
| remember 工具 | `electron/tools/` | AI 在对话中自动记录偏好 |
| chat.js 注入 | `electron/ipc/chat.js` | 已调用 `buildSystemPromptSection()` 注入 prompt |

当前局限：RulesTab **只读**（展示 + 删除），不支持手动添加和编辑。规则只能由 AI 通过 `remember_user_rule` 工具创建。

### 5.2 改造内容

在 RulesTab 中增加手动添加 + 编辑功能：

- **新增输入框**（顶部）：文本输入 + "添加"按钮
- **编辑按钮**（每条右侧）：点击后文本变为可编辑 input，确认/取消
- **删除按钮**（保留现有）：确认删除
- "打开文件"按钮保留

### 5.3 数据结构（不变）

现有数据结构保持不变：

```
存储格式: user_rules.md 文件，每行一条规则
行格式:   - [r_<ISO timestamp>] <文本内容>
对象格式: { id: "r_2026-05-11T...", text: "规则内容" }
```

### 5.4 IPC 扩展

| IPC 通道 | 方向 | 用途 |
|----------|------|------|
| `rules:list` | renderer → main | 已有，列出所有规则 |
| `rules:delete` | renderer → main | 已有，删除规则 |
| `rules:append` | renderer → main | **新增**，手动添加规则 |
| `rules:update` | renderer → main | **新增**，按 id 更新规则文本 |

### 5.5 注入机制（不变）

`userRules.buildSystemPromptSection()` 已返回：

```
## 用户长期偏好
请严格遵循用户明确表达的跨会话偏好：
- {规则文本1}
- {规则文本2}
```

`chat.js` 已将其注入 `BASE_PROMPT`。**无需修改 chat.js 的注入逻辑。**

### 5.6 涉及文件

| 文件 | 变更 |
|------|------|
| `client/src/panels/RulesTab.jsx` | 修改 — 新增添加输入框 + 编辑按钮 |
| `electron/ipc/rules.js` (或类似) | 修改 — 新增 `rules:append` / `rules:update` handler |
| `electron/services/userRules.js` | 修改 — 新增 `updateRule(id, text)` 方法 |

---

## 6. System Prompt 强化

### 6.1 新增工具调用规则段

在 `BASE_PROMPT` 中追加：

```
## 工具调用规则（必须遵守）

当用户请求涉及以下操作时，你**必须调用对应的工具函数**，
**绝对不要用文字描述来代替工具调用**：

| 用户意图 | 必须调用的工具 |
|---------|-------------|
| 打开网页/浏览网站/点击页面 | `browser_task` |
| 截屏/观察屏幕 | `desktop_observe` |
| 点击桌面/鼠标操作 | `desktop_click` |
| 输入文字/键盘操作 | `desktop_type` |
| 执行命令/运行脚本 | `run_shell_command` |
| 读写文件 | `file_read` / `file_write` |
| 生成文档/PPT | `generate_document` |

如果用户说"帮我打开X"或"点击X"，你不能回复"好的我来做"然后什么都不做。
你必须调用对应工具。工具执行结果会返回给你，你再据此回复用户。
```

### 6.2 优先级规则

prompt 组装顺序（chat.js `BASE_PROMPT` 构建）：
1. `BASE_PROMPT`（角色定义）
2. **工具调用规则**（§6.1 — 最高规则，不可覆盖）
3. `buildSystemPromptSection()`（用户长期偏好 — 来自 userRules.js）
4. 会话历史

若用户偏好与工具调用规则冲突 → 工具调用规则优先级更高。

### 6.3 涉及文件

| 文件 | 变更 |
|------|------|
| `electron/ipc/chat.js` | 修改 — BASE_PROMPT 增加工具调用规则段 |

---

## 7. 测试清单

- [ ] 模型下拉框三个选项正确显示，选中态高亮
- [ ] 切换模型后发送消息，后端收到正确的 model 参数
- [ ] 选择豆包模型时请求路由到豆包 API endpoint
- [ ] 选择 DeepSeek V4 Pro 时 agent loop 正确调用 deepseek-reasoner
- [ ] API Key 链接点击在浏览器打开正确 URL
- [ ] "偏好"Tab 新增条目成功，刷新后保持
- [ ] "偏好"Tab 编辑条目成功，文本更新
- [ ] "偏好"Tab 删除条目成功
- [ ] 手动添加的偏好规则正确注入 system prompt
- [ ] 工具调用规则先于用户偏好注入 prompt
- [ ] Vite build 零错误
- [ ] vitest 全量通过
