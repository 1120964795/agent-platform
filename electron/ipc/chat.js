const { store } = require('../store')
const deepseek = require('../services/deepseek')
const tools = require('../tools')
const skillRegistry = require('../skills/registry')
const userRules = require('../services/userRules')
const { createTaskOrchestrator } = require('../services/taskOrchestrator')

const BASE_PROMPT = '你是 AionUi，一个桌面控制平面助手。请默认使用简体中文，回答要简洁、专业。除非 AionUi 已报告审批通过的执行结果，否则不要暗示本地动作已经运行。'
const FULL_PROMPT = `${BASE_PROMPT}\n\n旧版完全权限工具仅作为兼容辅助。新的执行任务应使用执行模式，让 Qwen 提案经过 AionUi 策略、确认、适配器和审计日志。`
const REMEMBER_GUIDANCE = '当用户表达长期偏好，例如“以后”“始终”“下次”或“从现在开始”时，调用 remember_user_rule。不要记住一次性任务细节。'

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
      send('chat:error', { error: { code: error.code || 'EXECUTION_TASK_ERROR', message: error.message || '执行任务失败。' } })
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

    fullMessages.push({ role: 'system', content: '工具调用次数已达上限。请基于已有工具结果进行总结。' })
    await deps.deepseek.chat({ messages: fullMessages, stream: true, onDelta: (text) => send('chat:delta', { text }) })
    send('chat:done', {})
    return { ok: true }
  } catch (error) {
    const code = error instanceof deps.DeepSeekError ? error.code : 'INTERNAL'
    send('chat:error', { error: { code, message: error.message || '未知错误' } })
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
