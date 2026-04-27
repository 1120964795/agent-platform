const { store } = require('../store')
const deepseek = require('../services/deepseek')
const tools = require('../tools')
const skillRegistry = require('../skills/registry')
const userRules = require('../services/userRules')

const BASE_PROMPT = 'You are AgentDev Lite, a student learning assistant. Answer concisely and professionally. Provide runnable examples when discussing code. In default permission mode, you cannot access local files, run commands, or create documents. Never claim that a local file was generated, saved, opened, moved, or deleted unless a tool result explicitly confirms the path.'
const FULL_PROMPT = `${BASE_PROMPT}\n\nYou are in full permission mode. You may call local file, shell, skill, and document tools to actively complete the user task. Prefer load_skill() when a suitable skill exists. For generated files, report success only when the tool result includes a real path and bytes_written greater than zero; if a tool returns an error, clearly say the file was not generated. When generating Word documents, provide a complete outline with meaningful Chinese headings and paragraph-style Chinese content. Never call generate_docx with placeholder headings like Section 1 or empty content. When the user asks to save to a drive root such as D:\\, use the generated path returned by the tool, which may be under D:\\AgentDevLiteGenerated\\ to avoid Windows root-write restrictions.`
const REMEMBER_GUIDANCE = 'When the user expresses a durable future preference using wording like after this, always, next time, or from now on, call remember_user_rule. Do not remember one-off task details.'

function isCancelled(error, signal) {
  return signal?.aborted || error?.code === 'CHAT_CANCELLED' || error?.name === 'AbortError'
}

function throwIfCancelled(signal) {
  if (!signal?.aborted) return
  const error = new Error('生成已停止。')
  error.code = 'CHAT_CANCELLED'
  throw error
}

function makeTitle(messages) {
  const firstUser = messages.find((message) => message.role === 'user' && message.content)
  return firstUser?.content.slice(0, 24) || '新对话'
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
    .map((message) => ({ role: message.role, content: message.content }))
}

function persistConversation(deps, { convId, username, assistant = 'general', messages }) {
  if (!convId || typeof deps.storeRef?.upsertConversation !== 'function') return null

  const normalizedMessages = normalizeMessages(messages)
  const existing = typeof deps.storeRef.getConversation === 'function'
    ? deps.storeRef.getConversation(convId)
    : null
  const now = new Date().toISOString()
  const conversation = {
    id: convId,
    title: makeTitle(normalizedMessages) || existing?.title || '新对话',
    assistant: assistant || existing?.assistant || 'general',
    username: username || existing?.username || 'guest',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    messages: normalizedMessages
  }

  return deps.storeRef.upsertConversation(conversation)
}

function buildSystemPrompt(config, deps, username) {
  const parts = []
  const isFull = config.permissionMode === 'full'
  parts.push(isFull ? FULL_PROMPT : BASE_PROMPT)
  const rules = deps.userRules.buildSystemPromptSection(username)
  if (rules) parts.push(rules)
  if (isFull) {
    const skillIndex = deps.skillRegistry.buildSkillIndex(deps.skillRegistry.listSkills())
    if (skillIndex) parts.push(skillIndex)
    parts.push(REMEMBER_GUIDANCE)
  }
  return parts.join('\n\n')
}

async function handleChatSend(evt, payload = {}, deps) {
  const { convId, messages = [], username, assistant = 'general' } = payload
  const send = (event, data = {}) => evt.sender.send(event, { convId, ...data })
  const controller = new AbortController()
  const previous = deps.activeChats.get(convId)
  if (previous) previous.abort()
  deps.activeChats.set(convId, controller)
  const { signal } = controller
  const config = username ? deps.storeRef.getUserConfig(username) : deps.storeRef.getConfig()
  const isFull = config.permissionMode === 'full'
  const fullMessages = [{ role: 'system', content: buildSystemPrompt(config, deps, username) }, ...messages]
  let assistantContent = ''
  const sendDelta = (text) => {
    assistantContent += text
    send('chat:delta', { text })
  }
  const persistCurrentMessages = () => persistConversation(deps, {
    convId,
    username,
    assistant,
    messages: assistantContent
      ? [...messages, { role: 'assistant', content: assistantContent }]
      : messages
  })

  persistCurrentMessages()

  try {
    if (!isFull) {
      const result = await deps.deepseek.chat({ messages: fullMessages, config, stream: true, signal, onDelta: sendDelta })
      if (!assistantContent && result.content && !result._streamed) assistantContent = result.content
      throwIfCancelled(signal)
      persistCurrentMessages()
      send('chat:done', {})
      return { ok: true }
    }

    for (let iter = 0; iter < 10; iter += 1) {
      throwIfCancelled(signal)
      const response = await deps.deepseek.chat({
        messages: fullMessages,
        config,
        tools: deps.toolSchemas,
        stream: true,
        signal,
        onDelta: sendDelta
      })
      if (!assistantContent && response.content && !response._streamed) assistantContent = response.content
      throwIfCancelled(signal)
      fullMessages.push(response.assistant_message || { role: 'assistant', content: response.content || '' })
      const calls = response.tool_calls || []
      if (!calls.length) {
        persistCurrentMessages()
        send('chat:done', {})
        return { ok: true }
      }

      for (const call of calls) {
        throwIfCancelled(signal)
        send('chat:tool-start', { callId: call.id, name: call.name, args: call.args })
        const result = await deps.execute(call.name, call.args, {
          convId,
          username,
          signal,
          onLog: (stream, chunk) => send('chat:tool-log', { callId: call.id, stream, chunk })
        })
        throwIfCancelled(signal)
        if (result?.error) send('chat:tool-error', { callId: call.id, error: result.error })
        else send('chat:tool-result', { callId: call.id, result })
        if (call.name === 'load_skill' && !result?.error) send('chat:skill-loaded', { name: call.args.name })
        fullMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result), name: call.name })
      }
    }

    fullMessages.push({ role: 'system', content: 'Tool call limit reached. Summarize based on existing tool results.' })
    const result = await deps.deepseek.chat({ messages: fullMessages, config, stream: true, signal, onDelta: sendDelta })
    if (!assistantContent && result.content && !result._streamed) assistantContent = result.content
    throwIfCancelled(signal)
    persistCurrentMessages()
    send('chat:done', {})
    return { ok: true }
  } catch (error) {
    if (isCancelled(error, signal)) {
      send('chat:cancelled', {})
      return { ok: true, cancelled: true }
    }
    const code = error instanceof deps.DeepSeekError ? error.code : 'INTERNAL'
    send('chat:error', { error: { code, message: error.message || '未知错误' } })
    return { ok: true }
  } finally {
    if (deps.activeChats.get(convId) === controller) {
      deps.activeChats.delete(convId)
    }
  }
}

function createRegister(overrides = {}) {
  const activeChats = overrides.activeChats || new Map()
  const deps = {
    storeRef: store,
    deepseek,
    DeepSeekError: deepseek.DeepSeekError,
    execute: tools.execute,
    toolSchemas: tools.TOOL_SCHEMAS,
    skillRegistry,
    userRules,
    activeChats,
    ...overrides
  }
  return function register(ipcMain) {
    ipcMain.handle('chat:send', (evt, payload) => handleChatSend(evt, payload, deps))
    ipcMain.handle('chat:cancel', async (_evt, payload = {}) => {
      const controller = deps.activeChats.get(payload.convId)
      if (!controller) return { ok: true, cancelled: false }
      controller.abort()
      deps.activeChats.delete(payload.convId)
      return { ok: true, cancelled: true }
    })
  }
}

const register = createRegister()

module.exports = { BASE_PROMPT, FULL_PROMPT, REMEMBER_GUIDANCE, buildSystemPrompt, handleChatSend, createRegister, register, isCancelled }
