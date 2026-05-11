# Computer Use One-Shot Cursor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Computer Use a one-shot, observable desktop task mode with click-confirmation choices, a minimal real desktop agent loop, and a visible cursor overlay.

**Architecture:** Keep Electron as the policy/chat owner and `server/desktop-use-bridge` as the runtime owner. Renderer consumes the desktop plugin mode after one send, renders confirmation choices in chat, and Electron forwards desktop cursor stream events to a transparent overlay window. The bridge planner uses injected tests first and a GPT-compatible endpoint from existing `DESKTOP_USE_*` env vars at runtime.

**Tech Stack:** React, Electron IPC, Node Express sidecar, `@nut-tree-fork/nut-js`, OpenAI-compatible Chat Completions over `fetch`, Vitest.

---

## File Structure

- Create `client/src/lib/desktopIntent.js`: classifies whether a message should route to Computer Use.
- Create `client/src/lib/desktopIntent.test.js`: tests executable desktop intent and feedback questions.
- Modify `client/src/components/chat/ChatArea.jsx`: consume desktop plugin mode after one send.
- Modify `client/src/components/chat/InputBar.jsx`: confirmation wait copy no longer asks for typed replies.
- Modify `client/src/components/chat/MessageList.jsx`: pass confirmation choice handler into messages.
- Modify `client/src/components/chat/MessageBubble.jsx`: render `确定` / `取消` choice buttons for confirmation messages.
- Modify `client/src/hooks/useChat.js`: create confirmation messages and resolve choices through IPC.
- Modify `electron/ipc/chatConfirmation.js`: support explicit boolean confirmation replies.
- Modify `electron/ipc/chat.js`: return clearer confirmation statuses.
- Modify `electron/services/agentLoop.js`: emit correct Browser Use vs Computer Use reasoning text.
- Create `electron/services/desktopCursorOverlay.js`: transparent always-on-top overlay controller.
- Modify `electron/main.js`: create and register the overlay controller.
- Modify `electron/ipc/index.js` or `electron/ipc/chat.js`: pass overlay deps into chat registration.
- Modify `electron/preload.js`: no public overlay API required unless tests reveal a need.
- Create `server/desktop-use-bridge/planner.js`: OpenAI-compatible desktop planner plus action parsing.
- Modify `server/desktop-use-bridge/agentRunner.js`: observe-plan-act loop with cursor/progress events.
- Modify `server/desktop-use-bridge/index.js`: pass per-request event sink into `agentRunner.runTask`.
- Modify `electron/services/desktop/adapter.js`: preserve cursor/progress metadata from bridge results.
- Modify `electron/tools/desktopTask.js`: return streamed task steps and summary.
- Add/update focused tests in `client/src`, `electron/__tests__`, and `server/desktop-use-bridge/__tests__`.

## Task 1: One-Shot Computer Use Routing

**Files:**
- Create: `client/src/lib/desktopIntent.js`
- Create: `client/src/lib/desktopIntent.test.js`
- Modify: `client/src/components/chat/ChatArea.jsx`
- Modify: `client/src/components/chat/unified-chat-ui.test.js`

- [ ] **Step 1: Write failing desktop intent tests**

Create `client/src/lib/desktopIntent.test.js`:

```js
import { describe, expect, test } from 'vitest'
import { shouldRouteToDesktopTask } from './desktopIntent.js'

describe('desktop intent routing', () => {
  test('routes executable desktop tasks to Computer Use', () => {
    expect(shouldRouteToDesktopTask('帮我打开qq')).toBe(true)
    expect(shouldRouteToDesktopTask('点击右上角的关闭按钮')).toBe(true)
    expect(shouldRouteToDesktopTask('在输入框里输入 hello')).toBe(true)
    expect(shouldRouteToDesktopTask('按 ctrl s 保存')).toBe(true)
  })

  test('keeps feedback and debugging questions in normal chat', () => {
    expect(shouldRouteToDesktopTask('为啥不执行')).toBe(false)
    expect(shouldRouteToDesktopTask('为什么没有反应')).toBe(false)
    expect(shouldRouteToDesktopTask('你刚才在干嘛')).toBe(false)
    expect(shouldRouteToDesktopTask('解释一下为什么失败')).toBe(false)
  })
})
```

Run:

```powershell
npm.cmd exec -- vitest run client/src/lib/desktopIntent.test.js
```

Expected: FAIL because `desktopIntent.js` does not exist.

- [ ] **Step 2: Implement the desktop intent helper**

Create `client/src/lib/desktopIntent.js`:

```js
const EXECUTE_PATTERNS = [
  /打开|启动|运行|关闭|点击|点一下|输入|键入|按下|快捷键|选择|拖动|滚动|移动鼠标|操作|帮我.*(打开|点击|输入|操作)/
]

const FEEDBACK_PATTERNS = [
  /为啥|为什么|怎么回事|没反应|不执行|没有执行|你在干嘛|刚才|解释|原因|哪里错|失败了吗|卡住/
]

export function shouldRouteToDesktopTask(text) {
  const value = String(text || '').trim().toLowerCase()
  if (!value) return false
  if (FEEDBACK_PATTERNS.some((pattern) => pattern.test(value))) return false
  return EXECUTE_PATTERNS.some((pattern) => pattern.test(value))
}
```

- [ ] **Step 3: Consume desktop plugin mode in ChatArea**

Modify `client/src/components/chat/ChatArea.jsx`:

```js
import { shouldRouteToDesktopTask } from '../../lib/desktopIntent.js'
```

Inside `handleSend(text)`, replace plugin routing with:

```js
const wantsDesktop = pluginMode === 'desktop' && shouldRouteToDesktopTask(messageText)
const nextPluginMode = wantsDesktop ? 'desktop' : (pluginMode === 'browser' ? 'browser' : null)
sendUserMessage(nextPluginMode === 'desktop' ? messageText : messageText, nextPluginMode === 'browser' ? 'browser-use' : selectedModel, {
  pluginMode: nextPluginMode,
  forcedSkill: parsed?.forcedSkill || null
})
if (pluginMode === 'desktop') setPluginMode(null)
```

Keep Browser Use sticky for now; only Computer Use is one-shot.

- [ ] **Step 4: Update static UI tests**

In `client/src/components/chat/unified-chat-ui.test.js`, update or add assertions:

```js
expect(chatArea).toContain('shouldRouteToDesktopTask')
expect(chatArea).toContain("if (pluginMode === 'desktop') setPluginMode(null)")
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm.cmd exec -- vitest run client/src/lib/desktopIntent.test.js client/src/components/chat/unified-chat-ui.test.js
```

Expected: PASS.

Commit:

```powershell
git add client/src/lib/desktopIntent.js client/src/lib/desktopIntent.test.js client/src/components/chat/ChatArea.jsx client/src/components/chat/unified-chat-ui.test.js
git commit -m "fix: make computer use one-shot"
```

## Task 2: Confirmation Choice Buttons

**Files:**
- Modify: `client/src/hooks/useChat.js`
- Modify: `client/src/components/chat/MessageList.jsx`
- Modify: `client/src/components/chat/MessageBubble.jsx`
- Modify: `client/src/components/chat/InputBar.jsx`
- Modify: `electron/ipc/chatConfirmation.js`
- Modify: `electron/__tests__/chat.test.js`
- Modify: `client/src/components/chat/unified-chat-ui.test.js`

- [ ] **Step 1: Write failing chat IPC test for explicit confirmation choice**

Add to `electron/__tests__/chat.test.js`:

```js
test('chat confirmation accepts explicit approved boolean from renderer choices', async () => {
  const ipcMain = createIpcMain()
  const send = vi.fn()
  const call = { id: 'call-choice', name: 'desktop_task', args: { goal: 'open qq' } }
  const decision = { risk: 'high', reason: 'desktop automation' }
  let approvedValue
  const runTurn = vi.fn(async ({ requestApproval }) => {
    approvedValue = await requestApproval({ call, decision })
    return { finalText: approvedValue ? 'approved' : 'denied', history: [] }
  })
  const register = createRegister({
    storeRef: { getConfig: () => ({ permissionMode: 'default' }) },
    runTurn,
    userRules: { buildSystemPromptSection: () => '' },
    skillRegistry: { listSkills: () => [], buildSkillIndex: () => '', findSkill: () => null }
  })
  register(ipcMain)

  const pending = ipcMain.handlers.get('chat:send')({ sender: { send } }, {
    convId: 'conv-choice',
    messages: [{ role: 'user', content: 'open qq' }]
  })
  await Promise.resolve()

  const reply = await ipcMain.handlers.get('chat:send')({ sender: { send } }, {
    convId: 'conv-choice',
    confirmationReply: true,
    approved: true
  })

  expect(reply).toEqual({ ok: true, status: 'confirmed' })
  await pending
  expect(approvedValue).toBe(true)
})
```

Run:

```powershell
npm.cmd exec -- vitest run electron/__tests__/chat.test.js -t "explicit approved boolean"
```

Expected: FAIL because `approved` is ignored.

- [ ] **Step 2: Implement explicit boolean confirmation replies**

In `electron/ipc/chat.js`, update `handleConfirmationReply` before text classification:

```js
if (typeof payload.approved === 'boolean') {
  settlePendingConfirmation(convId, payload.approved, payload.approved ? 'confirmed' : 'rejected')
  return { ok: true, status: payload.approved ? 'confirmed' : 'rejected' }
}
```

- [ ] **Step 3: Add confirmation message state in useChat**

In `client/src/hooks/useChat.js`, add reducer cases:

```js
case 'ADD_CONFIRMATION':
  return { ...state, messages: [...state.messages, action.msg] }
case 'UPDATE_CONFIRMATION':
  return {
    ...state,
    messages: state.messages.map((message) => (
      message.type === 'confirmation' && message.confirmation?.callId === action.callId
        ? { ...message, confirmationStatus: action.status }
        : message
    ))
  }
```

Add helper:

```js
function formatConfirmationContent(pending) {
  const args = JSON.stringify(pending.args || {}, null, 2)
  return [
    `需要确认高风险操作: ${pending.toolName}`,
    `风险原因: ${pending.reason || 'high risk operation'}`,
    '参数:',
    args
  ].join('\n')
}
```

In `onConfirmationRequest`, append a message:

```js
setPendingConfirmation(event.pending)
dispatch({
  type: 'ADD_CONFIRMATION',
  msg: {
    id: `confirm-${event.pending.callId}`,
    role: 'assistant',
    type: 'confirmation',
    content: formatConfirmationContent(event.pending),
    confirmation: event.pending,
    confirmationStatus: 'pending'
  }
})
```

Add `respondToConfirmation`:

```js
const respondToConfirmation = useCallback((approved) => {
  const convId = conversationIdRef.current
  const pending = pendingConfirmation
  if (!convId || !pending) return
  dispatch({ type: 'UPDATE_CONFIRMATION', callId: pending.callId, status: approved ? 'confirmed' : 'rejected' })
  api.invoke('chat:send', { convId, confirmationReply: true, approved }).then((result) => {
    if (result.status === 'confirmed' || result.status === 'rejected' || result.status === 'missing') {
      setPendingConfirmation(null)
    }
    if (result.assistantText) {
      dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', content: result.assistantText } })
    }
  }).catch((error) => {
    dispatch({ type: 'UPDATE_CONFIRMATION', callId: pending.callId, status: 'pending' })
    dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', content: `[确认失败] ${error.message}` } })
  })
}, [pendingConfirmation])
```

Return `respondToConfirmation` from the hook.

- [ ] **Step 4: Render confirmation choices**

In `MessageList.jsx`, accept `onRespondConfirmation` and pass it to `MessageBubble`.

In `MessageBubble.jsx`, before normal message rendering, add:

```jsx
if (message?.type === 'confirmation') {
  const disabled = message.confirmationStatus !== 'pending'
  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[75%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap break-words bg-[color:var(--bg-secondary)] text-[color:var(--text-primary)] rounded-bl-sm border border-[color:var(--border)]">
        <div>{content}</div>
        <div className="mt-3 flex gap-3">
          <button type="button" disabled={disabled} onClick={() => message.onRespondConfirmation?.(true)} className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent)] px-3 py-1 text-xs disabled:opacity-60">
            <span className="h-3 w-3 rounded-full border border-current" />
            确定
          </button>
          <button type="button" disabled={disabled} onClick={() => message.onRespondConfirmation?.(false)} className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] px-3 py-1 text-xs disabled:opacity-60">
            <span className="h-3 w-3 rounded-full border border-current" />
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
```

If prop passing is cleaner than mutating message objects, pass `onRespondConfirmation` as a separate prop to `MessageBubble` and call that.

- [ ] **Step 5: Update InputBar waiting copy**

Replace `Waiting for confirmation...` with Chinese copy:

```jsx
<span className="min-w-0 truncate">等待确认：{pendingConfirmation.toolName}，请在聊天消息中选择“确定”或“取消”。</span>
```

Remove typed confirmation word copy from the status bar.

- [ ] **Step 6: Update static UI tests**

In `client/src/components/chat/unified-chat-ui.test.js`, update assertions to expect:

```js
expect(input).toContain('等待确认')
expect(input).toContain('请选择')
expect(useChat).toContain('respondToConfirmation')
expect(messageBubble).toContain('确定')
expect(messageBubble).toContain('取消')
```

- [ ] **Step 7: Verify and commit**

Run:

```powershell
npm.cmd exec -- vitest run electron/__tests__/chat.test.js client/src/components/chat/unified-chat-ui.test.js
```

Expected: PASS.

Commit:

```powershell
git add electron/ipc/chat.js electron/__tests__/chat.test.js client/src/hooks/useChat.js client/src/components/chat/MessageList.jsx client/src/components/chat/MessageBubble.jsx client/src/components/chat/InputBar.jsx client/src/components/chat/unified-chat-ui.test.js
git commit -m "feat: confirm desktop tasks with choices"
```

## Task 3: Correct Forced Tool Reasoning Text

**Files:**
- Modify: `electron/services/agentLoop.js`
- Modify: `electron/__tests__/agent-loop.test.js`

- [ ] **Step 1: Write failing reasoning text tests**

Add tests to `electron/__tests__/agent-loop.test.js`:

```js
test('desktop forced tool reasoning names Computer Use instead of browser', async () => {
  const events = []
  const deepseek = { chat: vi.fn(async () => ({ content: 'unused', assistant_message: { role: 'assistant', content: 'unused' }, tool_calls: [] })) }
  const tools = { execute: vi.fn(async () => ({ ok: true, metadata: { summary: 'done' } })), getAgentLoopToolSchemas: vi.fn(() => []) }
  const policy = mockPolicy({ desktop_task: { risk: 'medium', reason: 'desktop', allowed: true, requiresApproval: false } })

  await runTurn({
    messages: [{ role: 'user', content: 'open qq' }],
    forceTool: 'desktop_task',
    onStreamEvent: event => events.push(event)
  }, { deepseek, tools, policy })

  const text = events.find(event => event.type === 'reasoning_summary')?.text || ''
  expect(text).toContain('Computer Use')
  expect(text).not.toContain('浏览器')
})
```

Run:

```powershell
npm.cmd exec -- vitest run electron/__tests__/agent-loop.test.js -t "Computer Use"
```

Expected: FAIL with old browser copy.

- [ ] **Step 2: Implement tool-specific reasoning helper**

In `electron/services/agentLoop.js`, add:

```js
function forcedToolReasoningText(toolName) {
  if (toolName === 'desktop_task') return '准备交给 Computer Use 执行桌面任务。'
  if (toolName === 'browser_task') return '准备交给 Browser Use 执行浏览器任务。'
  return '准备调用工具执行任务。'
}
```

Use it in the forced tool block:

```js
emitStream('reasoning_summary', { text: forcedToolReasoningText(forcedCall.name) })
```

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm.cmd exec -- vitest run electron/__tests__/agent-loop.test.js
```

Expected: PASS.

Commit:

```powershell
git add electron/services/agentLoop.js electron/__tests__/agent-loop.test.js
git commit -m "fix: name forced desktop reasoning"
```

## Task 4: Desktop Planner And Minimal Agent Loop

**Files:**
- Create: `server/desktop-use-bridge/planner.js`
- Modify: `server/desktop-use-bridge/agentRunner.js`
- Modify: `server/desktop-use-bridge/index.js`
- Create: `server/desktop-use-bridge/__tests__/agentRunner.test.js`
- Modify: `server/desktop-use-bridge/__tests__/execute.test.js`

- [ ] **Step 1: Write failing agent runner loop tests**

Create `server/desktop-use-bridge/__tests__/agentRunner.test.js`:

```js
import { describe, expect, test, vi } from 'vitest'
import { createAgentRunner } from '../agentRunner'

function createDriver() {
  return {
    observe: vi.fn(async () => ({ screenshotBase64: 'img', mime: 'image/png', screen: { width: 100, height: 80, scaleFactor: 1 } })),
    click: vi.fn(async (args) => ({ ok: true, action: { type: 'click', ...args } })),
    type: vi.fn(async (args) => ({ ok: true, action: { type: 'type', ...args } })),
    hotkey: vi.fn(async (args) => ({ ok: true, action: { type: 'hotkey', ...args } })),
    wait: vi.fn(async (args) => ({ ok: true, action: { type: 'wait', ...args } })),
  }
}

describe('desktop agent runner', () => {
  test('executes planned actions until done', async () => {
    const driver = createDriver()
    const planner = {
      nextAction: vi.fn()
        .mockResolvedValueOnce({ type: 'click', x: 10, y: 20, reason: 'open target' })
        .mockResolvedValueOnce({ type: 'done', summary: 'opened target' })
    }
    const events = []
    const runner = createAgentRunner({ driver, planner })

    const result = await runner.runTask({ goal: 'open target', maxSteps: 4, onEvent: event => events.push(event) })

    expect(result.ok).toBe(true)
    expect(result.summary).toBe('opened target')
    expect(driver.click).toHaveBeenCalledWith({ x: 10, y: 20, button: 'left' })
    expect(events.some(event => event.type === 'cursor.move')).toBe(true)
    expect(events.some(event => event.type === 'cursor.click')).toBe(true)
  })

  test('fails safely for unsupported planner action', async () => {
    const driver = createDriver()
    const planner = { nextAction: vi.fn(async () => ({ type: 'deleteEverything' })) }
    const runner = createAgentRunner({ driver, planner })

    const result = await runner.runTask({ goal: 'bad action', maxSteps: 1 })

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('UNSUPPORTED_PLANNER_ACTION')
    expect(driver.click).not.toHaveBeenCalled()
  })
})
```

Run:

```powershell
npm.cmd exec -- vitest run server/desktop-use-bridge/__tests__/agentRunner.test.js
```

Expected: FAIL because the current runner only returns accepted.

- [ ] **Step 2: Implement planner action parser**

Create `server/desktop-use-bridge/planner.js`:

```js
function extractJson(text) {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('Planner did not return JSON.')
  return JSON.parse(candidate.slice(start, end + 1))
}

function normalizeAction(action) {
  const type = String(action?.type || '').trim().toLowerCase()
  if (type === 'click') return { type: 'click', x: Number(action.x), y: Number(action.y), button: action.button || 'left', reason: action.reason || '' }
  if (type === 'type') return { type: 'type', text: String(action.text ?? ''), reason: action.reason || '' }
  if (type === 'hotkey') return { type: 'hotkey', keys: Array.isArray(action.keys) ? action.keys : String(action.keys || '').split('+'), reason: action.reason || '' }
  if (type === 'wait') return { type: 'wait', ms: Math.max(0, Number(action.ms) || 500), reason: action.reason || '' }
  if (type === 'done') return { type: 'done', summary: String(action.summary || 'Desktop task completed.') }
  if (type === 'fail') return { type: 'fail', summary: String(action.summary || 'Desktop task failed.') }
  return { type: 'unsupported', raw: action }
}

function createPlanner({ fetchImpl = fetch, env = process.env } = {}) {
  const endpoint = env.DESKTOP_USE_MODEL_ENDPOINT || 'https://zenmux.ai/api/v1'
  const apiKey = env.DESKTOP_USE_MODEL_API_KEY || ''
  const model = env.DESKTOP_USE_MODEL_NAME || 'openai/gpt-5.5'
  return {
    async nextAction({ goal, step, observation }) {
      if (!apiKey) return { type: 'fail', summary: 'Desktop Use API key is not configured.' }
      const response = await fetchImpl(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You control a Windows desktop. Return only JSON with type: click/type/hotkey/wait/done/fail.' },
            { role: 'user', content: `Goal: ${goal}\nStep: ${step}\nScreen: ${JSON.stringify(observation.screen || {})}\nReturn next action JSON.` }
          ]
        })
      })
      const data = await response.json()
      return normalizeAction(extractJson(data.choices?.[0]?.message?.content || ''))
    }
  }
}

module.exports = { createPlanner, normalizeAction, extractJson }
```

- [ ] **Step 3: Implement observe-plan-act runner**

Update `server/desktop-use-bridge/agentRunner.js`:

- accept `{ driver, planner = createPlanner() }`
- call `driver.observe()` before each planner step
- support action types `click`, `type`, `hotkey`, `wait`, `done`, `fail`
- emit `onEvent({ type: 'cursor.move', x, y })` before click
- emit `onEvent({ type: 'cursor.click', x, y })` after click
- stop on `cancelled`
- return `{ ok, summary, steps, error }`

- [ ] **Step 4: Preserve task events in bridge response metadata**

In `server/desktop-use-bridge/index.js`, pass an event collector into task:

```js
const events = []
const result = await agentRunner.runTask({ goal: plan.goal, maxSteps: plan.maxSteps, onEvent: event => events.push(event) })
return res.json(normalize({ ok: result.ok, metadata: { ...result, events } }))
```

Update `execute.test.js` to assert `metadata.events` exists for `desktop.task`.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm.cmd exec -- vitest run server/desktop-use-bridge/__tests__/agentRunner.test.js server/desktop-use-bridge/__tests__/execute.test.js
```

Expected: PASS.

Commit:

```powershell
git add server/desktop-use-bridge/planner.js server/desktop-use-bridge/agentRunner.js server/desktop-use-bridge/index.js server/desktop-use-bridge/__tests__/agentRunner.test.js server/desktop-use-bridge/__tests__/execute.test.js
git commit -m "feat: run desktop task loop"
```

## Task 5: Cursor Event Forwarding And Overlay

**Files:**
- Create: `electron/services/desktopCursorOverlay.js`
- Modify: `electron/main.js`
- Modify: `electron/ipc/chat.js`
- Modify: `electron/services/desktop/adapter.js`
- Modify: `electron/tools/desktopTask.js`
- Create/modify: `electron/__tests__/desktop-cursor-overlay.test.js`
- Modify: `electron/__tests__/chat.test.js`

- [ ] **Step 1: Write focused overlay unit test**

Create `electron/__tests__/desktop-cursor-overlay.test.js`:

```js
import { test, expect, vi } from 'vitest'
import { createCursorOverlayController } from '../services/desktopCursorOverlay'

test('cursor overlay forwards show move click and hide events to window', () => {
  const sent = []
  const win = { isDestroyed: () => false, showInactive: vi.fn(), hide: vi.fn(), webContents: { send: (event, payload) => sent.push([event, payload]) } }
  const controller = createCursorOverlayController({ createWindow: () => win })

  controller.show()
  controller.move({ x: 10, y: 20 })
  controller.click({ x: 10, y: 20 })
  controller.hide()

  expect(win.showInactive).toHaveBeenCalled()
  expect(sent).toContainEqual(['desktop-cursor:move', { x: 10, y: 20 }])
  expect(sent).toContainEqual(['desktop-cursor:click', { x: 10, y: 20 }])
  expect(win.hide).toHaveBeenCalled()
})
```

Run:

```powershell
npm.cmd exec -- vitest run electron/__tests__/desktop-cursor-overlay.test.js
```

Expected: FAIL because service does not exist.

- [ ] **Step 2: Implement overlay controller**

Create `electron/services/desktopCursorOverlay.js` with:

- `createCursorOverlayController({ BrowserWindow, screen, createWindow })`
- `show()`, `hide()`, `move({x,y})`, `click({x,y})`, `handleEvent(event)`
- a `data:text/html` overlay that listens for IPC events and renders a small blue cursor marker plus click pulse
- `setIgnoreMouseEvents(true, { forward: true })`
- `alwaysOnTop`, `transparent`, `frame: false`, `focusable: false`, `skipTaskbar: true`

Export both the factory and a singleton setter/getter:

```js
let activeOverlay = null
function setDesktopCursorOverlay(controller) { activeOverlay = controller }
function getDesktopCursorOverlay() { return activeOverlay }
```

- [ ] **Step 3: Wire overlay in main process**

In `electron/main.js`, after `createWindow()`:

```js
const { createCursorOverlayController, setDesktopCursorOverlay } = require('./services/desktopCursorOverlay')
```

Inside `app.whenReady()`:

```js
setDesktopCursorOverlay(createCursorOverlayController({ BrowserWindow, screen: require('electron').screen }))
```

- [ ] **Step 4: Forward desktop task events**

In `electron/tools/desktopTask.js`, include `metadata.events` in returned result.

In `electron/ipc/chat.js`, when handling `tool_result` for `desktop_task`, inspect `data.result?.metadata?.events || data.result?.events || []` and call:

```js
const overlay = deps.desktopCursorOverlay?.getDesktopCursorOverlay?.()
for (const event of events) overlay?.handleEvent?.(event)
```

Also call `overlay.hide()` when `chat:done`, `chat:error`, or abort clears a desktop task.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm.cmd exec -- vitest run electron/__tests__/desktop-cursor-overlay.test.js electron/__tests__/chat.test.js electron/__tests__/desktop-adapter.test.js
```

Expected: PASS.

Commit:

```powershell
git add electron/services/desktopCursorOverlay.js electron/main.js electron/ipc/chat.js electron/services/desktop/adapter.js electron/tools/desktopTask.js electron/__tests__/desktop-cursor-overlay.test.js electron/__tests__/chat.test.js
git commit -m "feat: show computer use cursor overlay"
```

## Task 6: End-To-End Verification

**Files:** verify only.

- [ ] **Step 1: Run focused suite**

Run:

```powershell
npm.cmd exec -- vitest run client/src/lib/desktopIntent.test.js client/src/components/chat/unified-chat-ui.test.js electron/__tests__/chat.test.js electron/__tests__/agent-loop.test.js electron/__tests__/desktop-cursor-overlay.test.js electron/__tests__/desktop-adapter.test.js server/desktop-use-bridge/__tests__/agentRunner.test.js server/desktop-use-bridge/__tests__/execute.test.js server/desktop-use-bridge/__tests__/driver.test.js server/desktop-use-bridge/__tests__/translator.test.js
```

Expected: PASS.

- [ ] **Step 2: Build renderer**

Run:

```powershell
npm.cmd --prefix client run build
```

Expected: PASS.

- [ ] **Step 3: Start Electron for manual testing**

Run:

```powershell
npm.cmd run electron:dev
```

Expected:

- Electron opens from the current worktree.
- Selecting Computer Use then sending `帮我打开qq` shows a confirmation message with `确定` and `取消`.
- Clicking `确定` starts `desktop_task`.
- The task no longer only says `Desktop task accepted`.
- A cursor overlay appears during click actions when the planner emits a click.
- After the task finishes, sending `为啥不执行` goes to normal chat instead of `desktop_task`.
