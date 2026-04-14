# 2026-04-14 本地文件 / Shell / Skill Agent 重构设计

**状态**：已通过头脑风暴确认，待实现
**目标**：把 agentdev-lite 从"被动注入文件文本的聊天机器人"升级为"AionUi 风格的主动 tool-calling 桌面 Agent"，带 skill 系统、本地终端辅助、用户规则持久化。
**执行方**：用户指挥 codex 按阶段实现。本 spec 不含实现代码；实现计划由 `writing-plans` skill 另行产出。

---

## 1. 背景与目标

### 1.1 现状痛点

当前 `agentdev-lite` 已具备：Electron + Express + React 的桌面应用骨架、DeepSeek 聊天、"全权限模式"开关、文件浏览器面板、`/word` `/ppt` 固定 slash 命令。

但架构上存在以下问题，限制了"像 AionUi 一样的真正 Agent 能力"：

1. **文件访问是"被动注入"而非"主动工具"**。`server/routes/chat.js` 中 `LOCAL_PATH_WITH_EXT_RE` 用正则从用户消息里抓路径，读取文本塞进 system context。模型不知道自己"可以读文件"，只能基于被喂进来的文本回答；无法主动读多个文件、无法写文件、无法执行命令。
2. **没有 shell 能力**。用户想让 agent 帮忙"装个 uv""克隆个仓库",只能自己开终端手动跑。
3. **`/word` `/ppt` 是硬编码 slash 命令**，形成"用户必须记命令"的体验；没有扩展性，用户不能添加自定义工作流。
4. **system prompt 里硬编码"引导用户用 📎 按钮"等文案**（`FULL_PERMISSION_PROMPT`），与"主动 Agent"定位冲突。
5. **Express 层与 Electron 主进程职责混乱**：fs、shell 天然是桌面能力，却分散在 Node HTTP 层；打包后仍需 server 常驻。

### 1.2 目标

借鉴 [AionUi](https://github.com/iOfficeAI/AionUi) 的架构，在 exe-only 形态下重构 `agentdev-lite`，使其：

- **模型成为主动的 tool caller**：通过 DeepSeek 原生 function calling，模型自主决定何时读文件、写文件、执行 shell 命令。
- **获得本地 shell 能力**：用户说"帮我装 uv"，模型能调 `get_os_info` / `which` / `run_shell_command` 完成安装。
- **引入 Skill 模块**（Claude Code 风格）：可扩展的 markdown 工作流文件，描述驱动 + 懒加载；用户能自定义 skill，内置 skill 跟随 exe 发布。
- **用户规则持久化**：用户说出"之后做 X 时请 Y"这类持久偏好时，模型自动登记到 `user_rules.md`，跨会话生效。
- **架构清理**：Express 整体废弃，chat 循环和工具执行全部在 Electron 主进程；前端通过 IPC 与主进程通信；浏览器模式仅作为本地开发调试用途，不作为部署形态。

### 1.3 非目标（第一版明确不做）

- AionUi 格式 skill 的字节级兼容 / 自动导入（只用 Claude Code 风格 frontmatter；未来可做转换器）
- 多 agent / 多 assistant（本应用保持单 agent 模型）
- PTY 真终端 / xterm 嵌入（命令卡片足矣）
- Skill 市场、版本管理、远程仓库
- 文件监听、增量索引、RAG
- 工作区"硬边界"（用户选择了文件操作全开，`workspace_root` 仅作为默认 cwd 与输出路径，非访问限制）

---

## 2. 总体架构

```
┌────────────────────────────────────────────────────────────────┐
│  Electron 主进程 (electron/main.js)                            │
│                                                                │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐   │
│  │ Chat Loop    │   │ Tool Executor│   │ Skill Registry   │   │
│  │ (DeepSeek    │◄──┤ - fs tools   │   │ - 扫描 builtin/  │   │
│  │  function    │   │ - shell tools│   │   user skills    │   │
│  │  calling)    │   │ - doc gen    │   │ - 元信息索引     │   │
│  └──────┬───────┘   │ - remember   │   └─────────┬────────┘   │
│         │           └──────────────┘             │            │
│         │                                        │            │
│         ▼        IPC (ipcMain.handle / send)     ▼            │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  IPC API:                                             │    │
│  │  chat:send / config:get|set / conversations:*         │    │
│  │  artifacts:* / files:list|search / skills:list|reload │    │
│  │  tool-confirm:response / rules:list|delete            │    │
│  └───────────────────────────────────────────────────────┘    │
│                             ▲                                 │
│                             │ preload.js (contextBridge)      │
└─────────────────────────────┼──────────────────────────────────┘
                              │
┌─────────────────────────────┼──────────────────────────────────┐
│  Renderer (Vite React SPA)  ▼                                  │
│  window.electronAPI.invoke(channel, payload) / on(event, cb)   │
│  - 聊天面板（渲染工具调用卡片 + skill 加载徽标）               │
│  - 破坏性操作确认（原生 dialog，前端仅 dev 模式 fallback）     │
│  - 设置面板：API/工作区/shell 白黑名单/skill 管理/用户偏好     │
└────────────────────────────────────────────────────────────────┘
```

### 2.1 关键决策

| 决策项 | 选择 | 备注 |
|---|---|---|
| Shell 策略 | **混合（白名单自动 / 黑名单拒绝 / 其他弹确认）** | 核心诉求"帮下载配置"对应 npm/pip/winget 等白名单内命令，自动执行 |
| 文件操作范围 | **读写删全开，仅靠全权限模式把关；破坏性操作走原生 dialog 防手滑** | 用户明确选择 D，不加工作区硬边界 |
| 工具调用协议 | **DeepSeek 原生 function calling** | OpenAI 兼容协议，成熟稳定 |
| 工具执行端 | **Electron 主进程** | exe-only 形态下最自然 |
| Express 去留 | **完全废弃，chat 循环搬进主进程** | 一个进程更简单，打包更小 |
| Skill 加载 | **描述驱动 + `load_skill` 懒加载** | Claude Code 风格，可扩展到大量 skill 而不爆上下文 |
| Skill 位置 | **内置（随 exe）+ 用户目录（`%APPDATA%`），同名覆盖** | 既有默认体验又可扩展 |
| Word/PPT 处理 | **`docxGen` / `pptxGen` 保留为服务，暴露成 `generate_docx` / `generate_pptx` 工具，内置 skill 引用** | 兼顾效率与扩展性 |
| 用户规则 | **全局 `user_rules.md` + `remember_user_rule` / `forget_user_rule` 工具** | 跨 skill 通用偏好持久化 |

---

## 3. 工具清单与调用协议

### 3.1 工具总览（13 个）

| 类别 | 名称 | 参数 | 返回 | 确认策略 |
|---|---|---|---|---|
| 文件 | `read_file` | `{path, encoding?: "utf8"\|"base64", max_bytes?: 2_000_000}` | `{content, truncated, mime, size}` | 无 |
| 文件 | `write_file` | `{path, content, encoding?: "utf8"\|"base64", overwrite?: false}` | `{path, bytes_written}` | 已存在且 `overwrite=false` → 报 `ALREADY_EXISTS`；`overwrite=true` 且已存在 → **弹 dialog** |
| 文件 | `edit_file` | `{path, old_string, new_string, replace_all?: false}` | `{path, replacements}` | 无；`old_string` 必须精确且唯一，除非 `replace_all` |
| 文件 | `list_dir` | `{path, show_hidden?: false}` | `{entries:[{name,isDir,size,ext}]}` | 无 |
| 文件 | `search_files` | `{root, query, max_depth?: 3}` | `{results:[{name,path,isDir}]}` | 无；复用现有 `/files/search` 实现 |
| 文件 | `create_dir` | `{path, recursive?: true}` | `{path}` | 无 |
| 文件 | `delete_path` | `{path, recursive?: false}` | `{path}` | **强制弹 dialog** |
| 文件 | `move_path` | `{src, dest, overwrite?: false}` | `{src, dest}` | **强制弹 dialog** |
| Shell | `run_shell_command` | `{command, cwd?, timeout_ms?: 120_000}` | `{stdout, stderr, exit_code, truncated}` | 见 §3.2 |
| 环境 | `get_os_info` | `{}` | `{platform, arch, shell, package_managers:{winget,choco,scoop,brew}, user_home, cwd}` | 无 |
| 环境 | `which` | `{command}` | `{found, path?}` | 无 |
| Skill | `load_skill` | `{name}` | `{name, content, referenced_tools, already_loaded?}` | 无 |
| 规则 | `remember_user_rule` | `{rule: string}` | `{ok, rule_id}` | 无 |
| 规则 | `forget_user_rule` | `{rule_id?: string, substring?: string}` | `{ok, removed_count}` | 无 |

> 注：规则类工具 2 个使工具总数到 13。`generate_docx` / `generate_pptx` 不计入核心工具清单，作为内置 skill 引用的辅助工具在 §5 描述。

### 3.2 Shell 三段策略

**分词规则**：取命令字符串首个空白分隔的 token（`command.trim().split(/\s+/)[0]`），去掉引号包裹，`toLowerCase()` 后比对。故意简化，避免 shell-quote 类库在 Windows cmd / PowerShell / bash 下的分词差异。

```
run_shell_command(command)
  ├─ 提取首 token（按上述规则）
  ├─ 首 token ∈ 黑名单  → 直接返回 PERMISSION_DENIED（永不执行）
  │   黑名单: rm, rmdir, rd, del, erase, format, diskpart,
  │          shutdown, reboot, taskkill, reg, regedit,
  │          net user, mkfs, dd, fdisk
  │
  ├─ 首 token ∈ 白名单  → 直接执行
  │   白名单: npm, pnpm, yarn, npx, pip, pip3, python, python3,
  │          node, git, curl, wget, winget, choco, scoop,
  │          where, echo, dir, type, ls, cat
  │
  └─ 其他 → 弹 dialog 询问用户
       "本会话内不再询问此命令"复选框 → 记入 session 缓存（仅内存，重启失效）
```

**白黑名单可在设置中扩展**：`config.shell_whitelist_extra` / `shell_blacklist_extra`。黑名单优先级始终高于白名单。

**流式输出**：主进程用 `child_process.spawn`，stdout/stderr 通过 IPC `chat:tool-log` 事件向 renderer 推增量；命令卡片实时显示。超过 `timeout_ms` 强制 kill 并回报 `COMMAND_TIMEOUT`。输出总量上限 1 MB，超出截断并在返回里 `truncated=true`。

**cwd 默认**：`config.workspace_root`（用户设置，默认 `os.homedir()`）。模型传入的 `cwd` 优先。

### 3.3 DeepSeek function-calling 循环（主进程）

```
messages = [system_prompt, ...history, user_message]
for iter in 1..10:
  resp = deepseek.chat(messages, tools = enabled_tool_schemas())
  emit('chat:delta', resp.text_chunks)         # 流式文本增量
  if resp.tool_calls 为空: break
  messages.append(resp.assistant_message)
  for call in resp.tool_calls:
    emit('chat:tool-start', {id, name, args})
    try:
      result = await TOOLS[call.name](call.args)
      emit('chat:tool-result', {id, result})
    except e:
      result = {error: {code, message}}
      emit('chat:tool-error', {id, error})
    messages.append({role:'tool', tool_call_id:id, content: JSON.stringify(result)})
if iter == 10:
  messages.append({role:'system', content:'已达工具调用上限（10 轮），请基于现有结果总结。'})
  final = deepseek.chat(messages, tools=[])
  emit('chat:delta', final.text_chunks)
emit('chat:done')
```

`enabled_tool_schemas()` 根据 `config.permissionMode` 决定：
- `normal`：返回空数组
- `full`：返回 13 个工具的全量 schema

### 3.4 工具 schema 交付位置

- `electron/tools/schemas.js` —— 每个工具导出 `{name, description, parameters(JSON Schema)}`
- `electron/tools/index.js` —— 汇总 `TOOL_SCHEMAS` 数组与 `TOOLS` 执行表
- chat 路由在构造请求时 `.slice()` 插入

---

## 4. Skill 模块

### 4.1 目录结构

```
<app-resources>/skills/                   ← 内置（随 exe 发布，只读）
  word-writer/
    SKILL.md
    templates/report.docx
  ppt-builder/SKILL.md
  study-helper/SKILL.md
  file-explorer/SKILL.md
  dep-installer/SKILL.md

%APPDATA%/agentdev-lite/skills/           ← 用户目录（可写，UI 可管理）
  my-custom-skill/
    SKILL.md
    scripts/...
```

**合并规则**：启动时扫描两处；按 `name` 去重；**用户 skill 同名覆盖内置**。内置 skill UI 显示"只读"徽标 + "复制为我的 skill"按钮。

### 4.2 SKILL.md 格式

```markdown
---
name: word-writer
description: 当用户要生成 Word 文档、报告、论文时使用。支持引用本地参考文件，按章节大纲输出 docx。
when-to-use: 用户消息包含"写 word"/"生成报告"/"docx"等字样；或明确请求 .docx 输出。
tools: [read_file, write_file, generate_docx, list_dir]
resources:
  - templates/report.docx
---

# Word 文档写作技能

## 工作流
1. 确认文档主题、章节大纲、目标读者
2. 若用户提供参考文件路径，用 `read_file` 读取
3. 构造 outline = [{heading, content}, ...]
4. 调用 `generate_docx(outline, out_path)`
5. 返回文件路径给用户

## 约束
- 默认输出到 `{workspace_root}/输出/<主题>.docx`
- 未指定章节时，先给 3-5 条大纲方案让用户选
```

**frontmatter 字段**：

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | ✓ | 唯一 ID，kebab-case，与文件夹同名 |
| `description` | ✓ | ≤150 字，进入 system prompt 的 skill 索引 |
| `when-to-use` | ✗ | 可选触发提示 |
| `tools` | ✗ | 建议使用的工具名数组，UI 展示用（不做硬性限制） |
| `resources` | ✗ | 文件夹内相对路径资源清单；加载时展开为绝对路径 |

### 4.3 加载流程

**启动 / `skills:reload` 时**：
1. 扫描两个目录，解析 frontmatter
2. 构建索引 `[{name, description, path, readonly}]`
3. 生成 system prompt 片段（只含 `name` + `description`）

**模型调用 `load_skill(name)` 时**：
1. 索引查 `path`，读 `SKILL.md` 正文（去除 frontmatter）
2. `resources` 相对路径展开为绝对路径，追加到正文底部
3. 作为 `tool` 消息返回
4. 同时 IPC 推 `chat:skill-loaded` 事件 → 聊天界面显示"📘 word-writer"徽标
5. 本会话内缓存已加载的 skill name；重复加载返回 `{already_loaded: true, content: ""}`（空字符串,避免再占 token；模型应已掌握先前加载的正文）

### 4.4 内置 Skill（5 个，随 exe 发布）

1. **word-writer** —— 吃掉原 `/word` 路由
2. **ppt-builder** —— 吃掉原 `/ppt` 路由
3. **study-helper** —— 吃掉原 `FULL_PERMISSION_PROMPT` 里的学习助手定位
4. **file-explorer** —— 指导"如何高效理解一个文件夹"（list_dir + search_files + read_file 组合）
5. **dep-installer** —— 用户核心诉求。标准流程：`get_os_info` → `which <target>` → 若缺失则根据 OS 选择 winget/choco/scoop/npm/pip → `run_shell_command` 装

### 4.5 Skill 管理 UI（设置面板新增 Tab）

- 列表：name / description / 只读或可编辑徽标
- 操作：新建（弹表单生成骨架）、导入（选择文件夹复制到用户目录）、打开文件夹、编辑（系统默认编辑器）、删除
- 内置 skill：额外"复制为我的 skill"按钮

---

## 5. 文档生成辅助工具

`docxGen` / `pptxGen` 服务保留（从 `server/services/` 迁至 `electron/services/`），并额外暴露为工具：

| 名称 | 参数 | 行为 |
|---|---|---|
| `generate_docx` | `{outline:[{heading,level,content}], out_path, template?}` | 调用 `docxGen` 生成 docx 到 `out_path`；记录到 artifacts store |
| `generate_pptx` | `{slides:[{title,bullets[],notes?}], out_path, template?}` | 调用 `pptxGen` 生成 pptx；同上 |

这两个工具**不**出现在 §3.1 的核心 13 个里，作为 skill 级辅助工具独立列出；`word-writer` / `ppt-builder` 内置 skill 通过 `tools` frontmatter 引用。用户自定义 skill 也可引用。

**总工具数** = 13 核心 + 2 文档生成 = **15**。

---

## 6. 用户规则系统

### 6.1 存储

`%APPDATA%/agentdev-lite/user_rules.md`，格式：

```markdown
<!-- 以下规则由 remember_user_rule 自动追加；可手动编辑 -->
- [r_2026-04-14T12:03:11] 用户做写报告相关任务时,优先 load_skill('word-writer')
- [r_2026-04-14T12:05:42] 装依赖请用 npm,不用 pnpm
```

每行以 `- [r_<ISO timestamp>] <rule text>` 开头，方括号中的是 `rule_id`。

### 6.2 system prompt 拼接

每次构造对话时，如果 `user_rules.md` 非空，在 system prompt 顶部插入：

```
## 用户持久偏好
（以下是用户明确表达过的跨会话偏好，请遵循）
- 用户做写报告相关任务时,优先 load_skill('word-writer')
- 装依赖请用 npm,不用 pnpm
```

### 6.3 指引 prompt

system prompt 追加（`full` 模式下）：

```
当用户表达"之后/以后/今后/下次…都/总是/请…"这类跨会话的持久偏好时,
调用 remember_user_rule 登记。避免登记一次性任务细节。
误登记时可用 forget_user_rule 按 rule_id 或子串删除。
```

### 6.4 模式行为

- `normal` 模式：工具不可见，但 `user_rules.md` 内容**仍**拼进 system prompt（规则对纯聊天也有效，如"用中文回答"）。模型在此模式下**无法**新增/删除规则（`remember_user_rule` 不在 schema 里）；**§6.3 的指引 prompt 也不拼入**（避免模型提到它看不见的工具让用户困惑）；用户只能在设置面板里编辑。
- `full` 模式：规则拼入 + 两个工具可见。

### 6.5 UI

设置面板新增"用户偏好"tab：
- 列表：每条规则一行 + 🗑 删除按钮（调用 `rules:delete` IPC → 等价于 `forget_user_rule`）
- 顶部按钮："打开文件手动编辑"

---

## 7. 数据流与持久化

### 7.1 消息流

```
[Renderer] 用户输入 → invoke('chat:send', {convId, text})
                                │
[Main]  ipcMain.handle('chat:send')
        1. store.appendMessage(convId, {role:'user', content})
        2. 构造 messages:
           [BASE_PROMPT + SKILL_INDEX + USER_RULES, ...history, user_msg]
        3. 进入 chat loop (§3.3)
                                │
  每次 loop 迭代向 renderer 推事件:
    'chat:delta'       { convId, text }
    'chat:tool-start'  { convId, callId, name, args }
    'chat:tool-log'    { convId, callId, stream, chunk }
    'chat:tool-result' { convId, callId, result }
    'chat:tool-error'  { convId, callId, error }
    'chat:skill-loaded'{ convId, name }
    'chat:done'        { convId }
                                │
  破坏性操作: Main → dialog.showMessageBox 模态阻塞
              用户点取消 → 工具返回 USER_CANCELLED
                                │
[Main]  所有消息落盘到 conversations store
[Renderer] 按 convId 订阅事件,实时渲染
```

### 7.2 持久化文件

全部位于 `%APPDATA%/agentdev-lite/`：

| 文件 | 内容 |
|---|---|
| `config.json` | `{apiKey, baseUrl, model, permissionMode, workspace_root, shell_whitelist_extra, shell_blacklist_extra, session_confirm_cache_enabled}` |
| `conversations.json` | 会话数组，每项含完整 messages（结构见 §7.3） |
| `artifacts.json` | 生成 docx/pptx 的路径索引（复用现有结构） |
| `user_rules.md` | §6.1 |
| `skills/` | §4.1 用户 skill 目录 |

### 7.3 消息结构

```js
{
  id: "msg_xxx",
  role: "user" | "assistant" | "tool" | "system",
  content: string,
  tool_calls: [{id, name, args}]?,   // role=assistant 时可能有
  tool_call_id: string?,             // role=tool 时必有
  tool_name: string?,                // role=tool 时冗余字段,便于 UI 回放
  tool_status: "ok"|"error"|"cancelled"?,
  skill_loaded: string?,             // 若该 tool msg 是 load_skill 结果,标记加载的 skill name
  timestamp: number
}
```

### 7.4 Renderer 状态切片

```
useChatStore (zustand 或等价)
  conversations: { [id]: Conversation }
  activeConvId: string
  pendingToolCalls: { [callId]: {name, args, streamBuffer} }
  loadedSkills: Set<string>
  pendingConfirm: null | {callId, kind, payload}
```

`pendingConfirm.kind ∈ {shell-command, delete, move, overwrite}`；生产环境走原生 dialog，前端 fallback 仅在 `npm run dev` 非 Electron 调试时启用。

### 7.5 错误语义

工具返回 `{error:{code,message}}`，`code` 枚举：

| code | 场景 | 模型预期反应 |
|---|---|---|
| `PATH_NOT_FOUND` | 文件/目录不存在 | 确认路径或用 `search_files` |
| `PERMISSION_DENIED` | 权限模式未开 / 黑名单命令 | 告知用户开启设置 |
| `USER_CANCELLED` | dialog 点取消 | 停止,询问如何调整 |
| `COMMAND_TIMEOUT` | shell 超时 | 报告,询问是否加长 timeout |
| `COMMAND_NOT_FOUND` | `which` 未命中 | 用 `get_os_info` 决定包管理器 → 安装 |
| `ALREADY_EXISTS` | `write_file` 已存在且 `overwrite=false` | 询问用户覆盖/换路径 |
| `INVALID_ARGS` | 参数校验失败 | 修正参数重试 |
| `INTERNAL` | 其他 | 如实报告,禁止编造成功 |

---

## 8. 权限模式收口

`config.permissionMode`（字段保留，含义收紧）：

- `normal`：`TOOL_SCHEMAS=[]`；skill 索引**不**进 system prompt；`user_rules.md` **进**；模型以纯聊天形式回答。用户消息里即使带路径,模型**不会**主动读（因为没工具可用）。
- `full`：完整 15 个工具 schema + skill 索引 + 用户规则；模型主动调用。破坏性操作仍经原生 dialog 兜底。

**砍掉**：原 `FULL_PERMISSION_PROMPT` 中硬编码的"引导用户用 /word /ppt 📎"段落。替换为：

```
你已进入全权限模式,可调用文件、shell、skill 等工具主动完成用户任务。
当有合适的 skill 时优先 load_skill() 并遵循其工作流。
```

---

## 9. 迁移路径（按阶段顺序实现）

### 阶段 A：Electron 主进程承接后端

1. `server/index.js` → **废弃**
2. `server/services/deepseek.js` `fileReader.js` `docxGen.js` `pptxGen.js` → 迁至 `electron/services/`
3. `server/routes/chat.js` → 重写为 `electron/ipc/chat.js`（新 tool-calling loop）
4. `server/routes/conversations.js` `config.js` `artifacts.js` `files.js` → 迁为 `electron/ipc/*.js`
5. **删除** `server/routes/word.js` / `ppt.js`（被 skill 吃掉）
6. `server/store.js` → `electron/store.js`
7. `electron/preload.js` → 扩展 `contextBridge.exposeInMainWorld('electronAPI', { invoke, on, off })`
8. `client/src/lib/api.js`（或等价 HTTP 客户端层）→ `fetch` 改为 `window.electronAPI.invoke`；SSE 改为按 §7.1 列出的事件名订阅 (`chat:delta` / `chat:tool-start` / `chat:tool-log` / `chat:tool-result` / `chat:tool-error` / `chat:skill-loaded` / `chat:done`)
8a. **清理** `electron/main.js` 现有 `exec-local-command` IPC handler 与 `electron/preload.js` 的 `execLocalCommand` 桥接 —— 功能被 `run_shell_command` 工具取代；前端若有直接调用也一并移除（不做别名兼容,彻底替换）

### 阶段 B：工具执行器与 Skill 系统

9. `electron/tools/schemas.js` + `electron/tools/index.js`
10. `electron/tools/fs.js` / `shell.js` / `env.js` / `docs.js` / `remember.js`
11. `electron/skills/registry.js` / `loader.js`
12. `electron/confirm.js`（统一 dialog 入口 + 会话内缓存）
13. `resources/skills/` 内置 5 个 skill 的 `SKILL.md` + 资源

### 阶段 C：前端适配

14. `ChatView` / 聊天气泡组件 → 新增工具卡片组件（命令卡/文件操作卡/skill 加载徽标）
15. `SettingsPanel` → 新增 `workspace_root`、shell 白/黑名单扩展、**skill 管理** tab、**用户偏好** tab
16. **删除** 原 `/word` `/ppt` slash 命令相关 UI 与路径抓取提示
17. **删除** 输入框 placeholder/提示中"输入文件路径即可引用"等引导文字

### 阶段 D：打包配置

18. `package.json` 的 `build.extraResources` 里 `server` 改为 `resources/skills`
19. `build.files` 扩展为 `electron/**/*`、`resources/**/*`
20. `scripts.electron:dev` 简化，不再起 Express；`scripts.electron:build` 同步

**每阶段产出物独立可验证**：阶段 A 完成后应用可启动且聊天走主进程；阶段 B 完成后模型可调工具（可单独命令行测 IPC）；阶段 C 完成后 UI 完整；阶段 D 完成后 exe 可正常打包。

---

## 10. 测试策略

### 10.1 单元测试（Vitest, Node 环境）

- `electron/tools/*` —— 每个工具的正常路径、参数校验、fs 错误（临时目录）
- `electron/skills/registry.js` —— 扫描、合并、覆盖、frontmatter 解析
- `electron/store.js` —— 读写、默认值
- `electron/tools/remember.js` —— rule_id 生成唯一性、forget 按 id/substring 删除正确

### 10.2 集成测试（Vitest + 临时目录）

- chat loop：mock DeepSeek 返回 tool_calls 序列,断言消息历史构造、事件顺序、10 轮上限触发
- shell 三段策略：mock `child_process.spawn`,断言白/黑/灰名单分流、timeout、output 截断
- skill 加载：description-only 索引、`load_skill` 返回正文、重复加载短路
- `user_rules.md` 空/非空两种情况的 system prompt 拼接

### 10.3 手动回归 Checklist（写入 README）

- [ ] exe 安装后首次启动看到 5 个内置 skill
- [ ] 给本地 pdf 路径说"总结这个文件" → 模型调 `read_file` → 总结正确
- [ ] 说"帮我装 uv" → 模型 `get_os_info` → `which uv` → `run_shell_command("winget install uv")` → 白名单放行 → 卡片实时流式
- [ ] 说"删掉 D:\temp" → 模型 `delete_path` → 原生确认 dialog
- [ ] 说"写一份关于 XX 的 Word 报告" → 模型 `load_skill("word-writer")` → 按工作流产出
- [ ] 切到 `normal` 模式 → 同样问题,模型只文字回答,不调工具
- [ ] 自己写 SKILL.md 放 `%APPDATA%/agentdev-lite/skills/`,重启后在列表可见
- [ ] 对模型说"之后我做写报告时请调用 word-writer" → `user_rules.md` 新增一行 → 新开会话该规则进 system prompt

---

## 11. 交付物

- 本设计稿：`docs/superpowers/specs/2026-04-14-local-file-shell-skill-agent-design.md`
- 实现计划：由 `writing-plans` skill 另行产出 `docs/superpowers/plans/` 下对应文件
- 实现：由用户指挥 codex 按阶段顺序完成

## 12. 范围之外（第一版明确不做）

- AionUi 格式 skill 的自动导入 / 字节级兼容
- 多 agent / 多 assistant
- PTY / xterm 嵌入终端
- Skill 市场、版本管理、远程仓库
- 工作区"硬边界"访问限制
- 文件监听、增量索引、RAG
