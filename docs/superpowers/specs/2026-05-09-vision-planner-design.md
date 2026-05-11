# Vision Planner + Observe-Act Loop Design

- Date: 2026-05-09
- Status: Approved (for codex execution)
- Audience: codex (executor)
- Supersedes: nothing — additive feature

## 0. Why

Current architecture's planner is **DeepSeek-V4, text-only**. It produces a one-shot
plan based on the user's goal text alone. After the first action runs, DeepSeek has
no idea what the page actually looks like, so subsequent steps are guesses or stop
entirely. Symptoms users hit repeatedly:

- "我已登录，继续看视频" → DeepSeek plans only `web.observe` then stops
- DeepSeek hardcoded to think 学习通 has cards on homepage → user's actual page is
  different layout → vision model can't find the target → action fails

The fundamental fix used by Anthropic Computer Use, OpenAI Operator, ByteDance
UI-TARS, and Browser-Use is the **observe-act loop**: the planner is a vision
model that sees the current screen on every iteration and decides the next 1-3
actions. This spec adds that loop, using Doubao 1.5 vision (Volcengine Ark) which
the user already has configured.

## 1. End-state architecture

```
runExecutionTask(messages):
  config = store.getConfig()
  if config.visionLoopEnabled and task is web-shaped:
    observation = await internalObserve()  # web.observe through broker, returns base64 PNG
    proposals = await visionPlanner.planNext(goal=lastUserMsg, history=messages, screenshot=base64)
  else:
    proposals = await planWithModel(messages, config)  # existing DeepSeek text path
  submitted = await broker.submitActions(proposals)
  ...
```

**Per-turn flow when vision loop is on:**

1. User sends message ("继续打开形势与政策的课程")
2. Orchestrator dispatches an internal `web.observe` action — low risk, auto-approved by broker, midscene-bridge returns base64 PNG of current Chrome tab
3. Orchestrator builds a vision prompt: system rules + user goal (latest message) + conversation history (text only, no prior screenshots) + current screenshot (single image)
4. Doubao 1.5 vision returns JSON `{ "actions": [...] }` with 1-3 next actions
5. Submitted through broker as before — medium/high risk wait for user approval
6. User approves → executes → next turn user says "继续" → loop iterates with NEW observation

**Why one screenshot per turn (not full image history):**

- Token budget: a 2048×962 PNG is ~150KB → ~2-4k tokens. Stacking 5+ images blows context.
- Doubao's vision context window is generous but cost compounds.
- The current screen is what matters; old screens are stale.
- History stays as text (action descriptions + outcomes) so the model knows what's been tried.

## 2. Components

### 2.1 NEW `electron/services/visionPlanner.js`

```js
async function planNext({ goal, history, screenshotBase64, config })
  → { actions: [...] }  // same shape as DeepSeek planner output
```

- Calls Doubao 1.5 vision via OpenAI-compatible API at `config.doubaoVisionEndpoint` with key `config.doubaoVisionApiKey` and model `config.doubaoVisionModel`.
- Single-image format: `messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: [ { type: 'text', text: goalAndHistoryText }, { type: 'image_url', image_url: { url: 'data:image/png;base64,' + screenshotBase64 } } ] }]`
- `response_format: { type: 'json_object' }` to force JSON.
- Returns parsed object with `actions: [ActionProposal]` shape — reuses `normalizeActionPlan` from existing actionPlanner.js so risk/policy classification stays identical.
- On parse failure: throw `VisionPlannerError` with `code: 'VISION_JSON_INVALID'`. Caller catches and falls back to text planner.

System prompt key directives:
- "You are looking at a screenshot of the user's current Chrome tab. Plan the NEXT 1-3 actions to make progress toward their goal."
- "Output JSON only: `{ \"actions\": [...] }`. Use the action types and runtimes from the schema below." — reuse the action-type catalog from existing actionPlanner.js (web.navigate / web.observe / web.click / web.type / web.query etc.)
- "If the goal looks done from the screenshot, return `{ \"actions\": [] }` and the orchestrator will stop."
- "Use concrete locator phrases — describe what you SEE, not what you think should be there. e.g. 'left sidebar item with text 章节, 4th from top' rather than 'navigation menu'."

### 2.2 MODIFY `electron/services/taskOrchestrator.js`

Add `runWithVisionLoop({ messages, config, sessionId, onEvent })`:

```js
async function internalObserve(config) {
  // Direct HTTP call to midscene-bridge's /execute, NOT through broker —
  // broker would add audit log entries for an internal observe; we don't want noise.
  const endpoint = config.midsceneEndpoint || 'http://127.0.0.1:8770'
  const r = await fetch(endpoint + '/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      protocol: 'aionui.midscene.v1',
      actionId: 'internal-observe-' + Date.now(),
      sessionId: 'orchestrator',
      type: 'web.observe',
      payload: {},
      approved: true,
      createdAt: new Date().toISOString()
    })
  })
  if (!r.ok) throw new Error(`internalObserve HTTP ${r.status}`)
  const data = await r.json()
  if (!data.metadata?.screenshotBase64) throw new Error('internalObserve returned no screenshot')
  return data.metadata.screenshotBase64
}
```

Branch in runExecutionTask:

```js
const useVision = Boolean(config.visionLoopEnabled) && looksLikeWebTask(task, messages)
let proposals
if (useVision) {
  let screenshot
  try { screenshot = await internalObserve(config) }
  catch (err) {
    // Fallback to text path on observe failure
    onEvent?.('chat:vision-fallback', { reason: err.message })
    proposals = await planWithModel(messages, config, sessionId)
  }
  if (screenshot) {
    try {
      proposals = await deps.visionPlanner.planNext({
        goal: lastUserMessage(messages),
        history: messages,
        screenshotBase64: screenshot,
        config
      })
      proposals = normalizeActionPlan(proposals, { sessionId, now: deps.now() })
    } catch (err) {
      onEvent?.('chat:vision-fallback', { reason: err.message })
      proposals = await planWithModel(messages, config, sessionId)
    }
  }
} else {
  proposals = await planWithModel(messages, config, sessionId)
}
```

`looksLikeWebTask(task, messages)`: simple keyword test — true if any of these in latest user message OR latest assistant message ran a midscene action: 网页/网站/浏览器/登录/学习通/淘宝/url/http/click/打开...的页面/网页 or last assistant turn already used midscene runtime. Conservative — false → text path. Avoid web mode for clear shell/file/code tasks.

### 2.3 MODIFY `electron/store.js`

Add: `visionLoopEnabled: true` (default ON since we want this to be the new normal).

### 2.4 MODIFY `electron/services/actionPlanner.js`

Export `normalizeActionPlan` already done. Add a small helper `getActionSchemaForVisionPrompt()` returning the action-type catalog string used in the vision system prompt — keeps the catalog in one place.

## 3. Behaviour edge cases

| Case | Behaviour |
|---|---|
| Doubao vision API down | catch, fall back to DeepSeek text planner, log |
| Doubao returns invalid JSON | `VisionPlannerError`, fall back to text planner |
| Doubao returns `{ actions: [] }` | orchestrator returns "目标看起来已经完成。" to user |
| midscene-bridge offline (no observe possible) | catch, fall back to text planner |
| Screenshot too large (>5MB base64) | downsample server-side: midscene-bridge already passes through screenshot-desktop output; ok at default. If issues surface, add a `web.observe { downsample: 0.5 }` payload variant — out of scope for v1. |
| User has no Doubao key | `looksLikeWebTask=true` but `config.doubaoVisionApiKey` empty → fall back silently to text planner with a warning event |
| User toggles `visionLoopEnabled=false` | always use text planner (current behavior) |

## 4. Cost / token budget

- Doubao vision input: 2048×962 PNG ≈ 1.5-2k vision tokens + ~500 text tokens for system+user. Output ~300 tokens.
- Per-turn cost on Volcengine Ark (doubao-1-5-thinking-vision-pro): ~¥0.02-0.05 per call.
- For a 5-turn login+navigate+watch sequence: ~¥0.15. Negligible for personal use.

## 5. Definition of Done

- `visionLoopEnabled` toggle visible (settings field; UI exposure can be a follow-up — for now editing store.json is acceptable since default is true).
- All existing tests pass.
- New unit tests cover:
  - `visionPlanner.planNext` returns proposals when API succeeds (mocked HTTP)
  - `visionPlanner.planNext` throws `VisionPlannerError` on invalid JSON (mocked)
  - `taskOrchestrator` falls back to text planner when internalObserve throws (mocked)
  - `taskOrchestrator` uses vision path when `visionLoopEnabled=true` and task looks web-shaped
  - `taskOrchestrator` uses text path when `visionLoopEnabled=false`
- Manual smoke test on the user's 学习通 page:
  1. User on 学习通 course homepage, says "帮我打开章节列表然后点击第一个未完成的课时"
  2. Orchestrator observes → vision planner sees the actual sidebar → produces `web.click "章节"` (concrete locator from screenshot) + `web.click "第一个橙色感叹号标记的课时"`
  3. User approves → Midscene's per-action vision finds + clicks the elements
  4. Loop on next user "继续" — orchestrator observes the new page (now 章节 list), vision planner sees orange-flagged rows, plans clicks accordingly

## 6. Red lines

1. Do **not** modify the existing DeepSeek text-planner path's behaviour — it must remain functionally identical for non-web tasks. Add the vision path **alongside** it.
2. Do **not** sneak screenshots into the audit log via the broker for the **internal** observe call — `internalObserve` bypasses the broker on purpose. User-visible observes (when user explicitly says "看一下页面") still go through the broker as today.
3. Doubao vision API key is `config.doubaoVisionApiKey` — same field uitars-bridge already uses. Do not add a new field.
4. Default `visionLoopEnabled = true`. The toggle exists for fallback, not for hiding the feature.
5. Vision planner must return JSON in the exact shape `normalizeActionPlan` expects (`{ actions: [...] }`). Use `normalizeActionPlan` to validate — don't reimplement validation.
