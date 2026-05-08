# TAPD 缺陷单草稿：D 盘根目录生成 PPT 失败

## 基本信息

- 标题：生成 PPT 到 D 盘根目录时失败或被强制改存
- 缺陷类型：功能缺陷
- 严重程度：高
- 优先级：高
- 发现日期：2026-05-08
- 影响模块：文档生成 / PPT 生成 / 本地文件输出
- 运行环境：Windows，Electron 开发模式，`npm run electron:dev`
- 当前状态：已修复，待产品验收

## 问题描述

用户要求“在 D 盘生成一份 PPT”时，如果目标路径是 `D:\` 或 `D:\xxx.pptx`，应用无法按用户预期生成到 D 盘根目录。此前逻辑会主动把根目录输出重定向到 `D:\AgentDevLiteGenerated\`；在部分环境下，如果 D 盘根目录或该子目录受权限限制，生成流程会失败，用户无法拿到 PPT。

## 复现步骤

1. 启动项目：

   ```powershell
   npm run electron:dev
   ```

2. 在应用中切换到可执行本地工具的完整权限模式。
3. 输入类似请求：

   ```text
   在 D 盘根目录生成一份 PPT
   ```

   或指定输出路径：

   ```text
   生成 PPT 到 D:\demo.pptx
   ```

4. 查看生成结果和产物列表。

## 实际结果

- 旧逻辑会把 `D:\` 或 `D:\demo.pptx` 主动改写到 `D:\AgentDevLiteGenerated\`。
- 如果该安全目录也不可写，PPT 生成会失败。
- 此前 PPT 生成器还存在 `UNKNOWN-LAYOUT` 问题，导致 PPT 在路径复制前就可能失败。

## 期望结果

- 应用应尊重用户指定的 `D:\` 或 `D:\demo.pptx`，先尝试直接生成到 D 盘根目录。
- 如果 Windows 系统权限拒绝根目录写入，应用应自动回退到可写目录，并明确返回实际保存路径和提示信息。
- 只有当返回路径真实存在且 `bytes_written > 0` 时，才向用户报告生成成功。

## 影响范围

- PPT 生成：`generate_pptx`
- Word 生成：`generate_docx` 使用同一输出路径解析逻辑，也受同类路径策略影响。
- 产物列表：生成失败或路径错误会影响用户打开/取用生成文件。

## 根因分析

- 输出路径解析逻辑此前对盘符根目录做了强制重定向，未先尝试用户指定的真实根目录路径。
- 当目标目录不可写时，缺少多级可写目录兜底。
- `pptxgenjs` 布局名使用了不支持的 `LAYOUT_16X9`，会触发 `UNKNOWN-LAYOUT`。

## 修复方案

已修改：

- `electron/tools/docs.js`
  - `D:\` 解析为 `D:\<生成文件名>`，先尝试直写根目录。
  - `D:\demo.pptx` 保持原路径，先尝试直写。
  - 如果系统拒绝写入，则依次回退到：
    - `D:\AgentDevLiteGenerated\demo.pptx`
    - 同盘工作区下的 `AgentDevLiteGenerated`
    - 应用内部生成目录
  - 回退时返回 `warning`，并上报真实保存路径。

- `electron/services/pptxGen.js`
  - 将 PPT 布局名从 `LAYOUT_16X9` 修正为 `LAYOUT_WIDE`。

- `electron/ipc/chat.js`
  - 更新系统提示，要求模型把 D 盘根目录请求传给工具，由工具先尝试直写；如发生 fallback，必须报告实际路径。

- `electron/__tests__/docs-tools.test.js`
  - 增加路径兜底和 D 盘根目录直写策略的回归测试。

## 验证结果

已执行：

```powershell
npm test -- electron/__tests__/tools.test.js electron/__tests__/docs-tools.test.js electron/__tests__/ipc.test.js
```

结果：

- 3 个测试文件通过。
- 23 个测试通过。

实际生成验证：

- 请求路径：`D:\agentdev-root-output-unlocked-demo.pptx`
- 当前机器系统权限拒绝直写 D 盘根目录。
- 应用成功回退保存到：

  ```text
  D:\AgentDevLiteGenerated\agentdev-root-output-unlocked-demo.pptx
  ```

- 文件大小：`54041` bytes。

## 验收建议

1. 在允许写入 D 盘根目录的 Windows 环境中验证 `D:\demo.pptx` 能直接生成。
2. 在禁止写入 D 盘根目录的环境中验证应用能 fallback，并向用户展示真实保存路径。
3. 在产物列表中点击生成的 PPT，确认文件可打开。
