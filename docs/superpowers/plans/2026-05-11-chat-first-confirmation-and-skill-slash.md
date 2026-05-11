# Chat-First Confirmation And Skill Slash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace approval/tool/action cards with a chat-first confirmation flow and add `/skill-name task` invocation backed by installed skills.

**Architecture:** Electron owns live high-risk confirmation state per conversation and resolves it from natural chat replies. The renderer keeps a volatile `pendingConfirmation` state, keeps the input usable while blocked, and renders tool progress from stream messages instead of cards. Slash commands become a thin installed-skill picker that sends `forcedSkill` metadata to Electron, where the agent loop runs `load_skill` before the user task.

**Tech Stack:** Electron IPC, React hooks/components, Vitest, existing agent loop/tools/skills registry.

---

## File Structure

- Create `electron/ipc/chatConfirmation.js`: confirmation word parsing, prompt text, pending-operation explanation, missing-skill message.
- Modify `electron/security/toolPolicy.js`: only high risk requires explicit approval; medium and low execute directly.
- Modify `electron/ipc/chat.js`: replace card approval resolver flow with chat confirmation replies, validate `forcedSkill`, send confirmation request/cleared events.
- Modify `electron/services/agentLoop.js`: accept `convId` and `forcedSkill`, force a `load_skill` call before normal model/tool work, pass `convId` into tools.
- Modify `client/src/lib/api.js`: expose confirmation stream callbacks while keeping old IPC helpers unused for compatibility.
- Modify `client/src/lib/commands.js`: replace legacy `/paper`, `/plan`, `/schedule` helpers with installed-skill command parsing.
- Modify `client/src/hooks/useCommand.js`: let the hook consume dynamic installed skill commands.
- Modify `client/src/hooks/useChat.js`: track `pendingConfirmation`, route replies without aborting the active run, clear state on abort/switch.
- Modify `client/src/components/chat/ChatArea.jsx`: pass pending state and forced skill options between input and chat hook.
- Modify `client/src/components/chat/InputBar.jsx`: add compact pending status bar and installed skill slash picker.
- Modify `client/src/components/chat/CommandPalette.jsx`: render skill commands without legacy icons.
- Modify `client/src/components/chat/MessageList.jsx`: stop rendering tool/action cards; keep user/assistant/skill/file/doc/PPT result entries.
- Modify `client/src/components/chat/unified-chat-ui.test.js`: static UI wiring tests for chat-first rendering and skill slash.
- Modify `electron/__tests__/tool-policy.test.js`: medium risk no longer requires approval.
- Modify `electron/__tests__/agent-loop.test.js`: high-risk approval remains, medium direct execution, forced skill ordering.
- Modify `electron/__tests__/chat.test.js`: chat confirmation replies and forced skill validation.
- Create `electron/__tests__/chat-confirmation.test.js`: direct tests for confirmation parsing and prompt builders.

Implementation note for UI tasks: the project instruction in `C:\Users\g\AGENTS.md` requires an app/browser preview before UI edits. Before editing `InputBar.jsx`, `CommandPalette.jsx`, or `MessageList.jsx`, start `npm.cmd run electron:dev`, show the current/proposed UI state to the user, and wait for confirmation.

### Task 1: Confirmation Helpers And Risk Policy

**Files:**
- Create: `electron/ipc/chatConfirmation.js`
- Create: `electron/__tests__/chat-confirmation.test.js`
- Modify: `electron/security/toolPolicy.js`
- Modify: `electron/__tests__/tool-policy.test.js`

- [ ] **Step 1: Write failing tests for natural confirmation parsing**

Create `electron/__tests__/chat-confirmation.test.js`:

```js
import { describe, expect, test } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const {
  CONFIRMATION_TIMEOUT_MS,
  classifyConfirmationReply,
  buildConfirmationPrompt,
  buildPendingExplanation,
  buildMissingSkillMessage
} = require('../ipc/chatConfirmation')

describe('chat confirmation helpers', () => {
  test('classifies natural confirmation words', () => {
    for (const text of ['确认', '可以', '同意', '继续', ' 可以 ', '继续。']) {
      expect(classifyConfirmationReply(text)).toBe('confirm')
    }
  })

  test('classifies natural rejection words', () => {
    for (const text of ['取消', '拒绝', '不行', '不要', ' 不要。']) {
      expect(classifyConfirmationReply(text)).toBe('reject')
    }
  })

  test('treats questions and unrelated text as clarification', () => {
    expect(classifyConfirmationReply('这会删除哪个文件？')).toBe('clarification')
    expect(classifyConfirmationReply('先解释一下风险')).toBe('clarification')
    expect(classifyConfirmationReply('hello')).toBe('clarification')
  })

  test('builds a chat prompt for high-risk confirmation', () => {
    const text = buildConfirmationPrompt({
      call: { id: 'call-1', name: 'run_shell_command', args: { command: 'npm install react' } },
      decision: { risk: 'high', reason: 'installs packages' },
      retry: { attempt: 2, previousError: { code: 'BROWSER_TASK_INCOMPLETE', message: 'blank page' } }
    })

    expect(text).toContain('run_shell_command')
    expect(text).toContain('installs packages')
    expect(text).toContain('npm install react')
    expect(text).toContain('确认 / 可以 / 同意 / 继续')
    expect(text).toContain('取消 / 拒绝 / 不行 / 不要')
    expect(text).toContain('previous attempt failed')
  })

  test('builds a clarification reply without resolving the pending operation', () => {
    const text = buildPendingExplanation({
      call: { name: 'delete_path', args: { path: 'C:/Users/g/Desktop/tmp.txt' } },
      decision: { reason: 'deletes a file' }
    })

    expect(text).toContain('delete_path')
    expect(text).toContain('deletes a file')
    expect(text).toContain('确认 / 可以 / 同意 / 继续')
    expect(text).toContain('取消 / 拒绝 / 不行 / 不要')
  })

  test('builds a missing skill message with installed suggestions', () => {
    const text = buildMissingSkillMessage('missing-skill', [
      { name: 'superpowers', description: 'workflow' },
      { name: 'frontend-design', description: 'ui' }
    ])

    expect(text).toContain('missing-skill')
    expect(text).toContain('/superpowers')
    expect(text).toContain('/frontend-design')
  })

  test('uses a finite confirmation timeout', () => {
    expect(CONFIRMATION_TIMEOUT_MS).toBe(5 * 60 * 1000)
  })
})
```

- [ ] **Step 2: Write failing policy expectations for medium risk**

Change these expectations in `electron/__tests__/tool-policy.test.js`:

```js
test('write_file to allowed root is medium risk without approval', () => {
  const r = evaluateToolCall('write_file', { path: path.join(home, 'Desktop', 'hello.txt'), content: 'hi' }, ctx)
  expect(r.risk).toBe('medium')
  expect(r.allowed).toBe(true)
  expect(r.requiresApproval).toBe(false)
})

test('generate_docx is medium risk without approval', () => {
  const r = evaluateToolCall('generate_docx', { outline: [{ heading: 'Title', content: 'text' }] }, ctx)
  expect(r.risk).toBe('medium')
  expect(r.requiresApproval).toBe(false)
})

test('generate_pptx is medium risk without approval', () => {
  const r = evaluateToolCall('generate_pptx', { slides: [{ title: 'Title', content: 'text' }] }, ctx)
  expect(r.risk).toBe('medium')
  expect(r.requiresApproval).toBe(false)
})

test('code_execute benign is medium risk without approval', () => {
  const r = evaluateToolCall('code_execute', { language: 'python', code: 'print("hello")' }, ctx)
  expect(r.risk).toBe('medium')
  expect(r.requiresApproval).toBe(false)
})
```

Keep the high-risk tests expecting approval:

```js
test('write_file with overwrite is high risk and requires approval', () => {
  const r = evaluateToolCall('write_file', { path: path.join(home, 'Desktop', 'hello.txt'), content: 'hi', overwrite: true }, ctx)
  expect(r.risk).toBe('high')
  expect(r.requiresApproval).toBe(true)
})
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```powershell
npm.cmd exec vitest run electron/__tests__/chat-confirmation.test.js electron/__tests__/tool-policy.test.js
```

Expected: `chat-confirmation.test.js` fails because `../ipc/chatConfirmation` does not exist. Updated medium-risk policy tests fail because `requiresApproval` is still true for medium.

- [ ] **Step 4: Implement confirmation helpers**

Create `electron/ipc/chatConfirmation.js`:

```js
const CONFIRM_WORDS = new Set(['确认', '可以', '同意', '继续'])
const REJECT_WORDS = new Set(['取消', '拒绝', '不行', '不要'])
const CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000

function normalizeReply(text) {
  return String(text || '')
    .trim()
    .replace(/[。！？!?.\s]+$/g, '')
    .toLowerCase()
}

function classifyConfirmationReply(text) {
  const normalized = normalizeReply(text)
  if (CONFIRM_WORDS.has(normalized)) return 'confirm'
  if (REJECT_WORDS.has(normalized)) return 'reject'
  return 'clarification'
}

function formatArgs(args) {
  if (!args || typeof args !== 'object') return ''
  try {
    return JSON.stringify(args, null, 2).slice(0, 1200)
  } catch {
    return String(args).slice(0, 1200)
  }
}

function buildConfirmationPrompt({ call, decision, retry }) {
  const lines = [
    `需要确认高风险操作: ${call.name}`,
    `风险原因: ${decision.reason || 'high risk operation'}`,
  ]
  const args = formatArgs(call.args)
  if (args) lines.push(`参数:\n${args}`)
  if (retry?.previousError) {
    lines.push(`previous attempt failed: ${retry.previousError.code}: ${retry.previousError.message}`)
  }
  lines.push('回复“确认 / 可以 / 同意 / 继续”执行。')
  lines.push('回复“取消 / 拒绝 / 不行 / 不要”取消。')
  return `${lines.join('\n')}\n`
}

function buildPendingExplanation(pending) {
  const lines = [
    `当前仍在等待确认: ${pending.call.name}`,
    `风险原因: ${pending.decision.reason || 'high risk operation'}`,
  ]
  const args = formatArgs(pending.call.args)
  if (args) lines.push(`参数:\n${args}`)
  lines.push('请回复“确认 / 可以 / 同意 / 继续”执行，或回复“取消 / 拒绝 / 不行 / 不要”取消。')
  return lines.join('\n')
}

function buildNoPendingMessage() {
  return '当前没有等待确认的高风险操作。'
}

function buildMissingSkillMessage(name, skills = []) {
  const suggestions = skills.slice(0, 8).map((skill) => `/${skill.name} - ${skill.description}`).join('\n')
  return suggestions
    ? `未安装或未启用技能: ${name}\n可用技能:\n${suggestions}`
    : `未安装或未启用技能: ${name}\n当前没有可用技能。`
}

module.exports = {
  CONFIRMATION_TIMEOUT_MS,
  classifyConfirmationReply,
  buildConfirmationPrompt,
  buildPendingExplanation,
  buildNoPendingMessage,
  buildMissingSkillMessage
}
```

- [ ] **Step 5: Change policy approval rule**

In `electron/security/toolPolicy.js`, change `evaluateToolCallWithMeta` to:

```js
function evaluateToolCallWithMeta(name, args, ctx) {
  const classification = evaluateToolCall(name, args, ctx)
  const risk = classification.risk
  return {
    risk,
    reason: classification.reason,
    allowed: risk !== RISK_LEVELS.BLOCKED,
    requiresApproval: risk === RISK_LEVELS.HIGH
  }
}
```

- [ ] **Step 6: Run tests to verify pass**

Run:

```powershell
npm.cmd exec vitest run electron/__tests__/chat-confirmation.test.js electron/__tests__/tool-policy.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git -c safe.directory=C:/Users/g/Desktop/sinan -C 'C:\Users\g\Desktop\sinan' add electron/ipc/chatConfirmation.js electron/__tests__/chat-confirmation.test.js electron/security/toolPolicy.js electron/__tests__/tool-policy.test.js
git -c safe.directory=C:/Users/g/Desktop/sinan -C 'C:\Users\g\Desktop\sinan' commit -m "feat: add chat confirmation policy"
```

### Task 2: Electron Chat Confirmation Flow

**Files:**
- Modify: `electron/ipc/chat.js`
- Modify: `electron/__tests__/chat.test.js`

- [ ] **Step 1: Replace old approval IPC test with chat reply tests**

In `electron/__tests__/chat.test.js`, replace `chat:send waits for inline tool approval over chat IPC` with:

```js
test('chat:send waits for high-risk confirmation through a natural chat reply', async () => {
  const ipcMain = createIpcMain()
  const send = vi.fn()
  const call = { id: 'call-approval', name: 'run_shell_command', args: { command: 'npm install' } }
  const decision = { risk: 'high', reason: 'installs packages' }
  let approvedValue
  const runTurn = vi.fn(async ({ onEvent, requestApproval }) => {
    onEvent('assistant_message', { content: '', toolCalls: [call] })
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
    convId: 'conv-1',
    messages: [{ role: 'user', content: 'install deps' }]
  })
  await Promise.resolve()

  expect(send).toHaveBeenCalledWith('chat:confirmation-request', {
    convId: 'conv-1',
    pending: expect.objectContaining({
      callId: call.id,
      toolName: 'run_shell_command',
      risk: 'high',
      reason: 'installs packages'
    })
  })
  expect(send).toHaveBeenCalledWith('chat:delta', {
    convId: 'conv-1',
    text: expect.stringContaining('需要确认高风险操作: run_shell_command')
  })
  expect(approvedValue).toBeUndefined()

  const reply = await ipcMain.handlers.get('chat:send')({ sender: { send } }, {
    convId: 'conv-1',
    message: '可以',
    confirmationReply: true
  })
  expect(reply).toEqual({ ok: true, status: 'confirmed' })

  await pending
  expect(approvedValue).toBe(true)
  expect(send).toHaveBeenCalledWith('chat:confirmation-cleared', { convId: 'conv-1', reason: 'confirmed' })
  expect(send).toHaveBeenCalledWith('chat:delta', { convId: 'conv-1', text: 'approved' })
  expect(send).toHaveBeenCalledWith('chat:done', { convId: 'conv-1' })
})
```

Add rejection and clarification tests:

```js
test('chat confirmation rejection resolves the pending tool as denied', async () => {
  const ipcMain = createIpcMain()
  const send = vi.fn()
  const call = { id: 'call-deny', name: 'delete_path', args: { path: 'C:/Users/g/Desktop/tmp.txt' } }
  const decision = { risk: 'high', reason: 'deletes a file' }
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

  const pending = ipcMain.handlers.get('chat:send')({ sender: { send } }, { convId: 'conv-2', messages: [{ role: 'user', content: 'delete tmp' }] })
  await Promise.resolve()
  const reply = await ipcMain.handlers.get('chat:send')({ sender: { send } }, { convId: 'conv-2', message: '不要', confirmationReply: true })

  expect(reply).toEqual({ ok: true, status: 'rejected' })
  await pending
  expect(approvedValue).toBe(false)
  expect(send).toHaveBeenCalledWith('chat:confirmation-cleared', { convId: 'conv-2', reason: 'rejected' })
})

test('chat confirmation clarification leaves the operation pending', async () => {
  const ipcMain = createIpcMain()
  const send = vi.fn()
  const call = { id: 'call-question', name: 'delete_path', args: { path: 'C:/Users/g/Desktop/tmp.txt' } }
  const decision = { risk: 'high', reason: 'deletes a file' }
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

  const pending = ipcMain.handlers.get('chat:send')({ sender: { send } }, { convId: 'conv-3', messages: [{ role: 'user', content: 'delete tmp' }] })
  await Promise.resolve()
  const reply = await ipcMain.handlers.get('chat:send')({ sender: { send } }, { convId: 'conv-3', message: '这会删除哪个文件？', confirmationReply: true })

  expect(reply.ok).toBe(true)
  expect(reply.status).toBe('clarification')
  expect(reply.assistantText).toContain('delete_path')
  expect(approvedValue).toBeUndefined()

  await ipcMain.handlers.get('chat:send')({ sender: { send } }, { convId: 'conv-3', message: '取消', confirmationReply: true })
  await pending
  expect(approvedValue).toBe(false)
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm.cmd exec vitest run electron/__tests__/chat.test.js
```

Expected: FAIL because `chat:send` does not support `confirmationReply`, does not emit `chat:confirmation-request`, and still expects `chat:approve-tool`.

- [ ] **Step 3: Implement pending confirmation state in `chat.js`**

Add imports:

```js
const {
  CONFIRMATION_TIMEOUT_MS,
  classifyConfirmationReply,
  buildConfirmationPrompt,
  buildPendingExplanation,
  buildNoPendingMessage,
  buildMissingSkillMessage
} = require('./chatConfirmation')
```

Replace the old `pendingApprovals` helpers with one pending confirmation per conversation:

```js
const pendingConfirmations = new Map()
const activeControllers = new Map()

function clearPendingConfirmation(convId, reason = 'cleared') {
  const pending = pendingConfirmations.get(convId)
  if (!pending) return false
  clearTimeout(pending.timer)
  pendingConfirmations.delete(convId)
  pending.send?.('chat:confirmation-cleared', { reason })
  pending.resolve(false)
  return true
}

function settlePendingConfirmation(convId, approved, reason) {
  const pending = pendingConfirmations.get(convId)
  if (!pending) return false
  clearTimeout(pending.timer)
  pendingConfirmations.delete(convId)
  pending.send?.('chat:confirmation-cleared', { reason })
  pending.resolve(Boolean(approved))
  return true
}

async function handleConfirmationReply(evt, payload = {}) {
  const { convId, message = '' } = payload
  const pending = pendingConfirmations.get(convId)
  if (!pending) return { ok: true, status: 'missing', assistantText: buildNoPendingMessage() }

  const classification = classifyConfirmationReply(message)
  if (classification === 'confirm') {
    settlePendingConfirmation(convId, true, 'confirmed')
    return { ok: true, status: 'confirmed' }
  }
  if (classification === 'reject') {
    settlePendingConfirmation(convId, false, 'rejected')
    return { ok: true, status: 'rejected' }
  }
  return { ok: true, status: 'clarification', assistantText: buildPendingExplanation(pending) }
}
```

At the start of `handleChatSend`, before creating a new `AbortController`, add:

```js
if (payload.confirmationReply) {
  return handleConfirmationReply(evt, payload)
}
```

Change `requestApproval` inside `handleChatSend` to:

```js
requestApproval: async ({ call, decision, retry }) => {
  const prompt = buildConfirmationPrompt({ call, decision, retry })
  sendDelta(prompt)

  const approved = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pendingConfirmations.get(convId)?.call.id === call.id) {
        pendingConfirmations.delete(convId)
        send('chat:confirmation-cleared', { reason: 'timeout' })
        sendDelta('\n确认等待超时，已取消该高风险操作。\n')
        resolve(false)
      }
    }, CONFIRMATION_TIMEOUT_MS)

    const pending = { call, decision, retry, resolve, timer, send }
    pendingConfirmations.set(convId, pending)
    send('chat:confirmation-request', {
      pending: {
        callId: call.id,
        toolName: call.name,
        args: call.args,
        risk: decision.risk,
        reason: decision.reason,
        retry
      }
    })
  })

  if (!approved) {
    send('chat:tool-error', { callId: call.id, error: { code: 'USER_DENIED', message: 'User denied tool execution.' } })
  }
  return approved
}
```

In `finally`, replace `clearPendingApprovals(convId)` with:

```js
clearPendingConfirmation(convId, 'run-ended')
```

In `chat:abort`, replace old clearing with:

```js
clearPendingConfirmation(payload.convId, 'aborted')
```

Keep `chat:approve-tool` registered as a no-op compatibility path:

```js
ipcMain.handle('chat:approve-tool', async () => ({ ok: false, error: { code: 'DEPRECATED', message: 'Use chat confirmation replies.' } }))
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```powershell
npm.cmd exec vitest run electron/__tests__/chat.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git -c safe.directory=C:/Users/g/Desktop/sinan -C 'C:\Users\g\Desktop\sinan' add electron/ipc/chat.js electron/__tests__/chat.test.js
git -c safe.directory=C:/Users/g/Desktop/sinan -C 'C:\Users\g\Desktop\sinan' commit -m "feat: confirm high risk tools in chat"
```

### Task 3: Forced Skill Loading In Electron

**Files:**
- Modify: `electron/services/agentLoop.js`
- Modify: `electron/ipc/chat.js`
- Modify: `electron/__tests__/agent-loop.test.js`
- Modify: `electron/__tests__/chat.test.js`

- [ ] **Step 1: Write failing agent loop tests for forced skills**

Add to `electron/__tests__/agent-loop.test.js`:

```js
test('forcedSkill loads the skill before the normal model turn', async () => {
  const calls = []
  const deepseek = {
    chat: vi.fn(async ({ messages }) => {
      calls.push(['chat', messages.map((message) => message.role)])
      return { content: 'Used skill.', assistant_message: { role: 'assistant', content: 'Used skill.' }, tool_calls: [] }
    })
  }
  const tools = {
    execute: vi.fn(async (name, args, context) => {
      calls.push(['tool', name, args, context.convId])
      return { name: args.name, content: '# Skill body' }
    }),
    getAgentLoopToolSchemas: vi.fn(() => [])
  }
  const policy = mockPolicy({ load_skill: { risk: 'low', reason: 'skill', allowed: true, requiresApproval: false } })

  const result = await runTurn(
    { convId: 'conv-skill', messages: [{ role: 'user', content: 'write tests' }], forcedSkill: 'superpowers' },
    { deepseek, tools, policy }
  )

  expect(calls[0]).toEqual(['tool', 'load_skill', { name: 'superpowers' }, 'conv-skill'])
  expect(calls[1][0]).toBe('chat')
  expect(result.finalText).toBe('Used skill.')
})

test('forcedSkill and browser forceTool run in skill then browser order', async () => {
  const order = []
  const deepseek = mockDeepseek([
    { content: 'Browser summary', assistant_message: { role: 'assistant', content: 'Browser summary' }, tool_calls: [] }
  ])
  const tools = {
    execute: vi.fn(async (name, args) => {
      order.push(name)
      return name === 'load_skill' ? { name: args.name, content: '# Browser skill' } : { ok: true, summary: 'Example Domain' }
    }),
    getAgentLoopToolSchemas: vi.fn(() => [])
  }
  const policy = mockPolicy({
    load_skill: { risk: 'low', reason: 'skill', allowed: true, requiresApproval: false },
    browser_task: { risk: 'medium', reason: 'browser', allowed: true, requiresApproval: false }
  })

  await runTurn(
    {
      convId: 'conv-browser-skill',
      messages: [{ role: 'user', content: 'open https://example.com' }],
      forcedSkill: 'browser-skill',
      forceTool: 'browser_task'
    },
    { deepseek, tools, policy }
  )

  expect(order).toEqual(['load_skill', 'browser_task'])
})
```

Update the existing medium approval test in `electron/__tests__/agent-loop.test.js`:

```js
test('medium-risk tool executes directly without approval', async () => {
  const deepseek = mockDeepseek([
    {
      content: null,
      assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'run_shell_command', arguments: '{"command":"echo hi"}' } }] },
      tool_calls: [{ id: 'c1', name: 'run_shell_command', args: { command: 'echo hi' }, raw: {} }]
    },
    { content: 'Command ran successfully.', assistant_message: { role: 'assistant', content: 'Command ran successfully.' }, tool_calls: [] }
  ])
  const tools = mockTools({ run_shell_command: 'hi' })
  const policy = mockPolicy({ run_shell_command: { risk: 'medium', reason: 'shell', allowed: true, requiresApproval: false } })
  const requestApproval = vi.fn(async () => true)

  await runTurn(
    { messages: [{ role: 'user', content: 'run echo' }], requestApproval },
    { deepseek, tools, policy }
  )

  expect(requestApproval).not.toHaveBeenCalled()
  expect(tools.execute).toHaveBeenCalledWith('run_shell_command', { command: 'echo hi' }, expect.objectContaining({ skipInternalConfirm: true }))
})
```

- [ ] **Step 2: Write failing chat tests for forced skill validation**

Add to `electron/__tests__/chat.test.js`:

```js
test('chat:send validates forcedSkill before running the agent loop', async () => {
  const ipcMain = createIpcMain()
  const send = vi.fn()
  const runTurn = vi.fn()
  const register = createRegister({
    storeRef: { getConfig: () => ({ permissionMode: 'full' }) },
    runTurn,
    userRules: { buildSystemPromptSection: () => '' },
    skillRegistry: {
      listSkills: () => [{ name: 'superpowers', description: 'workflow' }],
      buildSkillIndex: () => 'skills',
      findSkill: (name) => (name === 'superpowers' ? { name, description: 'workflow' } : null)
    }
  })
  register(ipcMain)

  const result = await ipcMain.handlers.get('chat:send')({ sender: { send } }, {
    convId: 'conv-missing-skill',
    forcedSkill: 'missing',
    messages: [{ role: 'user', content: 'do work' }]
  })

  expect(result).toEqual({ ok: true })
  expect(runTurn).not.toHaveBeenCalled()
  expect(send).toHaveBeenCalledWith('chat:delta', { convId: 'conv-missing-skill', text: expect.stringContaining('missing') })
  expect(send).toHaveBeenCalledWith('chat:delta', { convId: 'conv-missing-skill', text: expect.stringContaining('/superpowers') })
  expect(send).toHaveBeenCalledWith('chat:done', { convId: 'conv-missing-skill' })
})

test('chat:send forwards valid forcedSkill and convId to runTurn', async () => {
  const ipcMain = createIpcMain()
  const send = vi.fn()
  const runTurn = vi.fn(async ({ onEvent }) => {
    onEvent('assistant_message', { content: 'done', toolCalls: [] })
    return { finalText: 'done', history: [] }
  })
  const register = createRegister({
    storeRef: { getConfig: () => ({ permissionMode: 'full' }) },
    runTurn,
    userRules: { buildSystemPromptSection: () => '' },
    skillRegistry: {
      listSkills: () => [{ name: 'superpowers', description: 'workflow' }],
      buildSkillIndex: () => 'skills',
      findSkill: (name) => (name === 'superpowers' ? { name, description: 'workflow' } : null)
    }
  })
  register(ipcMain)

  await ipcMain.handlers.get('chat:send')({ sender: { send } }, {
    convId: 'conv-skill-ok',
    forcedSkill: 'superpowers',
    messages: [{ role: 'user', content: 'do work' }]
  })

  expect(runTurn).toHaveBeenCalledWith(expect.objectContaining({
    convId: 'conv-skill-ok',
    forcedSkill: 'superpowers'
  }))
})
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```powershell
npm.cmd exec vitest run electron/__tests__/agent-loop.test.js electron/__tests__/chat.test.js
```

Expected: FAIL because `runTurn` has no `forcedSkill` support and `chat:send` does not validate or forward `forcedSkill`.

- [ ] **Step 4: Implement forced skill tool call in `agentLoop.js`**

Add:

```js
function createForcedSkillCall(forcedSkill) {
  if (!forcedSkill) return null
  const args = { name: forcedSkill }
  const id = `forced-skill-${forcedSkill}-${Date.now()}`
  return {
    id,
    name: 'load_skill',
    args,
    raw: {
      id,
      type: 'function',
      function: {
        name: 'load_skill',
        arguments: JSON.stringify(args)
      }
    }
  }
}
```

Change the `runTurn` signature:

```js
async function runTurn({ messages, model, signal, onEvent, onStreamEvent, requestApproval, forceTool, forcedSkill, convId }, deps = {}) {
```

Pass `convId` into every tool execution:

```js
const result = await tools.execute(call.name, call.args, { signal: ctl.signal, skipInternalConfirm: true, convId })
```

Before the existing forced browser tool block, run the forced skill:

```js
const forcedSkillCall = createForcedSkillCall(forcedSkill)
if (forcedSkillCall) {
  emitStream('reasoning_summary', {
    text: `Loading skill ${forcedSkill} before continuing.`,
  })
  history.push({ role: 'assistant', content: null, tool_calls: [forcedSkillCall.raw] })
  onEvent?.('assistant_message', { content: '', toolCalls: [forcedSkillCall] })
  const forcedSkillResult = await processToolCall(forcedSkillCall)
  if (forcedSkillResult) return forcedSkillResult
}
```

Keep the existing browser forced tool block after this skill block.

- [ ] **Step 5: Implement `forcedSkill` validation in `chat.js`**

At the top of `handleChatSend`, destructure `forcedSkill`:

```js
const { convId, messages = [], model, pluginMode, forcedSkill } = payload
```

After `sendDelta` is defined and before `runTurn`, add:

```js
if (forcedSkill && !deps.skillRegistry.findSkill(forcedSkill)) {
  sendDelta(buildMissingSkillMessage(forcedSkill, deps.skillRegistry.listSkills()))
  send('chat:done', {})
  return { ok: true }
}
```

Forward `forcedSkill` and `convId` into `runTurn`:

```js
const result = await deps.runTurn({
  messages: agentMessages,
  model,
  forceTool,
  forcedSkill,
  convId,
  signal: ctl.signal,
  onStreamEvent: streamEvent => {
    send('chat:stream', { event: streamEvent })
  },
  onEvent,
  requestApproval
})
```

- [ ] **Step 6: Run tests to verify pass**

Run:

```powershell
npm.cmd exec vitest run electron/__tests__/agent-loop.test.js electron/__tests__/chat.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git -c safe.directory=C:/Users/g/Desktop/sinan -C 'C:\Users\g\Desktop\sinan' add electron/services/agentLoop.js electron/ipc/chat.js electron/__tests__/agent-loop.test.js electron/__tests__/chat.test.js
git -c safe.directory=C:/Users/g/Desktop/sinan -C 'C:\Users\g\Desktop\sinan' commit -m "feat: force slash-selected skills"
```

### Task 4: Renderer Command Parsing For Installed Skills

**Files:**
- Modify: `client/src/lib/commands.js`
- Modify: `client/src/hooks/useCommand.js`
- Modify: `client/src/components/chat/CommandPalette.jsx`
- Modify: `client/src/components/chat/unified-chat-ui.test.js`

- [ ] **Step 1: Write failing static tests for skill slash commands**

Append to `client/src/components/chat/unified-chat-ui.test.js`:

```js
test('slash commands are backed by installed skills instead of legacy cards', () => {
  const commands = readProjectFile('client/src/lib/commands.js')
  const useCommand = readProjectFile('client/src/hooks/useCommand.js')
  const palette = readProjectFile('client/src/components/chat/CommandPalette.jsx')

  expect(commands).toContain('parseSkillCommandLine')
  expect(commands).toContain('matchSkillCommands')
  expect(commands).not.toContain("id: 'paper'")
  expect(commands).not.toContain("id: 'plan'")
  expect(commands).not.toContain("id: 'schedule'")
  expect(commands).not.toContain("cardType: 'paper'")
  expect(useCommand).toContain('skills = []')
  expect(useCommand).toContain('matchSkillCommands(text, skills)')
  expect(palette).toContain('Sparkles')
  expect(palette).not.toContain('const Icon = command.icon')
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm.cmd exec vitest run client/src/components/chat/unified-chat-ui.test.js
```

Expected: FAIL because `commands.js` still exports legacy card commands and `useCommand` has no dynamic skill input.

- [ ] **Step 3: Replace `commands.js` with skill command helpers**

Replace `client/src/lib/commands.js` with:

```js
export function buildSkillCommands(skills = []) {
  return skills
    .filter((skill) => skill?.name)
    .map((skill) => ({
      id: skill.name,
      label: `/${skill.name}`,
      description: skill.description || 'Installed skill',
      skill
    }))
}

export function matchSkillCommands(input, skills = []) {
  if (!input.startsWith('/')) return []
  const query = input.slice(1).trim().toLowerCase()
  return buildSkillCommands(skills).filter((command) => command.id.toLowerCase().startsWith(query))
}

export function parseSkillCommandLine(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed.startsWith('/')) return null
  const match = trimmed.match(/^\/([^\s/]+)\s+([\s\S]+)$/)
  if (!match) return null
  const skillName = match[1].trim()
  const message = match[2].trim()
  if (!skillName || !message) return null
  return { forcedSkill: skillName, message }
}
```

- [ ] **Step 4: Update `useCommand.js` to accept installed skills**

Change the import:

```js
import { matchSkillCommands } from '../lib/commands.js'
```

Change the hook signature and update function:

```js
export function useCommand(skills = []) {
  const [active, setActive] = useState(false)
  const [matches, setMatches] = useState([])
  const [index, setIndex] = useState(0)

  const update = useCallback((text) => {
    if (text.startsWith('/')) {
      const nextMatches = matchSkillCommands(text, skills)
      setActive(nextMatches.length > 0)
      setMatches(nextMatches)
      setIndex(0)
      return
    }

    setActive(false)
    setMatches([])
    setIndex(0)
  }, [skills])
```

Keep the rest of the hook behavior.

- [ ] **Step 5: Update `CommandPalette.jsx` to render skill rows**

Change imports:

```js
import { Sparkles } from 'lucide-react'
```

Render each command with a stable icon:

```jsx
<button
  key={command.id}
  type="button"
  onMouseEnter={() => onHover?.(currentIndex)}
  onClick={() => onSelect(command)}
  className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left ${selected ? 'bg-[color:var(--bg-tertiary)]' : 'hover:bg-[color:var(--bg-tertiary)]'}`}
>
  <Sparkles size={16} className="text-[color:var(--accent)]" />
  <div className="flex-1 min-w-0">
    <div className="font-medium">{command.label}</div>
    <div className="text-xs text-[color:var(--text-muted)] truncate">{command.description}</div>
  </div>
</button>
```

- [ ] **Step 6: Run test to verify pass**

Run:

```powershell
npm.cmd exec vitest run client/src/components/chat/unified-chat-ui.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git -c safe.directory=C:/Users/g/Desktop/sinan -C 'C:\Users\g\Desktop\sinan' add client/src/lib/commands.js client/src/hooks/useCommand.js client/src/components/chat/CommandPalette.jsx client/src/components/chat/unified-chat-ui.test.js
git -c safe.directory=C:/Users/g/Desktop/sinan -C 'C:\Users\g\Desktop\sinan' commit -m "feat: back slash commands with skills"
```

### Task 5: Renderer Pending Confirmation State And Slash Submission

**Files:**
- Modify: `client/src/lib/api.js`
- Modify: `client/src/hooks/useChat.js`
- Modify: `client/src/components/chat/ChatArea.jsx`
- Modify: `client/src/components/chat/InputBar.jsx`
- Modify: `client/src/components/chat/unified-chat-ui.test.js`

- [ ] **Step 1: Preview checkpoint before UI edits**

Run:

```powershell
npm.cmd run electron:dev
```

Expected: the app opens. Show the current chat input area and explain the planned compact pending confirmation status bar plus slash skill menu. Wait for the user to confirm before editing `InputBar.jsx`, `ChatArea.jsx`, or `MessageList.jsx`.

- [ ] **Step 2: Write failing static tests for pending confirmation UI wiring**

Append to `client/src/components/chat/unified-chat-ui.test.js`:

```js
test('useChat routes confirmation replies through chat without approval card IPC', () => {
  const useChat = readProjectFile('client/src/hooks/useChat.js')
  const api = readProjectFile('client/src/lib/api.js')

  expect(useChat).toContain('pendingConfirmation')
  expect(useChat).toContain('confirmationReply: true')
  expect(useChat).toContain('onConfirmationRequest')
  expect(useChat).toContain('onConfirmationCleared')
  expect(useChat).toContain('setPendingConfirmation(null)')
  expect(useChat).not.toContain('approveChatTool')
  expect(useChat).not.toContain('denyChatTool')
  expect(api).toContain('onConfirmationRequest')
  expect(api).toContain("listen('chat:confirmation-request'")
  expect(api).toContain("listen('chat:confirmation-cleared'")
})

test('InputBar exposes pending confirmation status and installed skill slash picker', () => {
  const input = readProjectFile('client/src/components/chat/InputBar.jsx')
  const chatArea = readProjectFile('client/src/components/chat/ChatArea.jsx')

  expect(input).toContain('pendingConfirmation')
  expect(input).toContain('CommandPalette')
  expect(input).toContain('useCommand(skills)')
  expect(input).toContain('Waiting for confirmation')
  expect(input).toContain('listSkills')
  expect(chatArea).toContain('pendingConfirmation')
  expect(chatArea).toContain('parseSkillCommandLine')
  expect(chatArea).toContain('forcedSkill')
})
```

- [ ] **Step 3: Run test to verify failure**

Run:

```powershell
npm.cmd exec vitest run client/src/components/chat/unified-chat-ui.test.js
```

Expected: FAIL because the renderer still uses approval callbacks and has no pending status or slash skill parsing.

- [ ] **Step 4: Extend stream API events**

In `client/src/lib/api.js`, change the stream option destructuring:

```js
const {
  channel,
  payload,
  onDelta,
  onDone,
  onError,
  onToolStart,
  onToolLog,
  onToolResult,
  onToolError,
  onSkillLoaded,
  onActionPlan,
  onActionUpdate,
  onConfirmationRequest,
  onConfirmationCleared
} = options
```

Add listeners:

```js
listen('chat:confirmation-request', (data) => onConfirmationRequest?.(data))
listen('chat:confirmation-cleared', (data) => onConfirmationCleared?.(data))
```

- [ ] **Step 5: Update `useChat.js` state and reply routing**

Change imports to remove approval tool helpers:

```js
import { abortChat, api, approveAction, cancelAction, denyAction } from '../lib/api.js'
```

Add state:

```js
const [pendingConfirmation, setPendingConfirmation] = useState(null)
```

In conversation load/reset, clear pending state and abort the previous backend run:

```js
const previousConvId = conversationIdRef.current
if (previousConvId && previousConvId !== conversationId) {
  abortChat(previousConvId).catch(() => {})
}
setPendingConfirmation(null)
```

At the start of `sendUserMessage`, before aborting any active stream, handle pending replies:

```js
if (pendingConfirmation) {
  const userMessage = { id: uid(), role: 'user', content: text }
  dispatch({ type: 'ADD', msg: userMessage })

  api.invoke('chat:send', { convId, message: text, confirmationReply: true }).then((result) => {
    if (result.status === 'confirmed' || result.status === 'rejected' || result.status === 'missing') {
      setPendingConfirmation(null)
    }
    if (result.assistantText) {
      dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', content: result.assistantText } })
      saveConversation(convId, [...state.messages, userMessage, { role: 'assistant', content: result.assistantText }])
    }
  }).catch((error) => {
    dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', content: `[确认失败] ${error.message}` } })
  })
  return
}
```

When starting a normal turn, include forced skill payload:

```js
payload: {
  convId,
  messages: history,
  message: text,
  model,
  pluginMode: options.pluginMode || null,
  forcedSkill: options.forcedSkill || null
},
```

Add stream callbacks:

```js
onConfirmationRequest: (event) => {
  setPendingConfirmation(event.pending)
},
onConfirmationCleared: () => {
  setPendingConfirmation(null)
},
```

Remove `handleApproveTool` and `handleDenyTool` from the returned object. Return `pendingConfirmation`.

Update `handleAbort` to clear local pending state:

```js
setPendingConfirmation(null)
```

- [ ] **Step 6: Update `ChatArea.jsx` for slash parsing**

Import parser:

```js
import { parseSkillCommandLine } from '../../lib/commands.js'
```

Use returned pending state:

```js
const {
  messages,
  streaming,
  agentRunning,
  pendingConfirmation,
  sendUserMessage,
  handleAbort,
  handleApproveAction,
  handleDenyAction,
  handleCancelAction,
  updateCard,
  addFileCard
} = useChat(conversationId)
```

Change `handleSend`:

```js
function handleSend(text) {
  const parsed = parseSkillCommandLine(text)
  const messageText = parsed?.message || text
  sendUserMessage(messageText, pluginMode === 'browser' ? 'browser-use' : selectedModel, {
    pluginMode,
    forcedSkill: parsed?.forcedSkill || null
  })
}
```

Pass pending state into `InputBar`:

```jsx
<InputBar
  onSend={handleSend}
  disabled={!pendingConfirmation && (streaming || agentRunning)}
  agentRunning={agentRunning}
  pendingConfirmation={pendingConfirmation}
  onCancel={handleAbort}
  selectedModel={selectedModel}
  onModelChange={setSelectedModel}
  pluginMode={pluginMode}
  onPluginModeChange={setPluginMode}
/>
```

Remove `onApproveTool` and `onDenyTool` props from `MessageList`.

- [ ] **Step 7: Update `InputBar.jsx` for pending status and skills**

Add imports:

```js
import { useCommand } from '../../hooks/useCommand.js'
import { listSkills } from '../../lib/api.js'
import CommandPalette from './CommandPalette.jsx'
```

Change signature:

```js
export default function InputBar({ onSend, disabled, agentRunning, pendingConfirmation, onCancel, selectedModel, onModelChange, pluginMode, onPluginModeChange }) {
```

Add state and command hook:

```js
const [skills, setSkills] = useState([])
const command = useCommand(skills)
```

Load skills:

```js
useEffect(() => {
  let cancelled = false
  listSkills()
    .then((result) => {
      if (!cancelled) setSkills(result.skills || [])
    })
    .catch(() => {
      if (!cancelled) setSkills([])
    })
  return () => {
    cancelled = true
  }
}, [])
```

Update text changes:

```jsx
onChange={(event) => {
  const value = event.target.value
  setText(value)
  command.update(value)
}}
```

Add command key handling before Enter submit:

```js
function handleKey(event) {
  if (command.handleKeyDown(event, (item) => {
    setText(`${item.label} `)
  })) return

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSubmit(event)
  }
}
```

Render a compact status bar above the input container:

```jsx
{pendingConfirmation && (
  <div className="mb-2 flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
    <span className="truncate">Waiting for confirmation: {pendingConfirmation.toolName}</span>
    <span className="shrink-0 text-amber-700">确认 / 可以 / 同意 / 继续</span>
  </div>
)}
```

Render `CommandPalette` positioned above the input:

```jsx
<div className="relative flex-1">
  <CommandPalette
    matches={command.matches}
    index={command.index}
    onHover={command.setIndex}
    onSelect={(item) => {
      setText(`${item.label} `)
      command.close()
    }}
  />
  <textarea
    value={text}
    onChange={(event) => {
      const value = event.target.value
      setText(value)
      command.update(value)
    }}
    onKeyDown={handleKey}
    aria-label="Type a message or /skill-name"
    rows={1}
    className="w-full resize-none bg-transparent outline-none text-sm max-h-40 py-1"
  />
</div>
```

When pending confirmation is active, keep send available and keep cancel available through the square button only when the input is empty:

```jsx
{agentRunning && !pendingConfirmation ? (
  <button type="button" onClick={onCancel} className="h-8 w-8 flex items-center justify-center rounded-md bg-red-500 text-white hover:bg-red-600" aria-label="Stop">
    <Square size={14} />
  </button>
) : (
  <button type="submit" disabled={disabled || !text.trim()} className="h-8 w-8 flex items-center justify-center rounded-md bg-[color:var(--accent)] text-white disabled:opacity-40" aria-label="Send">
    <Send size={14} />
  </button>
)}
```

- [ ] **Step 8: Run test to verify pass**

Run:

```powershell
npm.cmd exec vitest run client/src/components/chat/unified-chat-ui.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git -c safe.directory=C:/Users/g/Desktop/sinan -C 'C:\Users\g\Desktop\sinan' add client/src/lib/api.js client/src/hooks/useChat.js client/src/components/chat/ChatArea.jsx client/src/components/chat/InputBar.jsx client/src/components/chat/unified-chat-ui.test.js
git -c safe.directory=C:/Users/g/Desktop/sinan -C 'C:\Users\g\Desktop\sinan' commit -m "feat: route confirmations through chat input"
```

### Task 6: Replace Tool And Action Cards With Chat Stream Entries

**Files:**
- Modify: `client/src/hooks/useChat.js`
- Modify: `client/src/components/chat/MessageList.jsx`
- Modify: `client/src/components/chat/unified-chat-ui.test.js`

- [ ] **Step 1: Write failing static tests for card removal**

Update the old ToolCard/action-card expectations in `client/src/components/chat/unified-chat-ui.test.js` to:

```js
test('MessageList renders chat stream entries instead of approval tool and action cards', () => {
  const messageList = readProjectFile('client/src/components/chat/MessageList.jsx')
  const useChat = readProjectFile('client/src/hooks/useChat.js')

  expect(messageList).not.toContain("import ToolCard")
  expect(messageList).not.toContain("import ShellCard")
  expect(messageList).not.toContain("import ActionCard")
  expect(messageList).not.toContain("message.role === 'tool'")
  expect(messageList).not.toContain("message.role === 'actions'")
  expect(messageList).toContain("message.cardType === 'word'")
  expect(messageList).toContain("message.cardType === 'ppt'")
  expect(messageList).toContain("message.cardType === 'file'")
  expect(useChat).not.toContain("case 'UPDATE_TOOL'")
  expect(useChat).not.toContain("case 'ADD_ACTIONS'")
  expect(useChat).toContain('appendActionSummary')
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm.cmd exec vitest run client/src/components/chat/unified-chat-ui.test.js
```

Expected: FAIL because `MessageList` still imports and renders tool/action cards and `useChat` still has card-oriented reducer cases.

- [ ] **Step 3: Simplify `useChat.js` reducer and stream handling**

Remove reducer cases:

```js
case 'UPDATE_TOOL':
case 'ADD_ACTIONS':
```

Remove `toolMessageIdsRef` and all `onToolStart`, `onToolLog`, `onToolResult`, `onToolError` callbacks that add or update `role: 'tool'` messages.

Add helper:

```js
function appendActionSummary(actions = []) {
  if (!actions.length) return 'Action update received.'
  return actions.map((action) => {
    const title = action.title || action.name || action.id
    const status = action.status || 'pending'
    return `- ${title}: ${status}`
  }).join('\n')
}
```

Change action callbacks:

```js
onActionPlan: (event) => {
  for (const action of event.actions || []) schedulePendingActionTimeout(action)
  dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', type: 'action_plan', stream: true, content: appendActionSummary(event.actions || []) } })
},
onActionUpdate: (event) => {
  window.dispatchEvent(new CustomEvent('aionui:actions-changed'))
  dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', type: 'action_update', stream: true, content: appendActionSummary(event.actions || []) } })
},
```

Keep `onSkillLoaded` and `addFileCard`.

- [ ] **Step 4: Simplify `MessageList.jsx` rendering**

Change imports to:

```js
import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble.jsx'
import SkillBadge from './SkillBadge.jsx'
import WordCard from '../cards/WordCard.jsx'
import PptCard from '../cards/PptCard.jsx'
import FileCard from '../cards/FileCard.jsx'
```

Change signature:

```js
export default function MessageList({ messages }) {
```

Keep only these rendering branches:

```jsx
if (message.role === 'user' || message.role === 'assistant') {
  return <MessageBubble key={message.id} message={message} role={message.role} content={message.content} streaming={message.streaming} />
}
if (message.role === 'skill') {
  return <SkillBadge key={message.id} name={message.skillName} />
}
if (message.role === 'card') {
  if (message.cardType === 'word') return <WordCard key={message.id} msg={message} />
  if (message.cardType === 'ppt') return <PptCard key={message.id} msg={message} />
  if (message.cardType === 'file') return <FileCard key={message.id} artifact={message.cardData} />
  return <div key={message.id} className="text-xs text-[color:var(--text-muted)] my-2">[{message.cardType}]</div>
}
```

- [ ] **Step 5: Run test to verify pass**

Run:

```powershell
npm.cmd exec vitest run client/src/components/chat/unified-chat-ui.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git -c safe.directory=C:/Users/g/Desktop/sinan -C 'C:\Users\g\Desktop\sinan' add client/src/hooks/useChat.js client/src/components/chat/MessageList.jsx client/src/components/chat/unified-chat-ui.test.js
git -c safe.directory=C:/Users/g/Desktop/sinan -C 'C:\Users\g\Desktop\sinan' commit -m "feat: render tool progress as chat"
```

### Task 7: Final Verification And Startup

**Files:**
- Verify only.

- [ ] **Step 1: Run focused test suite**

Run:

```powershell
npm.cmd exec vitest run client/src/components/chat/unified-chat-ui.test.js client/src/lib/api.test.js electron/__tests__/chat-confirmation.test.js electron/__tests__/tool-policy.test.js electron/__tests__/agent-loop.test.js electron/__tests__/chat.test.js electron/__tests__/browser-task.test.js
```

Expected: PASS.

- [ ] **Step 2: Build renderer**

Run:

```powershell
npm.cmd --prefix client run build
```

Expected: Vite build completes without JSX or import errors.

- [ ] **Step 3: Check git diff does not include unrelated browser bugfix files**

Run:

```powershell
git -c safe.directory=C:/Users/g/Desktop/sinan -C 'C:\Users\g\Desktop\sinan' status --short --branch
```

Expected: any remaining modified files should either be the unrelated pre-existing browser bugfix files or intentional files from this plan. Do not add `.claude/`, `.superpowers/`, `output/`, or the pre-existing browser adapter/bridge files unless the user explicitly asks.

- [ ] **Step 4: Start the app for user review**

Run:

```powershell
npm.cmd run electron:dev
```

Expected: Electron opens. Verify manually:
- Typing `/` shows installed skills only.
- Selecting a skill inserts `/<skill-name> `.
- Sending `/<skill-name> task` loads the skill before continuing.
- A medium-risk browser/document/write operation runs without a confirmation card.
- A high-risk operation shows a chat prompt and compact status bar.
- Replying `可以` resumes the operation.
- Replying `不要` cancels the operation.
- Asking a question while pending returns an explanation and keeps the operation pending.
- File/document/PPT result rows still render.

## Self-Review Result

- Spec coverage: high-risk chat confirmation, medium/low direct execution, pending lifetime, slash installed skills, forced skill loading, card removal, and retained file/document/PPT result entries are covered by Tasks 1-7.
- Naming consistency: renderer uses `pendingConfirmation`; Electron uses `pendingConfirmations`; slash payload uses `forcedSkill`; reply payload uses `confirmationReply`.
- Worktree safety: commit commands list only files touched by each task and exclude the unrelated browser adapter/bridge changes already present in the worktree.
