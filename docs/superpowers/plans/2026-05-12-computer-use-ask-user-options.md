# Computer Use Ask-User Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a running Computer Use task pause, ask the user a question, and resume through option buttons rendered under the question bubble.

**Architecture:** Reuse the existing backend `desktopAskReply` IPC path and add only renderer-side affordances. A small pure helper derives conservative answer options from the question text, `useChat` owns pending/answered desktop ask state, and `MessageBubble` renders enabled controls only for the active pending `desktop_ask` message.

**Tech Stack:** React 18, Vitest, Electron IPC renderer helpers, existing Tailwind utility classes.

---

## File Structure

- Create `client/src/lib/desktopAskOptions.js`: pure option derivation for Computer Use questions.
- Create `client/src/lib/desktopAskOptions.test.js`: Vitest coverage for confirmation, continuation, and fallback choices.
- Modify `client/src/hooks/useChat.js`: add desktop ask message status updates and `respondToDesktopAsk(answer, options)` helper.
- Modify `client/src/components/chat/ChatArea.jsx`: pass `pendingDesktopAsk` and desktop ask handlers from `useChat` to the message list.
- Modify `client/src/components/chat/MessageList.jsx`: forward desktop ask props into each message bubble.
- Modify `client/src/components/chat/MessageBubble.jsx`: render active `desktop_ask` answer buttons.
- Modify `client/src/components/chat/unified-chat-ui.test.js`: source-level wiring checks for the new flow.

The Electron backend is intentionally left unchanged because `electron/ipc/chat.js` already resolves `desktopAskReply`, clears pending desktop questions, and has an existing regression test named `chat:send resolves pending desktop ask reply without starting a new run`.

String note: Chinese UI labels are written below with JavaScript Unicode escapes so the plan remains stable in Windows PowerShell output. At runtime they render as normal Chinese labels:

- `\u662f\u7684` renders as yes.
- `\u4e0d\u662f` renders as no.
- `\u7ee7\u7eed` renders as continue.
- `\u53d6\u6d88\u4efb\u52a1` renders as cancel task.

---

### Task 1: Add Desktop Ask Option Helper

**Files:**
- Create: `client/src/lib/desktopAskOptions.js`
- Create: `client/src/lib/desktopAskOptions.test.js`

- [ ] **Step 1: Write the failing helper test**

Create `client/src/lib/desktopAskOptions.test.js`:

```js
import { describe, expect, test } from 'vitest'
import { getDesktopAskOptions } from './desktopAskOptions.js'

describe('getDesktopAskOptions', () => {
  test('uses yes no cancel choices for confirmation-shaped questions', () => {
    expect(getDesktopAskOptions('\u662f\u5426\u7ee7\u7eed?')).toEqual([
      { label: '\u662f\u7684', value: '\u662f\u7684', variant: 'primary' },
      { label: '\u4e0d\u662f', value: '\u4e0d\u662f', variant: 'secondary' },
      { label: '\u53d6\u6d88\u4efb\u52a1', value: '\u53d6\u6d88\u4efb\u52a1', variant: 'danger', cancel: true }
    ])
  })

  test('uses continue cancel choices for blocked continuation questions', () => {
    expect(getDesktopAskOptions('\u767b\u5f55\u540e\u8bf7\u7ee7\u7eed')).toEqual([
      { label: '\u7ee7\u7eed', value: '\u7ee7\u7eed', variant: 'primary' },
      { label: '\u53d6\u6d88\u4efb\u52a1', value: '\u53d6\u6d88\u4efb\u52a1', variant: 'danger', cancel: true }
    ])
  })

  test('falls back to continue cancel choices for open desktop questions', () => {
    expect(getDesktopAskOptions('Computer Use needs your input.')).toEqual([
      { label: '\u7ee7\u7eed', value: '\u7ee7\u7eed', variant: 'primary' },
      { label: '\u53d6\u6d88\u4efb\u52a1', value: '\u53d6\u6d88\u4efb\u52a1', variant: 'danger', cancel: true }
    ])
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm.cmd test -- client/src/lib/desktopAskOptions.test.js
```

Expected: FAIL with an import error for `./desktopAskOptions.js`.

- [ ] **Step 3: Implement the helper**

Create `client/src/lib/desktopAskOptions.js`:

```js
const CONFIRMATION_TOKENS = ['\u662f\u5426', '\u662f\u4e0d\u662f', '\u786e\u8ba4', '\u5417']
const CONTINUATION_TOKENS = ['\u7ee7\u7eed', '\u767b\u5f55\u540e', '\u5b8c\u6210\u540e']

const YES_NO_OPTIONS = [
  { label: '\u662f\u7684', value: '\u662f\u7684', variant: 'primary' },
  { label: '\u4e0d\u662f', value: '\u4e0d\u662f', variant: 'secondary' },
  { label: '\u53d6\u6d88\u4efb\u52a1', value: '\u53d6\u6d88\u4efb\u52a1', variant: 'danger', cancel: true }
]

const CONTINUE_OPTIONS = [
  { label: '\u7ee7\u7eed', value: '\u7ee7\u7eed', variant: 'primary' },
  { label: '\u53d6\u6d88\u4efb\u52a1', value: '\u53d6\u6d88\u4efb\u52a1', variant: 'danger', cancel: true }
]

function includesAny(text, tokens) {
  return tokens.some((token) => text.includes(token))
}

export function getDesktopAskOptions(question = '') {
  const text = String(question || '')
  if (includesAny(text, CONFIRMATION_TOKENS)) return YES_NO_OPTIONS
  if (includesAny(text, CONTINUATION_TOKENS)) return CONTINUE_OPTIONS
  return CONTINUE_OPTIONS
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npm.cmd test -- client/src/lib/desktopAskOptions.test.js
```

Expected: PASS for all three helper tests.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add client/src/lib/desktopAskOptions.js client/src/lib/desktopAskOptions.test.js
git commit -m "feat: derive desktop ask options"
```

---

### Task 2: Add Renderer State And Reply Helper

**Files:**
- Modify: `client/src/hooks/useChat.js`
- Modify: `client/src/components/chat/unified-chat-ui.test.js`

- [ ] **Step 1: Add failing source-level wiring checks**

Append this test inside the existing `describe('unified chat UI wiring', () => { ... })` block in `client/src/components/chat/unified-chat-ui.test.js`:

```js
  test('renderer keeps desktop ask replies inside the active computer use turn', () => {
    const useChat = readProjectFile('client/src/hooks/useChat.js')

    expect(useChat).toContain('pendingDesktopAsk')
    expect(useChat).toContain('respondToDesktopAsk')
    expect(useChat).toContain("type: 'UPDATE_DESKTOP_ASK'")
    expect(useChat).toContain("type: 'CLEAR_DESKTOP_ASKS'")
    expect(useChat).toContain('desktopAskStatus')
    expect(useChat).toContain('desktopAskReply: true')
    expect(useChat).toContain("status: 'answering'")
    expect(useChat).toContain("status: 'cancelled'")
    expect(useChat).toContain("status: 'answered'")
  })
```

- [ ] **Step 2: Run the focused UI wiring test and verify it fails**

Run:

```powershell
npm.cmd test -- client/src/components/chat/unified-chat-ui.test.js
```

Expected: FAIL because `respondToDesktopAsk`, desktop ask reducer actions, and `desktopAskStatus` are not present.

- [ ] **Step 3: Add desktop ask reducer cases**

In `client/src/hooks/useChat.js`, add these cases to `reducer(state, action)` after `CLEAR_CONFIRMATIONS`:

```js
    case 'UPDATE_DESKTOP_ASK':
      return {
        ...state,
        messages: state.messages.map((message) => (
          message.type === 'desktop_ask' && message.desktopAsk?.requestId === action.requestId
            ? { ...message, desktopAskStatus: action.status }
            : message
        ))
      }
    case 'CLEAR_DESKTOP_ASKS':
      return {
        ...state,
        messages: state.messages.map((message) => (
          message.type === 'desktop_ask' && message.desktopAskStatus === 'pending'
            ? { ...message, desktopAskStatus: action.status }
            : message
        ))
      }
```

- [ ] **Step 4: Store the request and pending status on desktop ask messages**

In `client/src/hooks/useChat.js`, replace the current `onDesktopAsk` handler:

```js
      onDesktopAsk: (event) => {
        setPendingDesktopAsk(event.request)
        dispatch({ type: 'ADD', msg: { id: `desktop-ask-${event.request.requestId}`, role: 'assistant', type: 'desktop_ask', content: event.request.question } })
      },
      onDesktopAskCleared: () => setPendingDesktopAsk(null),
```

with:

```js
      onDesktopAsk: (event) => {
        setPendingDesktopAsk(event.request)
        dispatch({
          type: 'ADD',
          msg: {
            id: `desktop-ask-${event.request.requestId}`,
            role: 'assistant',
            type: 'desktop_ask',
            content: event.request.question,
            desktopAsk: event.request,
            desktopAskStatus: 'pending'
          }
        })
      },
      onDesktopAskCleared: (event) => {
        setPendingDesktopAsk(null)
        dispatch({
          type: 'CLEAR_DESKTOP_ASKS',
          status: event?.reason === 'answered' ? 'answered' : 'cleared'
        })
      },
```

- [ ] **Step 5: Add `respondToDesktopAsk`**

In `client/src/hooks/useChat.js`, add this callback after `respondToConfirmation` and before `handleAbort`:

```js
  const respondToDesktopAsk = useCallback((answer, options = {}) => {
    const convId = conversationIdRef.current
    const pending = pendingDesktopAsk
    if (!convId || !pending) return

    const requestId = pending.requestId
    const userMessage = { id: uid(), role: 'user', content: answer }
    dispatch({ type: 'ADD', msg: userMessage })

    if (options.cancel) {
      dispatch({ type: 'UPDATE_DESKTOP_ASK', requestId, status: 'cancelled' })
      abortRef.current?.()
      abortChat(convId).catch((error) => console.error('[chat] cancel desktop ask failed:', error))
      setPendingDesktopAsk(null)
      setAgentRunning(false)
      return
    }

    dispatch({ type: 'UPDATE_DESKTOP_ASK', requestId, status: 'answering' })
    api.invoke('chat:send', { convId, desktopAskReply: true, message: answer }).then((result) => {
      if (result.status === 'desktop-ask-replied') {
        dispatch({ type: 'UPDATE_DESKTOP_ASK', requestId, status: 'answered' })
        setPendingDesktopAsk(null)
      } else if (result.status === 'missing-desktop-ask') {
        dispatch({ type: 'UPDATE_DESKTOP_ASK', requestId, status: 'cleared' })
        setPendingDesktopAsk(null)
      }
    }).catch((error) => {
      dispatch({ type: 'UPDATE_DESKTOP_ASK', requestId, status: 'pending' })
      dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', content: `[Desktop ask error] ${error.message}` } })
    })
  }, [pendingDesktopAsk])
```

- [ ] **Step 6: Return the new helper**

In the final return object of `useChat`, change:

```js
  return { ...state, agentRunning, pendingConfirmation, pendingDesktopAsk, sendUserMessage, respondToConfirmation, handleAbort, sendCommand, addCard, updateCard, addFileCard, clear }
```

to:

```js
  return { ...state, agentRunning, pendingConfirmation, pendingDesktopAsk, sendUserMessage, respondToConfirmation, respondToDesktopAsk, handleAbort, sendCommand, addCard, updateCard, addFileCard, clear }
```

- [ ] **Step 7: Run the focused UI wiring test and verify it passes**

Run:

```powershell
npm.cmd test -- client/src/components/chat/unified-chat-ui.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

Run:

```powershell
git add client/src/hooks/useChat.js client/src/components/chat/unified-chat-ui.test.js
git commit -m "feat: handle desktop ask replies in chat state"
```

---

### Task 3: Render Desktop Ask Option Buttons

**Files:**
- Modify: `client/src/components/chat/ChatArea.jsx`
- Modify: `client/src/components/chat/MessageList.jsx`
- Modify: `client/src/components/chat/MessageBubble.jsx`
- Modify: `client/src/components/chat/unified-chat-ui.test.js`

- [ ] **Step 1: Add failing source-level render checks**

Append this test inside `client/src/components/chat/unified-chat-ui.test.js`:

```js
  test('desktop ask messages render option buttons under the question bubble', () => {
    const chatArea = readProjectFile('client/src/components/chat/ChatArea.jsx')
    const messageList = readProjectFile('client/src/components/chat/MessageList.jsx')
    const messageBubble = readProjectFile('client/src/components/chat/MessageBubble.jsx')
    const inputBar = readProjectFile('client/src/components/chat/InputBar.jsx')

    expect(chatArea).toContain('pendingDesktopAsk')
    expect(chatArea).toContain('respondToDesktopAsk')
    expect(chatArea).toContain('onRespondDesktopAsk={respondToDesktopAsk}')
    expect(messageList).toContain('onRespondDesktopAsk')
    expect(messageList).toContain('onCancelDesktopAsk')
    expect(messageBubble).toContain("message?.type === 'desktop_ask'")
    expect(messageBubble).toContain('getDesktopAskOptions(content)')
    expect(messageBubble).toContain('onRespondDesktopAsk')
    expect(messageBubble).toContain('onCancelDesktopAsk')
    expect(messageBubble).toContain('option.cancel')
    expect(inputBar).toContain('agentRunning && !pendingConfirmation')
  })
```

- [ ] **Step 2: Run the focused UI wiring test and verify it fails**

Run:

```powershell
npm.cmd test -- client/src/components/chat/unified-chat-ui.test.js
```

Expected: FAIL because `ChatArea`, `MessageList`, and `MessageBubble` do not pass or render desktop ask controls.

- [ ] **Step 3: Wire `ChatArea` props**

In `client/src/components/chat/ChatArea.jsx`, change the `useChat` destructuring from:

```js
  const { messages, streaming, agentRunning, pendingConfirmation, sendUserMessage, respondToConfirmation, handleAbort, updateCard, addFileCard } = useChat(conversationId)
```

to:

```js
  const { messages, streaming, agentRunning, pendingConfirmation, pendingDesktopAsk, sendUserMessage, respondToConfirmation, respondToDesktopAsk, handleAbort, updateCard, addFileCard } = useChat(conversationId)
```

Then change the `MessageList` call from:

```jsx
      <MessageList
        messages={messages}
        onRespondConfirmation={respondToConfirmation}
        onUpdateCard={updateCard}
        onFileGenerated={addFileCard}
      />
```

to:

```jsx
      <MessageList
        messages={messages}
        pendingDesktopAsk={pendingDesktopAsk}
        onRespondConfirmation={respondToConfirmation}
        onRespondDesktopAsk={respondToDesktopAsk}
        onCancelDesktopAsk={(answer) => respondToDesktopAsk(answer, { cancel: true })}
        onUpdateCard={updateCard}
        onFileGenerated={addFileCard}
      />
```

- [ ] **Step 4: Wire `MessageList` props**

In `client/src/components/chat/MessageList.jsx`, change the component signature from:

```js
export default function MessageList({ messages, onRespondConfirmation }) {
```

to:

```js
export default function MessageList({ messages, pendingDesktopAsk, onRespondConfirmation, onRespondDesktopAsk, onCancelDesktopAsk }) {
```

Then change the `MessageBubble` call from:

```jsx
          return <MessageBubble key={message.id} message={message} role={message.role} content={message.content} streaming={message.streaming} onRespondConfirmation={onRespondConfirmation} />
```

to:

```jsx
          return (
            <MessageBubble
              key={message.id}
              message={message}
              role={message.role}
              content={message.content}
              streaming={message.streaming}
              pendingDesktopAsk={pendingDesktopAsk}
              onRespondConfirmation={onRespondConfirmation}
              onRespondDesktopAsk={onRespondDesktopAsk}
              onCancelDesktopAsk={onCancelDesktopAsk}
            />
          )
```

- [ ] **Step 5: Render `desktop_ask` controls in `MessageBubble`**

In `client/src/components/chat/MessageBubble.jsx`, add this import at the top:

```js
import { getDesktopAskOptions } from '../../lib/desktopAskOptions.js'
```

Change the function signature from:

```js
export default function MessageBubble({ message, role, content, streaming, onRespondConfirmation }) {
```

to:

```js
export default function MessageBubble({ message, role, content, streaming, pendingDesktopAsk, onRespondConfirmation, onRespondDesktopAsk, onCancelDesktopAsk }) {
```

Add this branch after the confirmation branch and before the stream branches:

```jsx
  if (message?.type === 'desktop_ask') {
    const options = getDesktopAskOptions(content)
    const isActive = pendingDesktopAsk?.requestId && message.desktopAsk?.requestId === pendingDesktopAsk.requestId
    const disabled = !isActive || message.desktopAskStatus !== 'pending'

    return (
      <div className="flex justify-start mb-4">
        <div className="max-w-[75%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap break-words bg-[color:var(--bg-secondary)] text-[color:var(--text-primary)] rounded-bl-sm border border-[color:var(--border)]">
          <div>{content}</div>
          <div className="mt-3 flex flex-wrap gap-3">
            {options.map((option) => (
              <button
                key={option.label}
                type="button"
                disabled={disabled}
                onClick={() => option.cancel ? onCancelDesktopAsk?.(option.value) : onRespondDesktopAsk?.(option.value)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs disabled:opacity-60 ${
                  option.variant === 'primary'
                    ? 'border-[color:var(--accent)]'
                    : option.variant === 'danger'
                      ? 'border-red-300 text-red-600'
                      : 'border-[color:var(--border)]'
                }`}
              >
                <span className="h-3 w-3 rounded-full border border-current" />
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }
```

- [ ] **Step 6: Run the focused UI wiring test and verify it passes**

Run:

```powershell
npm.cmd test -- client/src/components/chat/unified-chat-ui.test.js
```

Expected: PASS.

- [ ] **Step 7: Run the helper test again**

Run:

```powershell
npm.cmd test -- client/src/lib/desktopAskOptions.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

Run:

```powershell
git add client/src/components/chat/ChatArea.jsx client/src/components/chat/MessageList.jsx client/src/components/chat/MessageBubble.jsx client/src/components/chat/unified-chat-ui.test.js
git commit -m "feat: render desktop ask choices"
```

---

### Task 4: Verify Integration

**Files:**
- No source edits unless verification exposes a defect in files changed by Tasks 1-3.

- [ ] **Step 1: Run all automated tests**

Run:

```powershell
npm.cmd test
```

Expected: all existing and new Vitest tests pass.

- [ ] **Step 2: Check git status**

Run:

```powershell
git status --short
```

Expected: no tracked source changes remain. The pre-existing untracked `output/` directory may still appear and should not be committed.

- [ ] **Step 3: Start the app for visual verification**

Run:

```powershell
npm.cmd run electron:dev
```

Expected: the current Electron app opens from this worktree. If port 5173 is already occupied by another Vite server, stop the old dev process or let Vite choose the next available port.

- [ ] **Step 4: Manual UI check**

In the running app:

1. Select `Computer Use` from the plugin menu.
2. Send a desktop task that can pause for a question.
3. Confirm the `desktop_ask` assistant bubble displays option buttons under the question.
4. Click a non-cancel option and confirm the task resumes.
5. Repeat with a new pause and click the button whose source label is `\u53d6\u6d88\u4efb\u52a1`; confirm the task stops and the cursor overlay hides.

- [ ] **Step 5: Commit only if verification required edits**

If Step 1 through Step 4 required a code correction, run:

```powershell
git add client/src/lib/desktopAskOptions.js client/src/lib/desktopAskOptions.test.js client/src/hooks/useChat.js client/src/components/chat/ChatArea.jsx client/src/components/chat/MessageList.jsx client/src/components/chat/MessageBubble.jsx client/src/components/chat/unified-chat-ui.test.js
git commit -m "fix: stabilize desktop ask choices"
```

If no correction was needed, do not create an empty commit.

---

## Self-Review

- Spec coverage: Task 1 covers option generation. Task 2 covers renderer state, single reply, duplicate-click prevention through `answering` status, cancel handling, and backend reuse. Task 3 covers bubble-level controls and keeps the bottom input disabled. Task 4 covers automated and manual verification.
- Backend scope: no backend edit is planned because `desktopAskReply`, `chat:desktop-ask-cleared`, and abort handling already exist and are tested.
- Type consistency: the plan uses `pendingDesktopAsk`, `respondToDesktopAsk`, `desktopAsk`, `desktopAskStatus`, `UPDATE_DESKTOP_ASK`, and `CLEAR_DESKTOP_ASKS` consistently across hook, list, and bubble.
- UI consistency: option buttons reuse the existing rounded confirmation-control visual style and keep the active task stop button available through the existing `InputBar` condition.
