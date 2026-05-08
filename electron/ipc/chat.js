const { store } = require('../store')
const deepseek = require('../services/deepseek')
const tools = require('../tools')
const skillRegistry = require('../skills/registry')
const userRules = require('../services/userRules')
const { createTaskOrchestrator } = require('../services/taskOrchestrator')

const BASE_PROMPT = 'You are AionUi, a desktop control-plane assistant. Answer concisely and professionally. Do not imply local actions have run unless AionUi reports approved execution results.'
const FULL_PROMPT = `${BASE_PROMPT}\n\nLegacy full permission tools are compatibility helpers. For new execution tasks, use Execute mode so Qwen proposals pass through AionUi policy, confirmations, adapters, and audit logs.`
const REMEMBER_GUIDANCE = 'When the user expresses a durable future preference using wording like after this, always, next time, or from now on, call remember_user_rule. Do not remember one-off task details.'

function buildSystemPrompt(config, deps) {
  const parts = []
  const isFull = config.permissionMode === 'full'
  parts.push(isFull ? FULL_PROMPT : BASE_PROMPT)
  const rules = deps.userRules.buildSystemPromptSection()
  if (rules) parts.push(rules)
  if (isFull) {
    const skillIndex = deps.skillRegistry.buildSkillIndex(deps.skillRegistry.listSkills())
    if (skillIndex) parts.push(skillIndex)
    parts.push(REMEMBER_GUIDANCE)
  }
  return parts.join('\n\n')
}

async function handleChatSend(evt, payload = {}, deps) {
  const { convId, messages = [] } = payload
  const send = (event, data = {}) => evt.sender.send(event, { convId, ...data })
  const config = deps.storeRef.getConfig()
  if (payload.mode === 'execute') {
    try {
      const result = await deps.taskOrchestrator.runExecutionTask({
        convId,
        messages,
        dryRun: Boolean(payload.dryRun),
        onEvent: (event, data) => send(event, data)
      })
      send('chat:delta', { text: result.content })
      send('chat:done', {})
      return { ok: true }
    } catch (error) {
      send('chat:error', { error: { code: error.code || 'EXECUTION_TASK_ERROR', message: error.message || 'Execution task failed.' } })
      return { ok: true }
    }
  }
  const isFull = config.permissionMode === 'full'
  const fullMessages = [{ role: 'system', content: buildSystemPrompt(config, deps) }, ...messages]

  try {
    if (!isFull) {
      const result = await deps.deepseek.chat({ messages: fullMessages, stream: true, onDelta: (text) => send('chat:delta', { text }) })
      if (result.content && !result._streamed) {
        // chat() streams through onDelta; this branch is for mocked implementations.
      }
      send('chat:done', {})
      return { ok: true }
    }

    for (let iter = 0; iter < 10; iter += 1) {
      const response = await deps.deepseek.chat({
        messages: fullMessages,
        tools: deps.toolSchemas,
        stream: true,
        onDelta: (text) => send('chat:delta', { text })
      })
      fullMessages.push(response.assistant_message || { role: 'assistant', content: response.content || '' })
      const calls = response.tool_calls || []
      if (!calls.length) {
        send('chat:done', {})
        return { ok: true }
      }

      for (const call of calls) {
        send('chat:tool-start', { callId: call.id, name: call.name, args: call.args })
        const result = await deps.execute(call.name, call.args, {
          convId,
          onLog: (stream, chunk) => send('chat:tool-log', { callId: call.id, stream, chunk })
        })
        if (result?.error) send('chat:tool-error', { callId: call.id, error: result.error })
        else send('chat:tool-result', { callId: call.id, result })
        if (call.name === 'load_skill' && !result?.error) send('chat:skill-loaded', { name: call.args.name })
        fullMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result), name: call.name })
      }
    }

    fullMessages.push({ role: 'system', content: 'Tool call limit reached. Summarize based on existing tool results.' })
    await deps.deepseek.chat({ messages: fullMessages, stream: true, onDelta: (text) => send('chat:delta', { text }) })
    send('chat:done', {})
    return { ok: true }
  } catch (error) {
    const code = error instanceof deps.DeepSeekError ? error.code : 'INTERNAL'
    send('chat:error', { error: { code, message: error.message || 'Unknown error' } })
    return { ok: true }
  }
}

function createRegister(overrides = {}) {
  const deps = {
    storeRef: store,
    deepseek,
    DeepSeekError: deepseek.DeepSeekError,
    execute: tools.execute,
    toolSchemas: tools.TOOL_SCHEMAS,
    skillRegistry,
    userRules,
    taskOrchestrator: createTaskOrchestrator(),
    ...overrides
  }
  return function register(ipcMain) {
    ipcMain.handle('chat:send', (evt, payload) => handleChatSend(evt, payload, deps))
  }
}

const register = createRegister()

module.exports = { BASE_PROMPT, FULL_PROMPT, REMEMBER_GUIDANCE, buildSystemPrompt, handleChatSend, createRegister, register }
