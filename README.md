# AgentDev Lite

AgentDev Lite 是一个 Electron 桌面 Agent。当前架构已经移除 Express 常驻后端，聊天循环、工具执行、skill 加载和本地能力都运行在 Electron 主进程中，前端通过 `window.electronAPI.invoke/on` 与主进程通信。

## 功能

- DeepSeek 聊天，支持流式输出。
- 全权限模式下启用本地工具：读写文件、目录浏览、文件搜索、shell 命令、环境探测、Word/PPT 生成、用户偏好记忆。
- 工具调用会在聊天区显示为工具卡片，shell 输出会流式显示。
- Skill 系统支持内置 skill 和用户自定义 skill。用户 skill 位于应用数据目录，且同名覆盖内置 skill。
- 用户持久偏好写入 `user_rules.md`，新会话会自动加入 system prompt。

## 启动

首次安装依赖：

```powershell
npm run setup
```

开发模式启动 Electron：

```powershell
npm run electron:dev
```

构建 Windows 安装包：

```powershell
npm run electron:build
```

运行测试：

```powershell
npm test
```

## 使用

1. 打开设置面板，填写 DeepSeek API Key。
2. 需要本地文件、shell、skill 能力时，将权限模式切到 `Full Permission` 并保存。
3. 在聊天框自然描述任务，例如：
   - `总结 "D:\docs\paper.pdf"`
   - `帮我装 uv`
   - `写一份关于点云目标检测的 Word 报告`
4. 模型会按需调用工具或加载 skill。破坏性文件操作和灰名单 shell 命令会弹出确认。

## 内置 Skills

- `word-writer`：生成 Word 文档、报告、论文草稿。
- `ppt-builder`：生成 PPT 演示文稿。
- `study-helper`：学习解释、练习题、学习计划。
- `file-explorer`：理解目录结构、查找文件、摘要本地文件。
- `dep-installer`：检查和安装本地开发依赖，标准流程是 `get_os_info -> which -> run_shell_command`。

## 数据位置

应用数据位于 Electron `userData` 目录下，主要文件包括：

- `data/config.json`：模型配置、权限模式、工作区、shell 白/黑名单。
- `data/data.json`：会话和生成文件索引。
- `data/auth.json`：本地账号、登录历史、记住密码和自动登录状态。
- `user_rules.md`：用户持久偏好。
- `skills/`：用户自定义 skill。

## 手动回归 Checklist

- [ ] exe 安装后首次启动能看到 5 个内置 skill。
- [ ] 给本地 pdf 路径说“总结这个文件”后，模型调 `read_file` 并总结正确。
- [ ] 说“帮我装 uv”后，模型按 `get_os_info -> which uv -> run_shell_command(...)` 执行，shell 卡片实时显示输出。
- [ ] 说“删掉 D:\temp”后，模型调 `delete_path` 并弹出原生确认 dialog。
- [ ] 说“写一份关于 XX 的 Word 报告”后，模型调 `load_skill("word-writer")` 并按工作流生成文档。
- [ ] 切到 `normal` 模式后，同样问题只文字回答，不调工具。
- [ ] 自己写 `SKILL.md` 放到用户 `skills/` 目录后，重启或 reload 后列表可见。
- [ ] 对模型说“之后我做写报告时请调用 word-writer”后，`user_rules.md` 新增规则，新会话能读取该规则。

## 当前限制

- 第一版不做多 Agent、PTY/xterm 终端、Skill 市场、远程 skill 仓库、RAG 或文件监听。
- `workspace_root` 是默认工作目录，不是硬访问边界。
- 旧 `/word`、`/ppt`、`/local` slash 命令已移除，请用自然语言触发工具和 skill。
