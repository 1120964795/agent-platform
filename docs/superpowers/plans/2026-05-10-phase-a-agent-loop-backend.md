# Phase A: Agent Loop Backend (3-4 days, MVP-scoped)

> **For codex (executor):** Phase A only. Do NOT touch frontend, browser sidecar, UI-TARS bridge, SQLite, or old-code retirement — those are Phases B/C/D/E in subsequent plans. After Phase A: agentLoop runs end-to-end with **existing tools and existing deepseek service**, gated by toolPolicy. Frontend integration comes in a separate plan.

**Branch:** `feat/phase-a-agent-loop` from `main`.

**MVP definition**: a unit test invokes `agentLoop.runTurn({ messages })` with a mocked DeepSeek; agent loops, tool calls fire through existing `tools.execute()`, blocked tools return `POLICY_BLOCKED`, signal abort cleanly cancels.

---

## Reuse pact (MUST honor — every previous plan violated these)

| | What |
|---|---|
| 1 | Use existing `electron/services/deepseek.js#chat({tools})`. Tool calls returned in normalized form `{id, name, args, raw}` — NOT OpenAI `{function:{name,arguments}}`. Verify by reading `normalizeToolCalls` at line 55 before writing any consumer. |
| 2 | Use existing `electron/tools/index.js#register`/`execute`. Do NOT create a parallel registry. |
| 3 | Do NOT modify the existing `getExecutionToolSchemas()` (returns `[]`, locked by `tools.test.js:31`). Add a NEW function `getAgentLoopToolSchemas()` for agent use. |
| 4 | Do NOT modify `electron/skills/loader.js`. |
| 5 | Existing tool implementations (fs-write, shell, etc.) may call `requestConfirm` internally. Phase A reads how that interacts and documents it; if double-approval risk exists, Phase A passes a `skipInternalConfirm: true` option through `tools.execute(opts)`, OR identifies the call sites that need one-line guards. **Don't break existing chat:execute mode.** |

---

## File plan

```
NEW
  electron/security/policyPatterns.js          extracted regex constants
  electron/security/pathSafety.js              realpath + parent realpath + Windows allowlist
  electron/security/toolPolicy.js              evaluateToolCall(name, args, ctx)
  electron/services/agentLoop.js               runTurn() with cancellable tool dispatch
  electron/__tests__/policy-patterns.test.js
  electron/__tests__/path-safety.test.js
  electron/__tests__/tool-policy.test.js
  electron/__tests__/agent-loop.test.js

MODIFY
  electron/security/actionPolicy.js            re-export patterns from policyPatterns.js (preserve behavior)
  electron/tools/index.js                      add getAgentLoopToolSchemas() — does NOT touch existing getExecutionToolSchemas
```

---

## Task 0: API surface read (30 min, no code changes)

Before writing any new code, document the exact signatures we'll consume.

- [ ] Read `electron/services/deepseek.js#chat` — note exact return shape, especially `tool_calls` normalized form, and whether `signal` is supported. If signal is missing, that's a Task 0.5 fix (add it).
- [ ] Read `electron/tools/index.js#execute` — note signature `execute(name, args, options?)`. Document whether `signal` is supported. If missing, Task 0.5.
- [ ] Read 2-3 existing tools (fs-write.js, shell.js) — find any `requestConfirm` calls and decide: pass-through option or per-tool guard?

Write findings to `docs/test-report.md` under `## Phase A Task 0 — API surface notes`. Commit: `docs: phase A — API surface inventory`.

---

## Task 1: policyPatterns + tests (~1 hour)

- [ ] Test first: `electron/__tests__/policy-patterns.test.js` — assert each pattern recognizes its target strings (`INSTALL_PATTERN.test('npm install x')` etc.) and rejects neutral strings.
- [ ] Implement: `electron/security/policyPatterns.js` exporting all regexes currently `const` in `actionPolicy.js`. Add the new v4 patterns: `URL_PROTOCOLS_BLOCKED`, `RFC1918_HOST`, `PAYMENT_INTENT`, `ACCOUNT_DESTRUCTION`, `PASSWORD_CHANGE`, `MONEY_TRANSFER`.
- [ ] Modify `electron/security/actionPolicy.js`: replace `const PATTERN = /.../` lines with `const { PATTERN } = require('./policyPatterns')`. Re-export for backcompat. Existing `actionPolicy` tests must still pass.
- [ ] Run: `npx vitest run electron/__tests__/policy-patterns.test.js electron/__tests__/action-policy.test.js`
- [ ] Commit: `feat(security): extract policyPatterns; actionPolicy re-exports`

---

## Task 2: pathSafety + tests (~1.5 hour)

- [ ] Test first: `electron/__tests__/path-safety.test.js` covers:
  - existing path: realpath used
  - non-existent write target: realpath of PARENT directory (not just `path.resolve`)
  - junction at parent → blocked when target resolves to system path
  - UNC `\\server\share` blocked; long-path `\\?\C:\...` accepted (prefix stripped)
  - read mode allows broadly within home, blocks system paths
  - write mode strictly within writable-roots allowlist
- [ ] Implement: `electron/security/pathSafety.js` per v4 spec §6 (realpath the parent for non-existent paths).
- [ ] Run + commit: `feat(security): pathSafety with realpath-parent + Windows allowlist`

---

## Task 3: toolPolicy + tests (~2 hours)

- [ ] Test first: `electron/__tests__/tool-policy.test.js` covers:
  - `read_file` outside system → low; system path → blocked
  - `write_file` to Desktop → medium+approval; to system → blocked
  - `run_shell_command` neutral → medium; matches UNBOUNDED_DELETE → blocked; INSTALL → high; PS_INVOKE_EXPRESSION → high
  - `delete_path` → high+approval
  - `code_execute` with credentials+exfil → blocked; otherwise medium
  - existing tools registered today (`load_skill`, `read_file`, `list_dir`, `get_os_info`, `which`, `remember_user_rule`, `forget_user_rule`, `generate_docx`, `generate_pptx`) — defaults sensible
  - unknown tool → blocked

- [ ] Implement: `electron/security/toolPolicy.js`. Function: `evaluateToolCall(name, args, ctx)` returns `{risk, reason, allowed, requiresApproval}`. Uses policyPatterns + pathSafety internally.
- [ ] Run + commit: `feat(security): toolPolicy.evaluateToolCall covers all currently-registered tools`

**Note**: browser_task / desktop_* / code_execute are NOT registered yet. Phase A's toolPolicy still includes their branches so Phase C/D can plug in without re-modifying this module.

---

## Task 4: getAgentLoopToolSchemas (~30 min)

- [ ] Test first: `electron/__tests__/tools.test.js` add:
  ```js
  test('agent loop tool schemas include all builtin tools', () => {
    const { getAgentLoopToolSchemas } = require('../tools')
    const names = getAgentLoopToolSchemas().map(s => s.function.name)
    for (const t of ['read_file', 'write_file', 'run_shell_command', 'load_skill']) {
      expect(names).toContain(t)
    }
  })
  ```
- [ ] Implement: in `electron/tools/index.js`, add:
  ```js
  function getAgentLoopToolSchemas() {
    // Returns OpenAI function-calling schema array.
    // Distinct from getExecutionToolSchemas() which is the legacy execute-mode catalog (returns []).
    return TOOL_SCHEMAS.map(s => ({ type: 'function', function: { name: s.name, description: s.description, parameters: s.parameters } }))
  }
  module.exports = { ..., getAgentLoopToolSchemas }
  ```
- [ ] Verify the existing `tools.test.js:31` test still passes (`getExecutionToolSchemas()` still returns `[]`).
- [ ] Commit: `feat(tools): getAgentLoopToolSchemas (separate from legacy execute schemas)`

---

## Task 5: agentLoop with correct deepseek contract (~3 hours)

- [ ] Test first: `electron/__tests__/agent-loop.test.js` covers:
  - mocked `deepseek.chat` returning `{tool_calls: [], content: 'hi'}` → loop returns immediately
  - mocked returning `{tool_calls: [{id, name:'read_file', args:{path:'C:/Users/g/Desktop/foo.txt'}}]}` → tools.execute called → result fed back as `{role:'tool', tool_call_id, content}` → next iteration with empty tool_calls → ends
  - blocked tool → `POLICY_BLOCKED: ...` content appended, tools.execute NOT called
  - approval-required tool → `requestApproval` callback fired; if denied → `USER_DENIED` appended
  - signal aborted mid-invoke → all in-flight controllers abort → returns `{finalText: '操作已取消'}` and does NOT make another model call
  - MAX_STEPS=30 reached → returns step-limit message

- [ ] Implement: `electron/services/agentLoop.js`. Critical:
  - Use `call.name` and `call.args` (deepseek normalized form), NOT `call.function.name`
  - Append `response.assistant_message` to history (already a properly-shaped message), not a manually constructed one
  - Use existing `tools.execute(name, args, {signal})` — pass through AbortSignal
  - Use existing `deepseek.chat({messages, tools, signal})` — pass through AbortSignal
  - Track `inFlight: Set<AbortController>`, outer signal aborts all
  - On AbortError: return immediately, NO further model call
  - Approval flow: `evaluateToolCall` first; if `risk==='blocked'` → POLICY_BLOCKED; if `requiresApproval` → call `onEvent('approval_request', {call, decision})` and await user decision via `requestApproval` callback

```js
// sketch — final code in TDD step
async function runTurn({ messages, signal, onEvent, requestApproval }, deps = {}) {
  const deepseek = deps.deepseek || require('./deepseek')
  const tools = deps.tools || require('../tools')
  const policy = deps.policy || require('../security/toolPolicy')
  const history = [...messages]
  const inFlight = new Set()
  signal?.addEventListener('abort', () => { for (const c of inFlight) c.abort() })

  for (let step = 0; step < 30; step++) {
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    const response = await deepseek.chat({
      messages: history,
      tools: tools.getAgentLoopToolSchemas(),
      signal
    })
    history.push(response.assistant_message)
    onEvent?.('assistant_message', { content: response.content, toolCalls: response.tool_calls })
    if (!response.tool_calls?.length) return { finalText: response.content || '已完成', history }

    for (const call of response.tool_calls) {
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      const decision = policy.evaluateToolCall(call.name, call.args)
      if (decision.risk === 'blocked') {
        history.push({ role: 'tool', tool_call_id: call.id, content: `POLICY_BLOCKED: ${decision.reason}` })
        onEvent?.('tool_blocked', { call, reason: decision.reason })
        continue
      }
      if (decision.requiresApproval && requestApproval) {
        const ok = await requestApproval({ call, decision })
        if (!ok) {
          history.push({ role: 'tool', tool_call_id: call.id, content: 'USER_DENIED' })
          continue
        }
      }
      const ctl = new AbortController()
      inFlight.add(ctl)
      try {
        const result = await tools.execute(call.name, call.args, { signal: ctl.signal, skipInternalConfirm: true })
        const content = typeof result === 'string' ? result : JSON.stringify(result)
        history.push({ role: 'tool', tool_call_id: call.id, content })
        onEvent?.('tool_result', { call, result })
      } catch (err) {
        if (err.name === 'AbortError') {
          history.push({ role: 'tool', tool_call_id: call.id, content: 'CANCELLED' })
          return { finalText: '操作已取消', history }
        }
        history.push({ role: 'tool', tool_call_id: call.id, content: `ERROR: ${err.message}` })
      } finally {
        inFlight.delete(ctl)
      }
    }
  }
  return { finalText: '已达 30 步上限', history }
}
```

- [ ] If `tools.execute` doesn't accept a `skipInternalConfirm` option, Task 5.5 is to add it (or per-tool guard at the requestConfirm call sites). Decide based on Task 0's read.
- [ ] Run all tests: `npm test`
- [ ] Commit: `feat(agent): agentLoop runTurn — correct deepseek contract + cancellation + policy gate`

---

## Task 6: Manual smoke test (~30 min)

- [ ] Create `scripts/smoke-agent-loop.js` — invokes `agentLoop.runTurn` with a real DeepSeek key (from `config.json`) and message "in C:\Users\g\Desktop create a file hello.txt with content 'hello world'". Watches:
  - tool_calls fired with `name: 'write_file'`
  - approval prompt (auto-approve in script via `requestApproval: () => true`)
  - tool_result includes file path
  - file actually appears on disk
- [ ] Run, capture output, append to `docs/test-report.md` under `## Phase A acceptance smoke`.

---

## Phase A Definition of Done

- [ ] All 5 new test files green; no existing tests broken (especially `tools.test.js:31`).
- [ ] `agentLoop.runTurn` callable from a Node smoke script with real DeepSeek + real tool execution.
- [ ] Tool call contract uses `call.name` / `call.args` (deepseek normalized form).
- [ ] `getAgentLoopToolSchemas()` returns all currently-registered tools; `getExecutionToolSchemas()` still returns `[]`.
- [ ] Cancel via `AbortSignal` actually stops mid-flight tool and prevents next model call.
- [ ] No frontend / browser / UI-TARS / SQLite changes.
- [ ] Branch ready to merge or rebase as foundation for Phase B.

After this, the human decides whether to proceed to Phase B (frontend wiring) or stop and ship Phase A as-is for backend-only consumers.
