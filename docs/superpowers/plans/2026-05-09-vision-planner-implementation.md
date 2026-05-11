# Vision Planner + Observe-Act Loop Implementation Plan

> **For codex (executor):** Execute task-by-task using TDD. Each step is bite-sized (2-5 min). Commit after every passing test. Do not skip ahead. Spec: `docs/superpowers/specs/2026-05-09-vision-planner-design.md`.

**Goal:** Replace the text-only DeepSeek planner with a Doubao-1.5-vision-based observe-act loop for web tasks. Each orchestrator turn first captures the current Chrome screenshot via midscene-bridge, then passes screenshot + goal + history to Doubao vision, which returns the next 1-3 actions.

**Branch:** `feat/vision-planner` from current `main`.

**Red lines:**
1. Existing DeepSeek text path **must remain functionally unchanged** for non-web tasks. Vision path is additive.
2. Internal observe (used by orchestrator to feed the planner) bypasses the broker. User-explicit `web.observe` still goes through broker.
3. Reuse `config.doubaoVisionApiKey` / `doubaoVisionEndpoint` / `doubaoVisionModel` — no new fields except `visionLoopEnabled` (default true).
4. Vision planner output is validated by existing `normalizeActionPlan` — no parallel validation logic.

---

## File Plan

```
NEW
  electron/services/visionPlanner.js
  electron/__tests__/vision-planner.test.js

MODIFY
  electron/services/actionPlanner.js     # export getActionSchemaForVisionPrompt() helper
  electron/services/taskOrchestrator.js  # branch on visionLoopEnabled + add internalObserve + vision path
  electron/__tests__/task-orchestrator.test.js  # cover vision path + fallback paths
  electron/store.js                      # add visionLoopEnabled: true default
  electron/__tests__/store.test.js       # cover new field
```

---

## Task 1: Settings field

**Files:** `electron/store.js`, `electron/__tests__/store.test.js`

- [ ] **Step 1:** Read `electron/store.js`, find config defaults, add `visionLoopEnabled: true` next to `dryRunEnabled` or wherever boolean flags live.

- [ ] **Step 2:** Append to `store.test.js`:

```js
test('config has visionLoopEnabled default true', () => {
  const cfg = createStore().getConfig()
  expect(cfg.visionLoopEnabled).toBe(true)
})
```

- [ ] **Step 3:** Run + commit.

```bash
npx vitest run electron/__tests__/store.test.js
git add electron/store.js electron/__tests__/store.test.js
git commit -m "feat(store): add visionLoopEnabled default true"
```

---

## Task 2: Schema helper in actionPlanner

**Files:** `electron/services/actionPlanner.js`, `electron/__tests__/action-planner.test.js`

- [ ] **Step 1:** Add a function `getActionSchemaForVisionPrompt()` returning the runtime+action-type catalog as a string, extracted from the existing `buildPlannerPrompt` system text. Export it.

```js
function getActionSchemaForVisionPrompt() {
  return [
    'Available runtimes and their action types:',
    '  - "midscene": "web.navigate", "web.observe", "web.click", "web.type", "web.query"',
    '       payload examples: { url } | {} | { target: "登录按钮" } | { text: "username" } | { question: "页面标题？" }',
    'Risk levels: "low" (read-only/observe), "medium" (mutations bounded to page), "high" (submit forms with credentials, destructive).',
    'Output JSON: { "actions": [ { runtime, type, title, summary, payload, risk } ... ] }'
  ].join('\n')
}
```

- [ ] **Step 2:** Test:

```js
test('getActionSchemaForVisionPrompt mentions all v1 web action types', () => {
  const s = getActionSchemaForVisionPrompt()
  for (const t of ['web.navigate','web.observe','web.click','web.type','web.query']) {
    expect(s).toContain(t)
  }
})
```

- [ ] **Step 3:** Run + commit.

```bash
npx vitest run electron/__tests__/action-planner.test.js
git add electron/services/actionPlanner.js electron/__tests__/action-planner.test.js
git commit -m "feat(actionPlanner): export getActionSchemaForVisionPrompt for vision planner reuse"
```

---

## Task 3: visionPlanner — happy path

**Files:** `electron/services/visionPlanner.js`, `electron/__tests__/vision-planner.test.js`

- [ ] **Step 1:** Failing test:

```js
import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { planNext, VisionPlannerError } = require('../services/visionPlanner')

describe('visionPlanner.planNext', () => {
  it('returns parsed actions when Doubao API responds with valid JSON', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          actions: [{ runtime: 'midscene', type: 'web.click', payload: { target: '章节' }, risk: 'medium' }]
        }) } }]
      })
    }))
    const result = await planNext({
      goal: 'click 章节',
      history: [],
      screenshotBase64: 'AAAA',
      config: {
        doubaoVisionEndpoint: 'https://x',
        doubaoVisionApiKey: 'k',
        doubaoVisionModel: 'doubao-vision-pro'
      },
      fetchImpl
    })
    expect(result.actions).toHaveLength(1)
    expect(result.actions[0].type).toBe('web.click')
    const callArgs = fetchImpl.mock.calls[0]
    expect(callArgs[0]).toContain('chat/completions')
    const body = JSON.parse(callArgs[1].body)
    expect(body.model).toBe('doubao-vision-pro')
    expect(body.messages[1].content[1].image_url.url).toMatch(/^data:image\/png;base64,AAAA/)
  })

  it('throws VisionPlannerError on malformed JSON', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not json' } }] })
    }))
    await expect(planNext({
      goal: 'x', history: [], screenshotBase64: 'AAAA',
      config: { doubaoVisionEndpoint: 'https://x', doubaoVisionApiKey: 'k', doubaoVisionModel: 'm' },
      fetchImpl
    })).rejects.toThrow(/VISION_JSON_INVALID/)
  })

  it('throws when API returns 5xx', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, text: async () => 'down' }))
    await expect(planNext({
      goal: 'x', history: [], screenshotBase64: 'AAAA',
      config: { doubaoVisionEndpoint: 'https://x', doubaoVisionApiKey: 'k', doubaoVisionModel: 'm' },
      fetchImpl
    })).rejects.toThrow()
  })

  it('throws when config is missing required fields', async () => {
    await expect(planNext({
      goal: 'x', history: [], screenshotBase64: 'AAAA',
      config: { doubaoVisionApiKey: '' }
    })).rejects.toThrow(/VISION_NOT_CONFIGURED/)
  })
})
```

- [ ] **Step 2:** Implement `electron/services/visionPlanner.js`:

```js
const { getActionSchemaForVisionPrompt } = require('./actionPlanner')

class VisionPlannerError extends Error {
  constructor(code, message, details) {
    super(message); this.code = code; this.details = details
  }
}

const SYSTEM_PROMPT = [
  'You are the AionUi vision-grounded action planner. You see a screenshot of the user\'s current Chrome tab.',
  'Plan the NEXT 1-3 actions to make progress toward the user\'s goal. Output ONLY JSON: { "actions": [...] }.',
  'Use concrete visual locators that describe what you SEE on this screenshot, e.g. "left sidebar item with text 章节, 4th from top" not "navigation menu". Mention colors, positions, surrounding text — Midscene\'s per-action vision model uses these phrases to find the element.',
  'Login fields: never autofill credentials. If the user is on a login page, plan only an observe so they can fill in manually, then expect the user to say "继续" once logged in.',
  'If the goal looks done from the screenshot (e.g. video already playing, target page reached), return { "actions": [] } so the orchestrator can stop.',
  '',
  getActionSchemaForVisionPrompt()
].join('\n')

function buildHistoryText(history = []) {
  const lines = []
  for (const m of history) {
    if (!m || typeof m.content !== 'string') continue
    if (m.role === 'user') lines.push(`USER: ${m.content}`)
    else if (m.role === 'assistant') lines.push(`ASSISTANT: ${m.content}`)
  }
  return lines.length ? `Conversation so far:\n${lines.join('\n')}\n\n` : ''
}

async function planNext({ goal, history = [], screenshotBase64, config = {}, fetchImpl }) {
  if (!config.doubaoVisionEndpoint || !config.doubaoVisionApiKey || !config.doubaoVisionModel) {
    throw new VisionPlannerError('VISION_NOT_CONFIGURED', 'Doubao vision endpoint/key/model missing in config.')
  }
  const fetcher = fetchImpl || global.fetch
  if (!fetcher) throw new VisionPlannerError('VISION_NO_FETCH', 'No fetch implementation available.')

  const url = config.doubaoVisionEndpoint.replace(/\/+$/, '') + '/chat/completions'
  const userText = buildHistoryText(history) + `Current goal: ${goal}\nLook at the screenshot and plan the next 1-3 actions.`

  const body = {
    model: config.doubaoVisionModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotBase64}` } }
      ]}
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' }
  }

  const resp = await fetcher(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.doubaoVisionApiKey}` },
    body: JSON.stringify(body)
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new VisionPlannerError('VISION_HTTP_ERROR', `Doubao vision API ${resp.status}: ${text.slice(0, 200)}`)
  }
  const data = await resp.json().catch(() => null)
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new VisionPlannerError('VISION_NO_CONTENT', 'Doubao vision returned no content.')

  let parsed
  try { parsed = JSON.parse(content) }
  catch { throw new VisionPlannerError('VISION_JSON_INVALID', `Doubao vision returned non-JSON: ${String(content).slice(0, 200)}`) }
  if (!parsed || !Array.isArray(parsed.actions)) {
    throw new VisionPlannerError('VISION_JSON_INVALID', 'Doubao vision JSON missing actions array.')
  }
  return parsed
}

module.exports = { planNext, VisionPlannerError, SYSTEM_PROMPT }
```

- [ ] **Step 3:** Run + commit.

```bash
npx vitest run electron/__tests__/vision-planner.test.js
git add electron/services/visionPlanner.js electron/__tests__/vision-planner.test.js
git commit -m "feat(visionPlanner): Doubao 1.5 vision planner with JSON output and error taxonomy"
```

---

## Task 4: Internal observe + orchestrator branch

**Files:** `electron/services/taskOrchestrator.js`, `electron/__tests__/task-orchestrator.test.js`

- [ ] **Step 1:** Tests for the branching logic. Append to `task-orchestrator.test.js`:

```js
test('vision path: orchestrator observes + calls visionPlanner when visionLoopEnabled and task is web-shaped', async () => {
  const visionPlanner = { planNext: vi.fn(async () => ({
    actions: [{ runtime: 'midscene', type: 'web.click', payload: { target: '章节' }, risk: 'medium' }]
  })) }
  const fetchImpl = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, metadata: { screenshotBase64: 'XYZ' } })
  }))
  const broker = { submitActions: vi.fn(async (actions) => actions.map((a) => ({ ...a, status: 'pending' }))) }
  const orchestrator = createTaskOrchestrator({
    storeRef: { getConfig: () => ({
      visionLoopEnabled: true, dryRunEnabled: false,
      deepseekApiKey: 'sk', doubaoVisionApiKey: 'k',
      doubaoVisionEndpoint: 'https://x', doubaoVisionModel: 'm'
    }) },
    visionPlanner,
    fetchImpl,
    modelRouter: { jsonForRole: vi.fn() },  // should NOT be called
    broker,
    addRunOutput: vi.fn(),
    now: () => new Date('2026-05-09T00:00:00Z')
  })
  const result = await orchestrator.runExecutionTask({
    convId: 'sess', messages: [{ role: 'user', content: '帮我点击网页上的章节按钮' }]
  })
  expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/execute'), expect.anything())
  expect(visionPlanner.planNext).toHaveBeenCalled()
  expect(orchestrator).toBeDefined()  // sanity
  expect(broker.submitActions).toHaveBeenCalled()
})

test('vision path falls back to text planner when internalObserve throws', async () => {
  const visionPlanner = { planNext: vi.fn() }
  const fetchImpl = vi.fn(async () => { throw new Error('ECONNREFUSED') })
  const modelRouter = { jsonForRole: vi.fn(async () => ({
    actions: [{ runtime: 'open-interpreter', type: 'shell.command', payload: { command: 'ls' }, risk: 'low' }]
  })) }
  const broker = { submitActions: vi.fn(async (actions) => actions.map((a) => ({ ...a, status: 'completed' }))) }
  const events = []
  const orchestrator = createTaskOrchestrator({
    storeRef: { getConfig: () => ({
      visionLoopEnabled: true, dryRunEnabled: false,
      deepseekApiKey: 'sk', doubaoVisionApiKey: 'k',
      doubaoVisionEndpoint: 'https://x', doubaoVisionModel: 'm'
    }) },
    visionPlanner, fetchImpl, modelRouter, broker, addRunOutput: vi.fn(),
    now: () => new Date('2026-05-09T00:00:00Z')
  })
  await orchestrator.runExecutionTask({
    convId: 'sess',
    messages: [{ role: 'user', content: '帮我点击网页上的章节' }],
    onEvent: (event, payload) => events.push({ event, payload })
  })
  expect(modelRouter.jsonForRole).toHaveBeenCalled()
  expect(events.find((e) => e.event === 'chat:vision-fallback')).toBeTruthy()
})

test('text path: orchestrator skips vision when visionLoopEnabled=false', async () => {
  const visionPlanner = { planNext: vi.fn() }
  const modelRouter = { jsonForRole: vi.fn(async () => ({ actions: [] })) }
  const broker = { submitActions: vi.fn(async () => []) }
  const orchestrator = createTaskOrchestrator({
    storeRef: { getConfig: () => ({
      visionLoopEnabled: false, dryRunEnabled: false, deepseekApiKey: 'sk'
    }) },
    visionPlanner, modelRouter, broker, addRunOutput: vi.fn(),
    now: () => new Date('2026-05-09T00:00:00Z')
  })
  await orchestrator.runExecutionTask({ convId: 's', messages: [{ role: 'user', content: '帮我点击网页上的章节' }] })
  expect(visionPlanner.planNext).not.toHaveBeenCalled()
  expect(modelRouter.jsonForRole).toHaveBeenCalled()
})

test('text path: orchestrator skips vision for clearly non-web tasks even if visionLoopEnabled=true', async () => {
  const visionPlanner = { planNext: vi.fn() }
  const modelRouter = { jsonForRole: vi.fn(async () => ({ actions: [] })) }
  const broker = { submitActions: vi.fn(async () => []) }
  const orchestrator = createTaskOrchestrator({
    storeRef: { getConfig: () => ({
      visionLoopEnabled: true, dryRunEnabled: false, deepseekApiKey: 'sk',
      doubaoVisionApiKey: 'k', doubaoVisionEndpoint: 'https://x', doubaoVisionModel: 'm'
    }) },
    visionPlanner, modelRouter, broker, addRunOutput: vi.fn(),
    now: () => new Date('2026-05-09T00:00:00Z')
  })
  await orchestrator.runExecutionTask({ convId: 's', messages: [{ role: 'user', content: '运行 git status 命令' }] })
  expect(visionPlanner.planNext).not.toHaveBeenCalled()
  expect(modelRouter.jsonForRole).toHaveBeenCalled()
})
```

- [ ] **Step 2:** Modify `taskOrchestrator.js`:

```js
const visionPlannerModule = require('./visionPlanner')
const { normalizeActionPlan } = require('./actionPlanner')

const WEB_KEYWORDS = ['网页','网站','浏览器','登录','点击','打开','学习通','淘宝','GitHub','Gmail','钉钉','http','url','看视频','章节','课程','网页上的']
const NON_WEB_KEYWORDS = ['shell','命令','git','npm','python','执行 ','运行 ','文件','code','代码']

function looksLikeWebTask(latestUserMessage = '', messages = []) {
  const lower = String(latestUserMessage).toLowerCase()
  if (NON_WEB_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) return false
  if (WEB_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()) || latestUserMessage.includes(kw))) return true
  // Continuation cue → check if last assistant turn used midscene
  if (/^(继续|下一步|再来一次|登录好了|好了)$/.test(latestUserMessage.trim())) {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    if (lastAssistant && /midscene|web\./.test(String(lastAssistant.content || ''))) return true
  }
  return false
}

async function internalObserve(config, fetchImpl) {
  const fetcher = fetchImpl || global.fetch
  const endpoint = (config.midsceneEndpoint || 'http://127.0.0.1:8770').replace(/\/+$/, '')
  const r = await fetcher(`${endpoint}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      protocol: 'aionui.midscene.v1',
      actionId: `internal-observe-${Date.now()}`,
      sessionId: 'orchestrator',
      type: 'web.observe',
      payload: {},
      approved: true,
      createdAt: new Date().toISOString()
    })
  })
  if (!r.ok) throw new Error(`internalObserve HTTP ${r.status}`)
  const data = await r.json()
  if (!data?.metadata?.screenshotBase64) throw new Error('internalObserve returned no screenshot')
  return data.metadata.screenshotBase64
}

// Inside createTaskOrchestrator, accept visionPlanner + fetchImpl in overrides:
const deps = {
  storeRef: store,
  modelRouter,
  visionPlanner: visionPlannerModule,
  fetchImpl: global.fetch,
  dryRunRuntime,
  broker: getBroker(),
  addRunOutput,
  now: () => new Date(),
  ...overrides
}

// Inside runExecutionTask, replace the `proposals = ...` branch with:
const useVision = Boolean(config.visionLoopEnabled)
  && Boolean(config.doubaoVisionApiKey)
  && looksLikeWebTask(task, messages)

let proposals
let usedDryRun = false

if (dryRun || (config.dryRunEnabled !== false && !config.deepseekApiKey && !config.apiKey)) {
  const plan = deps.dryRunRuntime.planTask(task, { sessionId, cwd: config.workspace_root })
  proposals = plan.actions
  usedDryRun = true
} else if (useVision) {
  let screenshot = null
  try {
    screenshot = await internalObserve(config, deps.fetchImpl)
  } catch (err) {
    onEvent?.('chat:vision-fallback', { stage: 'observe', reason: err.message })
  }
  if (screenshot) {
    try {
      const raw = await deps.visionPlanner.planNext({
        goal: task, history: messages, screenshotBase64: screenshot, config
      })
      proposals = normalizeActionPlan(raw, { sessionId, now: deps.now() })
    } catch (err) {
      onEvent?.('chat:vision-fallback', { stage: 'plan', reason: err.message })
      proposals = await planWithModel(messages, config, sessionId)
    }
  } else {
    proposals = await planWithModel(messages, config, sessionId)
  }
} else {
  proposals = await planWithModel(messages, config, sessionId)
}
```

- [ ] **Step 3:** Run + commit.

```bash
npx vitest run electron/__tests__/task-orchestrator.test.js
git add electron/services/taskOrchestrator.js electron/__tests__/task-orchestrator.test.js
git commit -m "feat(orchestrator): vision-planner branch with internal observe + fallback to text planner"
```

---

## Task 5: Manual smoke test on 学习通

- [ ] **Step 1:** Hot-replace files into the install dir or rebuild + reinstall.

- [ ] **Step 2:** Manual scenario:

1. Open Chrome, log into 学习通, navigate to a course homepage (the page where the sidebar shows AI助教/任务/章节/...).
2. In AionUi say: "帮我打开章节列表然后点击第一个未完成的课时"
3. Verify orchestrator events show `chat:action-plan` with at least one `web.click` whose target description quotes specific visual elements present on the screenshot ("左侧侧边栏第三项 章节" or similar concrete phrase).
4. Approve the action(s).
5. Bridge executes; Chrome navigates to 章节 list.
6. Send "继续".
7. Verify a fresh observe + plan happens; vision planner now sees the 章节 list and proposes a click on the first orange-flagged row.

- [ ] **Step 3:** Append outcome to `docs/test-report.md` under a new "2026-05-09 Vision Planner Acceptance" section. PASS or FAIL with notes.

- [ ] **Step 4:** Final commit.

```bash
git add docs/test-report.md
git commit -m "docs(test-report): vision planner acceptance run"
```

---

## Definition of Done

- All new + modified tests pass: `npm test`.
- `npm run build:client` clean.
- `npm run build:bridges` clean (no changes here, but verify the script still runs).
- `npm run electron:build` produces a Windows installer.
- Acceptance scenario in Task 5 passes on the user's actual Chrome + 学习通 setup.
- DeepSeek text path still functional for non-web tasks (verified by existing tests still passing).
- `git diff main -- electron/services/openInterpreter/protocol.js electron/services/uiTars/protocol.js electron/services/midscene/protocol.js server/oi-bridge/translator.js server/uitars-bridge/translator.js server/midscene-bridge/translator.js` is empty (red-line files unchanged).
