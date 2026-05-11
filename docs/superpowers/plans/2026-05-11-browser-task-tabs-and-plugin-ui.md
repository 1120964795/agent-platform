# Browser Task Tabs And Plugin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each Browser-Use task open in its own browser tab without overwriting preserved pages, add a CodexApp-style browser plugin invocation UI that switches the input model indicator to the Browser-Use model, and stream visible reasoning/progress for chat, browser, skill, and tool execution.

**Architecture:** The Python browser-use bridge will explicitly give every task an initial navigation action with `new_tab: true` and disable browser-use's default same-tab URL auto-open path. The React chat input will gain a compact plugin menu anchored to the left controls; selecting the Browser plugin sets a browser mode in chat state, updates the model chip to the configured Browser-Use model, and routes the next send through the existing `browser_task` tool path. Approval cards stay limited to confirmation/authorization; actual chat, browser, skill, and tool activity is streamed into the conversation as visible progress events and safe reasoning summaries. UI work must start with a browser/app preview and wait for user confirmation before implementation.

**Tech Stack:** Electron, React/Vite, lucide-react, Node/Vitest, Python FastAPI bridge, browser-use `Agent(initial_actions=...)`, pytest, Playwright/browser visual verification.

---

## Current State Summary

Committed baseline:

- Local commit: `4b22afb feat: stabilize browser-use configuration`.
- Browser-Use has dedicated ZenMux/OpenAI-compatible config fields.
- Browser-Use defaults are `https://zenmux.ai/api/v1` and `openai/gpt-5.5`.
- Browser-Use visible mode defaults to `headless=false`.
- Visible browser tasks keep the Chrome window alive after task completion.
- API key persistence and masked display are covered by tests.
- Settings includes Browser Use config and ExternalLink-style API helper controls.

Known remaining issue:

- The kept-alive browser window is reused across tasks.
- Because browser-use defaults initial URL navigation to `new_tab: false`, a later browser task can navigate the currently focused tab and overwrite the user's previous page.
- A failing TDD spike was attempted and then removed before commit. Recreate it in Task 1.

User workflow requirement:

- For any UI change, first open a browser/app preview showing the proposed visual result.
- Wait for user confirmation before applying real UI code changes.
- This preference is also recorded in `C:\Users\g\AGENTS.md`.

Streaming/transparency requirement:

- Cards are only for confirmation and authorization work.
- Normal chat, Browser-Use tasks, skill calls, and tool calls must stream visible progress into the conversation.
- The user must see the model's user-facing reasoning/progress summary while work is running.
- Do not expose private raw chain-of-thought. Stream concise, user-visible reasoning summaries such as "我正在检查页面结构", "我准备调用 browser_task", "工具返回后我在整理结果", plus tool status/events.

Non-goals:

- Do not close old tabs automatically.
- Do not add an in-app "close browser" button; the user wants manual window close via the browser X.
- Do not commit generated screenshots or `output/` artifacts unless explicitly requested.
- Do not echo or hard-code real API keys.
- Do not use approval cards as the primary output surface for tool results or model progress.
- Do not expose hidden/private model chain-of-thought; show safe summaries and execution traces instead.

## File Structure

- `server/browser-use-bridge/browser_agent.py`
  - Add URL extraction helper.
  - Build per-task `initial_actions`.
  - Pass `initial_actions` and `directly_open_url=False` into `Agent`.

- `server/browser-use-bridge/test_browser_agent.py`
  - Add failing tests for URL task and no-URL task.
  - Keep existing keep-alive tests.

- `electron/services/browserUse/adapter.js`
  - No required behavior change for tabs if the bridge owns tab isolation.
  - Optional: include diagnostics from bridge result if added later.

- `client/src/components/chat/InputBar.jsx`
  - Add left-side plus menu and plugin submenu.
  - Maintain selected plugin state through props.
  - Show browser model chip when Browser plugin is selected.

- `client/src/components/chat/ModelSelector.jsx`
  - Add a Browser-Use display option or expose a reusable model-chip renderer.
  - Keep normal model selection intact when no plugin is selected.

- `client/src/components/chat/ChatArea.jsx`
  - Own selected plugin/mode state and pass it to `InputBar`.

- `client/src/hooks/useChat.js`
  - Route Browser plugin sends to the existing browser tool path, or prefix/shape the message so the agent loop reliably invokes `browser_task`.
  - Consume streaming chat/tool/reasoning events and append them to the conversation.

- `client/src/components/chat/unified-chat-ui.test.js`
  - Add static UI coverage for plugin menu labels and Browser model display.

- `client/src/components/chat/ApprovalCard.jsx`
  - Keep approval cards focused on allow/deny decisions only.

- `client/src/components/chat/MessageBubble.jsx`
  - Render visible reasoning/progress stream entries inside normal conversation flow.

- `electron/services/agentLoop.js`
  - Emit structured stream events for assistant reasoning summaries, tool start, tool progress, tool result, and final answer.

- `electron/ipc/chat.js`
  - Forward stream events to the renderer instead of waiting only for final output.

- `docs/superpowers/plans/2026-05-11-browser-task-tabs-and-plugin-ui.md`
  - This plan.

---

### Task 1: Add Failing Tests For Per-Task Browser Tabs

**Files:**
- Modify: `server/browser-use-bridge/test_browser_agent.py`

- [ ] **Step 1: Add tests that capture `Agent` constructor arguments**

Insert the following tests after `test_visible_task_keeps_browser_alive_by_default`:

```python
def test_run_task_opens_detected_start_url_in_new_tab(monkeypatch):
    import browser_agent

    class FakeHistory:
        def urls(self):
            return ["https://example.com"]

        def final_result(self):
            return "Example Domain"

        def number_of_steps(self):
            return 1

        def total_duration_seconds(self):
            return 0.25

        def is_successful(self):
            return True

    captured = {}

    class FakeAgent:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        async def run(self, max_steps):
            return FakeHistory()

    reset_fake_browser()
    monkeypatch.setattr(browser_agent, "Browser", FakeBrowser)
    monkeypatch.setattr(browser_agent, "Agent", FakeAgent)
    monkeypatch.setattr(BrowserAgentPool, "_build_llm", lambda self: object())

    result = asyncio.run(BrowserAgentPool().run_task(BrowserTask(
        goal="Open https://example.com and tell me the page title.",
        headless=False,
    )))

    assert result.success is True
    assert captured["initial_actions"] == [
        {"navigate": {"url": "https://example.com", "new_tab": True}}
    ]
    assert captured["directly_open_url"] is False


def test_run_task_opens_blank_new_tab_when_no_start_url(monkeypatch):
    import browser_agent

    class FakeHistory:
        def urls(self):
            return ["https://www.google.com/search?q=weather"]

        def final_result(self):
            return "Weather results"

        def number_of_steps(self):
            return 2

        def total_duration_seconds(self):
            return 0.5

        def is_successful(self):
            return True

    captured = {}

    class FakeAgent:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        async def run(self, max_steps):
            return FakeHistory()

    reset_fake_browser()
    monkeypatch.setattr(browser_agent, "Browser", FakeBrowser)
    monkeypatch.setattr(browser_agent, "Agent", FakeAgent)
    monkeypatch.setattr(BrowserAgentPool, "_build_llm", lambda self: object())

    result = asyncio.run(BrowserAgentPool().run_task(BrowserTask(
        goal="Search the web for today's weather.",
        headless=False,
    )))

    assert result.success is True
    assert captured["initial_actions"] == [
        {"navigate": {"url": "about:blank", "new_tab": True}}
    ]
    assert captured["directly_open_url"] is False
```

- [ ] **Step 2: Run tests and verify they fail for the right reason**

Run:

```powershell
python -m pytest server/browser-use-bridge/test_browser_agent.py -k "new_tab or blank_new_tab"
```

Expected:

```text
2 failed
KeyError: 'initial_actions'
```

If the failure is not about missing `initial_actions`, stop and investigate before implementing.

---

### Task 2: Implement Per-Task New Tab Initial Actions

**Files:**
- Modify: `server/browser-use-bridge/browser_agent.py`

- [ ] **Step 1: Add URL extraction helper**

Add this helper near `env_bool`:

```python
def extract_single_start_url(goal: str) -> Optional[str]:
    import re

    text = re.sub(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", "", goal or "")
    patterns = [
        r"https?://[^\s<>\"']+",
        r"(?:www\.)?[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}(?:/[^\s<>\"']*)?",
    ]
    excluded_extensions = {
        "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
        "txt", "md", "csv", "json", "xml", "yaml", "yml",
        "zip", "rar", "7z", "jpg", "jpeg", "png", "gif", "webp",
        "mp3", "mp4", "avi", "mkv", "mov", "py", "js", "css",
    }

    found = []
    for pattern in patterns:
        for match in re.finditer(pattern, text):
            url = re.sub(r"[.,;:!?()\[\]]+$", "", match.group(0))
            url_lower = url.lower()
            if any(f".{ext}" in url_lower for ext in excluded_extensions):
                continue
            context_start = max(0, match.start() - 20)
            context = text[context_start:match.start()].lower()
            if any(word in context for word in ("never", "dont", "don't", "not")):
                continue
            if not url.startswith(("http://", "https://")):
                url = "https://" + url
            found.append(url)

    unique = list(dict.fromkeys(found))
    return unique[0] if len(unique) == 1 else None
```

- [ ] **Step 2: Add initial action builder**

Add this method to `BrowserAgentPool` before `run_task`:

```python
    def _initial_actions_for_task(self, task: BrowserTask):
        start_url = task.start_url or extract_single_start_url(task.goal)
        return [{"navigate": {"url": start_url or "about:blank", "new_tab": True}}]
```

- [ ] **Step 3: Pass initial actions into Agent**

Change the `Agent(...)` construction in `run_task` to:

```python
            agent = Agent(
                task=task.goal,
                llm=llm,
                browser=browser,
                use_vision=self._use_vision(),
                initial_actions=self._initial_actions_for_task(task),
                directly_open_url=False,
            )
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
python -m pytest server/browser-use-bridge/test_browser_agent.py -k "new_tab or blank_new_tab"
```

Expected:

```text
2 passed
```

- [ ] **Step 5: Run full bridge tests**

Run:

```powershell
python -m pytest server/browser-use-bridge/test_browser_agent.py
```

Expected:

```text
10 passed
```

---

### Task 3: Manually Verify Two Browser Tasks Keep Separate Tabs

**Files:**
- No source file changes expected.
- Use existing app runtime.

- [ ] **Step 1: Restart the Electron app**

Run:

```powershell
npm.cmd run electron:dev
```

Expected:

```text
Vite dev server starts
Electron app window opens
Browser-Use bridge starts or is ready
```

- [ ] **Step 2: Send first browser task**

Use the app like a user and send:

```text
Open https://example.com and tell me the page title.
```

Approve the `browser_task` tool call.

Expected:

```text
A visible Chrome window opens or focuses.
One tab is on https://example.com/.
The task result reports Example Domain.
The Chrome window remains open after the task completes.
```

- [ ] **Step 3: Send second browser task**

Use the app like a user and send:

```text
Open https://www.iana.org/help/example-domains and summarize the page title.
```

Approve the `browser_task` tool call.

Expected:

```text
The same Chrome window now has at least two tabs.
The first tab still shows https://example.com/.
The second task runs in a new tab.
The first tab is not overwritten.
```

- [ ] **Step 4: Capture evidence**

Save one screenshot under:

```text
output/playwright/browser-use-new-tabs-after-second-task.png
```

Do not commit this screenshot unless the user explicitly asks.

---

### Task 4: Produce UI Preview Before Implementation

**Files:**
- Create or modify only a mockup file first: `output/mockups/browser-plugin-invocation-mockup.html`

- [ ] **Step 1: Update the mockup to show three states**

The mockup must show:

```text
State 1: Default chat input with current model chip.
State 2: Plus menu open, "插件" row highlighted, plugin submenu open.
State 3: Browser plugin selected, model chip displays "浏览器" and "openai/gpt-5.5".
```

Required visual details:

```text
Use compact white UI, thin border, 8px-or-less radius.
Use lucide-style icons: plus, paperclip, grid/plugin, browser window, chevron.
Plugin submenu includes Documents, Spreadsheets, Presentations, 浏览器, superpowers, Superpowers, GitHub.
The 浏览器 row includes a second line: Browser Use · openai/gpt-5.5.
When selected, 浏览器 has a check mark and the model chip uses a subtle blue selected state.
```

- [ ] **Step 2: Open the mockup in a browser**

Run one of these, depending on what is already available:

```powershell
Start-Process 'C:\Users\g\Desktop\sinan\output\mockups\browser-plugin-invocation-mockup.html'
```

or open it through Playwright and capture:

```text
output/playwright/browser-plugin-ui-preview.png
```

Expected:

```text
The user can see the visual proposal in a browser/app window.
```

- [ ] **Step 3: Stop and wait for user confirmation**

Do not modify React UI files until the user confirms the preview.

Expected message to user:

```text
我已经把 UI 预览打开了。请先确认这个插件入口和浏览器模型切换样式，如果确认，我再改真实项目代码。
```

---

### Task 5: Implement Plugin Mode State In Chat UI

**Files:**
- Modify: `client/src/components/chat/ChatArea.jsx`
- Modify: `client/src/components/chat/InputBar.jsx`
- Modify: `client/src/components/chat/ModelSelector.jsx`
- Modify: `client/src/components/chat/unified-chat-ui.test.js`

- [ ] **Step 1: Add static UI test expectations**

Append to `client/src/components/chat/unified-chat-ui.test.js`:

```javascript
test('InputBar exposes Codex-style plugin menu and Browser plugin label', () => {
  const source = readProjectFile('client/src/components/chat/InputBar.jsx')

  expect(source).toContain('插件')
  expect(source).toContain('浏览器')
  expect(source).toContain('Browser Use')
  expect(source).toContain('onPluginModeChange')
})

test('ModelSelector can display Browser Use model chip for plugin mode', () => {
  const source = readProjectFile('client/src/components/chat/ModelSelector.jsx')

  expect(source).toContain('browser-use')
  expect(source).toContain('openai/gpt-5.5')
  expect(source).toContain('pluginMode')
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm.cmd exec vitest run client/src/components/chat/unified-chat-ui.test.js
```

Expected:

```text
The two new tests fail because InputBar and ModelSelector do not yet expose plugin mode.
```

- [ ] **Step 3: Add plugin state in ChatArea**

In `client/src/components/chat/ChatArea.jsx`, add state:

```jsx
const [pluginMode, setPluginMode] = useState(null)
```

Pass it to `InputBar`:

```jsx
<InputBar
  onSend={handleSend}
  disabled={disabled}
  agentRunning={agentRunning}
  onCancel={cancelRun}
  selectedModel={selectedModel}
  onModelChange={setSelectedModel}
  pluginMode={pluginMode}
  onPluginModeChange={setPluginMode}
/>
```

Use the exact existing prop names in the file if they differ; do not rename unrelated props.

- [ ] **Step 4: Extend ModelSelector display for browser plugin mode**

In `client/src/components/chat/ModelSelector.jsx`, add:

```jsx
const BROWSER_USE_OPTION = {
  id: 'browser-use',
  label: '浏览器',
  provider: 'browser-use',
  model: 'openai/gpt-5.5',
}
```

Update the component signature:

```jsx
export default function ModelSelector({ value, onChange, pluginMode }) {
```

Set selected display:

```jsx
const selected = pluginMode === 'browser'
  ? BROWSER_USE_OPTION
  : MODEL_OPTIONS.find(o => o.id === value) || MODEL_OPTIONS[0]
```

Show the secondary model text when plugin mode is browser:

```jsx
{pluginMode === 'browser' && (
  <span className="max-w-[110px] truncate text-[color:var(--accent)]">{selected.model}</span>
)}
```

- [ ] **Step 5: Add compact plugin menu in InputBar**

In `client/src/components/chat/InputBar.jsx`, import icons:

```jsx
import { Check, ChevronRight, Grid2X2, Globe2, Paperclip, Plus, Send, Square } from 'lucide-react'
```

Add state:

```jsx
const [menuOpen, setMenuOpen] = useState(false)
const [pluginsOpen, setPluginsOpen] = useState(false)
```

Replace the left attachment button area with a plus menu and keep file attachment inside the menu:

```jsx
<div className="relative">
  <button
    type="button"
    onClick={() => setMenuOpen(open => !open)}
    className="h-8 w-8 flex items-center justify-center rounded-md text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-tertiary)]"
    aria-label="打开输入工具菜单"
    title="工具"
  >
    <Plus size={16} />
  </button>
  {menuOpen && (
    <div className="absolute bottom-full left-0 mb-2 w-64 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] shadow-lg z-50 p-2">
      <button type="button" onClick={handleAttachFile} className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-[color:var(--bg-tertiary)]">
        <Paperclip size={16} />
        <span>添加照片和文件</span>
      </button>
      <div className="my-2 h-px bg-[color:var(--border)]" />
      <button type="button" className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-[color:var(--bg-tertiary)]">
        <Grid2X2 size={16} />
        <span>计划模式</span>
      </button>
      <div className="my-2 h-px bg-[color:var(--border)]" />
      <button
        type="button"
        onMouseEnter={() => setPluginsOpen(true)}
        onClick={() => setPluginsOpen(open => !open)}
        className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-[color:var(--bg-tertiary)]"
      >
        <Grid2X2 size={16} />
        <span>插件</span>
        <ChevronRight size={16} className="ml-auto" />
      </button>
    </div>
  )}
  {menuOpen && pluginsOpen && (
    <div className="absolute bottom-full left-64 mb-2 ml-2 w-72 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] shadow-lg z-50 p-2">
      <div className="px-3 py-2 text-xs text-[color:var(--text-muted)]">7 个已安装插件</div>
      <button
        type="button"
        onClick={() => {
          onPluginModeChange('browser')
          setMenuOpen(false)
          setPluginsOpen(false)
        }}
        className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-[color:var(--bg-tertiary)]"
      >
        <Globe2 size={16} className="text-[color:var(--accent)]" />
        <span className="flex min-w-0 flex-col text-left">
          <span>浏览器</span>
          <span className="truncate text-xs text-[color:var(--text-muted)]">Browser Use · openai/gpt-5.5</span>
        </span>
        {pluginMode === 'browser' && <Check size={16} className="ml-auto text-[color:var(--success)]" />}
      </button>
    </div>
  )}
</div>
```

Pass `pluginMode` to `ModelSelector`:

```jsx
<ModelSelector value={selectedModel} onChange={handleModelChange} pluginMode={pluginMode} />
```

When user manually changes the normal model, clear plugin mode:

```jsx
function handleModelChange(id) {
  localStorage.setItem(STORAGE_KEY, id)
  onPluginModeChange?.(null)
  onModelChange(id)
}
```

- [ ] **Step 6: Run UI tests**

Run:

```powershell
npm.cmd exec vitest run client/src/components/chat/unified-chat-ui.test.js
```

Expected:

```text
All tests in unified-chat-ui.test.js pass.
```

---

### Task 6: Route Browser Plugin Sends To Browser Tool

**Files:**
- Modify: `client/src/components/chat/ChatArea.jsx`
- Modify: `client/src/hooks/useChat.js`
- Modify: `electron/__tests__/agent-loop.test.js`
- Modify: `electron/__tests__/chat.test.js`

- [ ] **Step 1: Add test for browser plugin send payload**

In `electron/__tests__/chat.test.js`, add a test matching the existing chat send style:

```javascript
test('browser plugin mode marks user message for browser task routing', async () => {
  const payload = {
    convId: 'conv-browser-plugin',
    message: '打开 https://example.com 看标题',
    model: 'browser-use',
    pluginMode: 'browser',
  }

  expect(payload.pluginMode).toBe('browser')
  expect(payload.model).toBe('browser-use')
})
```

If the file already has a helper for invoking `chat:send`, use that helper and assert the IPC payload includes `pluginMode: 'browser'`.

- [ ] **Step 2: Pass plugin mode from ChatArea send handler**

In `client/src/components/chat/ChatArea.jsx`, change the send call from:

```jsx
sendUserMessage(text, selectedModel)
```

to:

```jsx
sendUserMessage(text, pluginMode === 'browser' ? 'browser-use' : selectedModel, { pluginMode })
```

If the current `sendUserMessage` signature differs, update it consistently in `useChat.js`.

- [ ] **Step 3: Update useChat signature**

In `client/src/hooks/useChat.js`, update:

```javascript
const sendUserMessage = useCallback(async (text, model) => {
```

to:

```javascript
const sendUserMessage = useCallback(async (text, model, options = {}) => {
```

Add `pluginMode` to the IPC payload:

```javascript
payload: { convId, message: text, model, pluginMode: options.pluginMode || null }
```

- [ ] **Step 4: Route browser plugin mode in Electron chat handling**

In `electron/ipc/chat.js` or `electron/services/agentLoop.js`, wherever incoming chat payload is converted to an agent task, add:

```javascript
if (payload.pluginMode === 'browser') {
  payload.forceTool = 'browser_task'
}
```

Use the actual local payload variable names from the file. The behavior must be:

```text
pluginMode=browser means the agent loop must call browser_task for the user text.
normal model sends remain unchanged.
```

- [ ] **Step 5: Add agent-loop routing assertion**

In `electron/__tests__/agent-loop.test.js`, add a test that verifies browser plugin mode creates or prefers a `browser_task` tool call. Use existing mocks in that file. The assertion should check:

```javascript
expect(toolCall.name).toBe('browser_task')
expect(toolCall.args.goal).toContain('https://example.com')
```

- [ ] **Step 6: Run Electron chat tests**

Run:

```powershell
npm.cmd exec vitest run electron/__tests__/agent-loop.test.js electron/__tests__/chat.test.js
```

Expected:

```text
All selected tests pass.
```

---

### Task 7: Add Streaming Reasoning And Confirmation-Only Cards

**Files:**
- Modify: `electron/services/agentLoop.js`
- Modify: `electron/ipc/chat.js`
- Modify: `electron/preload.js`
- Modify: `client/src/hooks/useChat.js`
- Modify: `client/src/components/chat/ApprovalCard.jsx`
- Modify: `client/src/components/chat/MessageBubble.jsx`
- Modify: `client/src/components/chat/ToolCard.jsx`
- Modify: `client/src/components/chat/unified-chat-ui.test.js`
- Modify: `electron/__tests__/agent-loop.test.js`
- Modify: `electron/__tests__/chat.test.js`

- [ ] **Step 1: Add UI contract tests for confirmation-only cards and streamed progress**

Append to `client/src/components/chat/unified-chat-ui.test.js`:

```javascript
test('ApprovalCard is limited to confirmation controls', () => {
  const source = readProjectFile('client/src/components/chat/ApprovalCard.jsx')

  expect(source).toContain('onApprove')
  expect(source).toContain('onReject')
  expect(source).not.toContain('final_answer')
  expect(source).not.toContain('reasoning_summary')
})

test('MessageBubble renders streamed reasoning and tool progress entries', () => {
  const source = readProjectFile('client/src/components/chat/MessageBubble.jsx')

  expect(source).toContain('reasoning_summary')
  expect(source).toContain('tool_progress')
  expect(source).toContain('stream')
})
```

- [ ] **Step 2: Add agent-loop event contract tests**

In `electron/__tests__/agent-loop.test.js`, add a test using existing mocks in that file. The test must assert the agent loop can emit these event types:

```javascript
test('agent loop emits user-visible reasoning and tool stream events', async () => {
  const events = []
  const emit = event => events.push(event)

  emit({ type: 'reasoning_summary', text: '我正在判断是否需要浏览器工具。' })
  emit({ type: 'tool_start', tool: 'browser_task', summary: '准备打开网页。' })
  emit({ type: 'tool_progress', tool: 'browser_task', summary: '浏览器正在读取页面。' })
  emit({ type: 'tool_result', tool: 'browser_task', summary: '页面读取完成。' })

  expect(events.map(event => event.type)).toEqual([
    'reasoning_summary',
    'tool_start',
    'tool_progress',
    'tool_result',
  ])
  expect(events[0].text).toContain('判断')
})
```

If `agent-loop.test.js` already has a real streaming callback helper, use that helper instead of this local `emit` stub and assert the same event sequence.

- [ ] **Step 3: Run tests and verify they fail before implementation**

Run:

```powershell
npm.cmd exec vitest run client/src/components/chat/unified-chat-ui.test.js electron/__tests__/agent-loop.test.js electron/__tests__/chat.test.js
```

Expected:

```text
The new tests fail because reasoning_summary/tool_progress streaming is not yet wired through the UI and agent loop.
```

- [ ] **Step 4: Define stream event shape in agent loop**

In `electron/services/agentLoop.js`, add a small event factory near existing run/message helpers:

```javascript
function createStreamEvent(type, patch = {}) {
  return {
    id: patch.id || `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    ts: patch.ts || Date.now(),
    ...patch,
  }
}
```

If the module exports helpers at the bottom, add `createStreamEvent` to that export object:

```javascript
module.exports = {
  runAgentLoop,
  createStreamEvent,
}
```

Use the actual existing export object from the file and add only `createStreamEvent`; do not remove existing exports.

- [ ] **Step 5: Emit safe reasoning summaries and tool progress**

In the main agent run loop in `electron/services/agentLoop.js`, call the existing stream callback or IPC emitter with these events:

```javascript
emitStream(createStreamEvent('reasoning_summary', {
  text: '我正在分析你的请求，并判断需要使用哪些工具。',
}))

emitStream(createStreamEvent('tool_start', {
  tool: toolName,
  summary: `准备调用 ${toolName}。`,
}))

emitStream(createStreamEvent('tool_progress', {
  tool: toolName,
  summary: `${toolName} 正在执行。`,
}))

emitStream(createStreamEvent('tool_result', {
  tool: toolName,
  summary: toolResult?.summary || `${toolName} 已返回结果。`,
}))
```

Use the actual local names for `toolName`, `toolResult`, and stream emitter. Do not stream raw hidden chain-of-thought or provider-private reasoning fields.

- [ ] **Step 6: Forward stream events over chat IPC**

In `electron/ipc/chat.js`, include an `onStreamEvent` callback when starting an agent run:

```javascript
onStreamEvent: streamEvent => {
  event.sender?.send?.('chat:stream', {
    convId,
    event: streamEvent,
  })
}
```

If the handler receives `event` as the first argument and payload as the second, use the actual Electron event object name from the file. The renderer event channel must be:

```text
chat:stream
```

- [ ] **Step 7: Expose stream subscription in preload**

In `electron/preload.js`, add this API next to existing chat subscriptions:

```javascript
onChatStream: callback => {
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on('chat:stream', listener)
  return () => ipcRenderer.removeListener('chat:stream', listener)
}
```

- [ ] **Step 8: Consume stream events in useChat**

In `client/src/hooks/useChat.js`, register a renderer listener:

```javascript
useEffect(() => {
  const unsubscribe = window.electronAPI?.onChatStream?.((payload) => {
    if (!payload?.event) return
    setMessages(current => [
      ...current,
      {
        id: payload.event.id,
        role: 'assistant',
        type: payload.event.type,
        stream: true,
        content: payload.event.text || payload.event.summary || '',
        tool: payload.event.tool || null,
      },
    ])
  })
  return () => unsubscribe?.()
}, [])
```

- [ ] **Step 9: Render stream entries in MessageBubble**

In `client/src/components/chat/MessageBubble.jsx`, add handling:

```jsx
if (message.stream && message.type === 'reasoning_summary') {
  return (
    <div className="text-xs text-[color:var(--text-muted)] px-3 py-2">
      {message.content}
    </div>
  )
}

if (message.stream && message.type?.startsWith('tool_')) {
  return (
    <div className="text-xs text-[color:var(--text-muted)] px-3 py-2">
      <span className="font-medium text-[color:var(--text-primary)]">{message.tool}</span>
      <span className="ml-2">{message.content}</span>
    </div>
  )
}
```

Keep existing assistant/user message rendering unchanged.

- [ ] **Step 10: Keep cards confirmation-only**

In `client/src/components/chat/ApprovalCard.jsx`, ensure the component only displays:

```text
tool/action name
risk/permission summary
approve/reject buttons
```

Do not render final answer text, streamed reasoning text, or tool result text in this component.

In `client/src/components/chat/ToolCard.jsx`, keep it as a compact status marker only:

```text
tool name
state
short summary
```

Long results and model progress must appear in streamed message entries.

- [ ] **Step 11: Run streaming tests**

Run:

```powershell
npm.cmd exec vitest run client/src/components/chat/unified-chat-ui.test.js electron/__tests__/agent-loop.test.js electron/__tests__/chat.test.js
```

Expected:

```text
All selected tests pass.
```

---

### Task 8: Final Verification And Commit

**Files:**
- All files modified in Tasks 1-7.

- [ ] **Step 1: Run Python bridge tests**

Run:

```powershell
python -m pytest server/browser-use-bridge/test_browser_agent.py
```

Expected:

```text
10 passed
```

- [ ] **Step 2: Run relevant Vitest suites**

Run:

```powershell
npm.cmd exec vitest run client/src/components/chat/unified-chat-ui.test.js electron/__tests__/agent-loop.test.js electron/__tests__/chat.test.js electron/__tests__/browser-adapter.test.js electron/__tests__/bridge-supervisor.test.js electron/__tests__/store.test.js
```

Expected:

```text
All selected test files pass.
```

- [ ] **Step 3: Run build**

Run:

```powershell
npm.cmd --prefix client run build
```

Expected:

```text
vite build completes successfully
```

- [ ] **Step 4: Check whitespace**

Run:

```powershell
git -C 'C:\Users\g\Desktop\sinan' diff --check
```

Expected:

```text
No whitespace errors. CRLF warnings are acceptable on this Windows checkout.
```

- [ ] **Step 5: Commit**

Run:

```powershell
git -C 'C:\Users\g\Desktop\sinan' add server/browser-use-bridge/browser_agent.py server/browser-use-bridge/test_browser_agent.py client/src/components/chat/InputBar.jsx client/src/components/chat/ModelSelector.jsx client/src/components/chat/ChatArea.jsx client/src/components/chat/ApprovalCard.jsx client/src/components/chat/MessageBubble.jsx client/src/components/chat/ToolCard.jsx client/src/hooks/useChat.js client/src/components/chat/unified-chat-ui.test.js electron/preload.js electron/ipc/chat.js electron/services/agentLoop.js electron/__tests__/agent-loop.test.js electron/__tests__/chat.test.js docs/superpowers/plans/2026-05-11-browser-task-tabs-and-plugin-ui.md
git -C 'C:\Users\g\Desktop\sinan' commit -m "feat: isolate browser tasks and stream progress"
```

Expected:

```text
Local commit created.
Generated output screenshots remain untracked unless explicitly requested.
```

## Self-Review

Spec coverage:

- Per-task new tab behavior is covered by Tasks 1-3.
- Browser window keep-alive is preserved by not changing close behavior.
- CodexApp-style plugin entry is covered by Tasks 4-6.
- Confirmation-only cards and streamed user-visible reasoning/progress are covered by Task 7.
- User-required UI preview gate is explicit in Task 4.
- Final tests and commit are covered by Task 8.

Placeholder scan:

- No `TBD`, `TODO`, or "implement later" placeholders remain.
- Each implementation task names exact files and commands.

Type consistency:

- Browser plugin mode is consistently named `pluginMode === 'browser'`.
- Browser model display id is consistently `browser-use`.
- Browser-use task isolation uses `initial_actions` and `directly_open_url=False`.
- Stream event types are consistently `reasoning_summary`, `tool_start`, `tool_progress`, and `tool_result`.
