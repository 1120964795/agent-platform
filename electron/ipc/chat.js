const { store } = require('../store')
const deepseek = require('../services/deepseek')
const tools = require('../tools')
const skillRegistry = require('../skills/registry')
const userRules = require('../services/userRules')

const BASE_PROMPT = 'You are AgentDev Lite, a student learning assistant. Answer concisely and professionally. Provide runnable examples when discussing code.'
const FULL_PROMPT = `${BASE_PROMPT}\n\nYou are in full permission mode. You may call local file, shell, skill, and document tools to actively complete the user task. Prefer load_skill() when a suitable skill exists.`
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
    ...overrides
  }
  return function register(ipcMain) {
    ipcMain.handle('chat:send', (evt, payload) => handleChatSend(evt, payload, deps))
  }
}

const register = createRegister()

module.exports = { BASE_PROMPT, FULL_PROMPT, REMEMBER_GUIDANCE, buildSystemPrompt, handleChatSend, createRegister, register }