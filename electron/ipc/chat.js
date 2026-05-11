const { store } = require('../store')
const deepseek = require('../services/deepseek')
const tools = require('../tools')
const skillRegistry = require('../skills/registry')
const userRules = require('../services/userRules')
const { runTurn } = require('../services/agentLoop')
const { requestConfirm } = require('../confirm')
const desktopCursorOverlay = require('../services/desktopCursorOverlay')
const {
  CONFIRMATION_TIMEOUT_MS,
  classifyConfirmationReply,
  buildConfirmationPrompt,
  buildPendingExplanation,
  buildNoPendingMessage,
  buildMissingSkillMessage
} = require('./chatConfirmation')

const BASE_PROMPT = '你是 AionUi，一个桌面控制平面助手。请默认使用简体中文，回答要简洁、专业。所有用户输入都在同一个 Agent Loop 中处理：普通问题直接回答，需要本地、浏览器或桌面操作时再调用工具。除非 AionUi 已报告审批通过的执行结果，否则不要暗示本地动作已经运行。'
const FULL_PROMPT = `${BASE_PROMPT}\n\n当前配置允许兼容工具进入候选集，但所有执行仍必须经过 AionUi 策略、确认、适配器和审计日志。`
const REMEMBER_GUIDANCE = '当用户表达长期偏好，例如”以后””始终””下次”或”从现在开始”时，调用 remember_user_rule。不要记住一次性任务细节。'
const TOOL_CALL_RULES = `
## 工具调用规则（必须遵守）

当用户请求涉及以下操作时，你**必须调用对应的工具函数**，
**绝对不要用文字描述来代替工具调用**：

| 用户意图 | 必须调用的工具 |
|---------|-------------|
| 打开网页/浏览网站/点击页面 | \`browser_task\` |
| 截屏/观察屏幕 | \`desktop_observe\` |
| 点击桌面/鼠标操作 | \`desktop_click\` |
| 输入文字/键盘操作 | \`desktop_type\` |
| 执行命令/运行脚本 | \`run_shell_command\` |
| 读写文件 | \`file_read\` / \`file_write\` |
| 生成文档/PPT | \`generate_document\` |

如果用户说”帮我打开X”或”点击X”，你不能回复”好的我来做”然后什么都不做。
你必须调用对应工具。工具执行结果会返回给你，你再据此回复用户。`
const pendingConfirmations = new Map()
const activeControllers = new Map()
const pendingDesktopQuestions = new Map()

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

function clearPendingDesktopQuestion(convId, reason = 'cleared') {
  const pending = pendingDesktopQuestions.get(convId)
  if (!pending) return false
  pendingDesktopQuestions.delete(convId)
  pending.send?.('chat:desktop-ask-cleared', { reason })
  pending.resolve('')
  return true
}

function settlePendingDesktopQuestion(convId, answer) {
  const pending = pendingDesktopQuestions.get(convId)
  if (!pending) return false
  pendingDesktopQuestions.delete(convId)
  pending.send?.('chat:desktop-ask-cleared', { reason: 'answered' })
  pending.resolve(String(answer || ''))
  return true
}

function sendPendingClarification(send, pending) {
  const assistantText = buildPendingExplanation(pending)
  send('chat:delta', { text: assistantText })
  send('chat:done', {})
  return { ok: true, status: 'clarification', assistantText }
}

function hasUsefulSkillLoadResult(result) {
  if (!result || result.error) return false
  if (typeof result === 'string') return Boolean(result.trim())
  if (typeof result !== 'object') return true

  const content = String(result.content || '').trim()
  if (result.already_loaded) return Boolean(content)
  if (Object.prototype.hasOwnProperty.call(result, 'content')) return Boolean(content)
  return true
}

async function handleConfirmationReply(evt, payload = {}) {
  const { convId, message = '' } = payload
  const pending = pendingConfirmations.get(convId)
  if (!pending) return { ok: true, status: 'missing', assistantText: buildNoPendingMessage() }

  if (typeof payload.approved === 'boolean') {
    settlePendingConfirmation(convId, payload.approved, payload.approved ? 'confirmed' : 'rejected')
    return { ok: true, status: payload.approved ? 'confirmed' : 'rejected' }
  }

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

function buildSystemPrompt(config, deps) {
  const parts = []
  const isFull = config.permissionMode === 'full'
  parts.push(isFull ? FULL_PROMPT : BASE_PROMPT)
  parts.push(TOOL_CALL_RULES)
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
  const { convId, messages = [], model, pluginMode, forcedSkill } = payload
  const send = (event, data = {}) => evt.sender.send(event, { convId, ...data })
  let usedDesktopOverlay = false
  const getOverlay = () => deps.desktopCursorOverlay?.getDesktopCursorOverlay?.() || desktopCursorOverlay.getDesktopCursorOverlay?.()
  const handleDesktopEvents = (result) => {
    const events = result?.metadata?.events || result?.events || []
    if (!events.length) return
    const overlay = getOverlay()
    if (!overlay) return
    usedDesktopOverlay = true
    overlay.show?.()
    for (const event of events) overlay.handleEvent?.(event)
  }
  const hideDesktopOverlaySoon = () => {
    if (!usedDesktopOverlay) return
    const overlay = getOverlay()
    const timer = setTimeout(() => overlay?.hide?.(), 1200)
    timer.unref?.()
  }
  if (payload.desktopAskReply) {
    const ok = settlePendingDesktopQuestion(convId, payload.message || '')
    return ok
      ? { ok: true, status: 'desktop-ask-replied' }
      : { ok: true, status: 'missing-desktop-ask' }
  }
  if (payload.confirmationReply) {
    return handleConfirmationReply(evt, payload)
  }
  const pendingConfirmation = pendingConfirmations.get(convId)
  if (pendingConfirmation) {
    return sendPendingClarification(send, pendingConfirmation)
  }
  const config = deps.storeRef.getConfig()
  const ctl = new AbortController()
  activeControllers.set(convId, ctl)
  const forceTool = pluginMode === 'browser'
    ? 'browser_task'
    : (pluginMode === 'desktop' ? 'desktop_task' : undefined)
  const agentMessages = [
    { role: 'system', content: buildSystemPrompt(config, deps) },
    ...messages.filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
  ]
  let sentText = ''

  const sendDelta = (text) => {
    if (!text) return
    sentText += text
    send('chat:delta', { text })
  }

  if (forcedSkill && typeof deps.skillRegistry.findSkill === 'function' && !deps.skillRegistry.findSkill(forcedSkill)) {
    sendDelta(buildMissingSkillMessage(forcedSkill, deps.skillRegistry.listSkills()))
    send('chat:done', {})
    activeControllers.delete(convId)
    return { ok: true }
  }

  try {
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
      onEvent: (type, data) => {
        if (type === 'assistant_message') {
          sendDelta(data.content)
          if (data.toolCalls?.length) {
            for (const call of data.toolCalls) {
              send('chat:tool-start', { callId: call.id, name: call.name, args: call.args })
            }
          }
        } else if (type === 'tool_result') {
          send('chat:tool-result', { callId: data.call.id, result: data.result })
          if (data.call.name === 'desktop_task') handleDesktopEvents(data.result)
          if (data.call.name === 'load_skill' && hasUsefulSkillLoadResult(data.result)) {
            send('chat:skill-loaded', { name: data.call.args.name })
          }
        } else if (type === 'desktop_event') {
          send('chat:desktop-event', { event: data.event })
          const overlay = getOverlay()
          if (overlay) {
            usedDesktopOverlay = true
            overlay.show?.()
            overlay.handleEvent?.(data.event)
          }
        } else if (type === 'tool_error') {
          send('chat:tool-error', { callId: data.call.id, error: data.error })
        } else if (type === 'tool_blocked') {
          send('chat:tool-error', { callId: data.call.id, error: { code: 'POLICY_BLOCKED', message: data.reason } })
        } else if (type === 'approval_request') {
          send('chat:tool-start', { callId: data.call.id, name: data.call.name, args: data.call.args, needsApproval: true, decision: data.decision, ...(data.retry ? { retry: data.retry } : {}) })
        }
      },
      waitForDesktopUser: async (request) => {
        send('chat:desktop-ask', { request })
        sendDelta(`\n${request.question || 'Computer Use needs your input.'}\n`)
        return await new Promise((resolve) => {
          pendingDesktopQuestions.set(convId, { request, resolve, send })
        })
      },
      requestApproval: async ({ call, decision, retry }) => {
        clearPendingConfirmation(convId, 'replaced')
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
    })

    const finalText = result.finalText || ''
    if (finalText && !sentText.trimEnd().endsWith(finalText.trim())) sendDelta(finalText)
    send('chat:done', {})
    hideDesktopOverlaySoon()
    return { ok: true }
  } catch (error) {
    const code = error instanceof deps.DeepSeekError ? error.code : 'INTERNAL'
    send('chat:error', { error: { code, message: error.message || '未知错误' } })
    getOverlay()?.hide?.()
    clearPendingDesktopQuestion(convId, 'error')
    return { ok: true }
  } finally {
    activeControllers.delete(convId)
    clearPendingConfirmation(convId, 'run-ended')
    clearPendingDesktopQuestion(convId, 'run-ended')
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
    runTurn,
    requestConfirm,
    ...overrides
  }
  return function register(ipcMain) {
    ipcMain.handle('chat:send', (evt, payload) => handleChatSend(evt, payload, deps))
    ipcMain.handle('chat:approve-tool', async () => ({ ok: false, error: { code: 'DEPRECATED', message: 'Use chat confirmation replies.' } }))
    ipcMain.handle('chat:abort', async (_evt, payload = {}) => {
      const ctl = activeControllers.get(payload.convId)
      if (ctl) ctl.abort()
      clearPendingConfirmation(payload.convId, 'aborted')
      clearPendingDesktopQuestion(payload.convId, 'aborted')
      deps.desktopCursorOverlay?.getDesktopCursorOverlay?.()?.hide?.()
      return { ok: true }
    })
  }
}

const register = createRegister()

module.exports = { BASE_PROMPT, FULL_PROMPT, REMEMBER_GUIDANCE, TOOL_CALL_RULES, buildSystemPrompt, handleChatSend, createRegister, register }
