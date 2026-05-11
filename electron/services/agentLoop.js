const MAX_STEPS = 30

function normalizeToolFailure(result) {
  if (!result || typeof result !== 'object') return null
  const rawError = result.error || (result.ok === false ? { code: 'TOOL_FAILED', message: result.summary || 'Tool returned ok:false.' } : null)
  if (!rawError) return null
  if (typeof rawError === 'string') {
    return { code: rawError.startsWith('BROWSER_TASK_INCOMPLETE') ? 'BROWSER_TASK_INCOMPLETE' : 'TOOL_ERROR', message: rawError }
  }
  return {
    code: rawError.code || (result.ok === false ? 'TOOL_FAILED' : 'TOOL_ERROR'),
    message: rawError.message || result.summary || 'Tool execution failed.',
    ...(rawError.detail ? { detail: rawError.detail } : {})
  }
}

function formatToolContent(result, failure) {
  const content = typeof result === 'string' ? result : JSON.stringify(result)
  if (!failure) return content
  return `ERROR: ${failure.code}: ${failure.message}\n${content}`
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function toolAttemptKey(call) {
  return `${call.name}:${stableStringify(call.args || {})}`
}

function getProvider(modelId, deps = {}) {
  const deepseek = deps.deepseek || require('./deepseek')
  const doubao = deps.doubao || require('./doubao')

  if (!modelId || modelId.startsWith('deepseek')) {
    return { model: modelId || 'deepseek-chat', chat: deepseek.chat }
  }
  if (modelId.startsWith('doubao') || modelId.startsWith('ep-')) {
    return { model: modelId.startsWith('ep-') ? modelId : undefined, chat: doubao.chat }
  }
  return { model: 'deepseek-chat', chat: deepseek.chat }
}

function createStreamEvent(type, patch = {}) {
  return {
    id: patch.id || `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    ts: patch.ts || Date.now(),
    ...patch,
  }
}

function latestUserContent(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user' && messages[index].content) return messages[index].content
  }
  return ''
}

function createForcedToolCall(forceTool, messages = []) {
  const supported = new Set(['browser_task', 'desktop_task'])
  if (!supported.has(forceTool)) return null
  const args = { goal: latestUserContent(messages) }
  const id = `forced-${forceTool.replace(/_/g, '-')}-${Date.now()}`
  return {
    id,
    name: forceTool,
    args,
    raw: {
      id,
      type: 'function',
      function: {
        name: forceTool,
        arguments: JSON.stringify(args)
      }
    }
  }
}

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

function parseJsonObject(value) {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function loadSkillNameFromToolCall(call) {
  const functionName = call?.function?.name || call?.name
  if (functionName !== 'load_skill') return null
  const args = call.args || parseJsonObject(call.function?.arguments)
  return args?.name || null
}

function toolMessageHasUsableSkillContent(content) {
  const text = String(content || '').trim()
  if (!text || text.startsWith('ERROR:') || text.startsWith('POLICY_BLOCKED') || text === 'USER_DENIED') return false
  const parsed = parseJsonObject(text)
  if (!parsed) return true
  if (parsed.error) return false
  if (Object.prototype.hasOwnProperty.call(parsed, 'content')) return Boolean(String(parsed.content || '').trim())
  if (parsed.already_loaded) return false
  return true
}

function historyHasPriorLoadedSkillContent(history, forcedSkill) {
  const loadSkillCallIds = new Set()
  for (const message of history) {
    const toolCalls = message?.tool_calls || message?.toolCalls
    if (message?.role === 'assistant' && Array.isArray(toolCalls)) {
      for (const call of toolCalls) {
        if (loadSkillNameFromToolCall(call) === forcedSkill) loadSkillCallIds.add(call.id)
      }
    }
    if (
      message?.role === 'tool' &&
      loadSkillCallIds.has(message.tool_call_id) &&
      toolMessageHasUsableSkillContent(message.content)
    ) {
      return true
    }
  }
  return false
}

function forcedSkillStopReason(forcedSkill, outcome, priorHistory) {
  if (!outcome) return 'skill load did not return a result.'
  if (outcome.failure) return outcome.failure.message || outcome.failure.code || 'skill load failed.'
  const result = outcome.result
  if (
    result &&
    typeof result === 'object' &&
    result.already_loaded &&
    !String(result.content || '').trim() &&
    !historyHasPriorLoadedSkillContent(priorHistory, forcedSkill)
  ) {
    return 'cached skill content is unavailable.'
  }
  return null
}

function summarizeToolResult(result, failure) {
  if (failure) return `${failure.code}: ${failure.message}`
  if (typeof result === 'string') return result.slice(0, 180)
  if (result?.summary) return String(result.summary).slice(0, 180)
  if (result?.final_url) return `完成，最终页面：${result.final_url}`
  return '工具已返回结果。'
}

async function runTurn({ messages, model, signal, onEvent, onStreamEvent, requestApproval, forceTool, forcedSkill, convId }, deps = {}) {
  const { model: selectedModel, chat } = getProvider(model, deps)
  const tools = deps.tools || require('../tools')
  const policy = deps.policy || require('../security/toolPolicy')
  const history = [...messages]
  const inFlight = new Set()
  const toolAttempts = new Map()
  const toolOutcomes = new Map()
  const emitStream = (type, patch = {}) => onStreamEvent?.(createStreamEvent(type, patch))

  signal?.addEventListener('abort', () => {
    for (const c of inFlight) c.abort()
  })

  async function processToolCall(call) {
    if (signal?.aborted) return { finalText: '操作已取消', history }
    const attemptKey = toolAttemptKey(call)
    const previousAttempt = toolAttempts.get(attemptKey)
    const attempt = (previousAttempt?.count || 0) + 1
    const retry = previousAttempt?.lastError ? { attempt, previousError: previousAttempt.lastError } : undefined

    const decision = policy.evaluateToolCall(call.name, call.args)
    if (decision.risk === 'blocked') {
      history.push({ role: 'tool', tool_call_id: call.id, content: `POLICY_BLOCKED: ${decision.reason}` })
      onEvent?.('tool_blocked', { call, reason: decision.reason })
      emitStream('tool_result', { tool: call.name, summary: `已阻止：${decision.reason}` })
      toolAttempts.set(attemptKey, { count: attempt, lastError: { code: 'POLICY_BLOCKED', message: decision.reason } })
      toolOutcomes.set(call.id, { failure: { code: 'POLICY_BLOCKED', message: decision.reason } })
      return null
    }

    emitStream('tool_start', {
      tool: call.name,
      summary: `准备调用 ${call.name}`,
    })

    if (decision.requiresApproval) {
      if (!requestApproval) {
        history.push({ role: 'tool', tool_call_id: call.id, content: `POLICY_BLOCKED: 需要用户审批但审批回调未提供 (${decision.reason})` })
        onEvent?.('tool_blocked', { call, reason: '审批回调缺失' })
        emitStream('tool_result', { tool: call.name, summary: `审批回调缺失：${decision.reason}` })
        toolAttempts.set(attemptKey, { count: attempt, lastError: { code: 'POLICY_BLOCKED', message: decision.reason } })
        toolOutcomes.set(call.id, { failure: { code: 'POLICY_BLOCKED', message: decision.reason } })
        return null
      }
      onEvent?.('approval_request', { call, decision, ...(retry ? { retry } : {}) })
      const ok = await requestApproval({ call, decision, retry })
      if (!ok) {
        history.push({ role: 'tool', tool_call_id: call.id, content: 'USER_DENIED' })
        emitStream('tool_result', { tool: call.name, summary: '用户拒绝执行。' })
        toolAttempts.set(attemptKey, { count: attempt, lastError: { code: 'USER_DENIED', message: 'User denied tool execution.' } })
        toolOutcomes.set(call.id, { failure: { code: 'USER_DENIED', message: 'User denied tool execution.' } })
        return null
      }
    }

    const ctl = new AbortController()
    inFlight.add(ctl)
    try {
      emitStream('tool_progress', {
        tool: call.name,
        summary: `${call.name} 正在执行。`,
      })

      const result = await tools.execute(call.name, call.args, { signal: ctl.signal, skipInternalConfirm: true, convId })
      const failure = normalizeToolFailure(result)
      const content = formatToolContent(result, failure)
      history.push({ role: 'tool', tool_call_id: call.id, content })
      if (failure) {
        toolAttempts.set(attemptKey, { count: attempt, lastError: { code: failure.code, message: failure.message } })
        toolOutcomes.set(call.id, { result, failure })
        onEvent?.('tool_error', { call, error: failure, result })
        emitStream('tool_result', { tool: call.name, summary: summarizeToolResult(result, failure) })
      } else {
        toolAttempts.set(attemptKey, { count: attempt })
        toolOutcomes.set(call.id, { result, failure: null })
        onEvent?.('tool_result', { call, result })
        emitStream('tool_result', { tool: call.name, summary: summarizeToolResult(result) })
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        history.push({ role: 'tool', tool_call_id: call.id, content: 'CANCELLED' })
        return { finalText: '操作已取消', history }
      }
      const error = { code: err.code || 'TOOL_ERROR', message: err.message }
      history.push({ role: 'tool', tool_call_id: call.id, content: `ERROR: ${err.message}` })
      toolAttempts.set(attemptKey, { count: attempt, lastError: error })
      toolOutcomes.set(call.id, { failure: error })
      onEvent?.('tool_error', { call, error })
      emitStream('tool_result', { tool: call.name, summary: summarizeToolResult(null, error) })
    } finally {
      inFlight.delete(ctl)
    }
    return null
  }

  const forcedSkillCall = createForcedSkillCall(forcedSkill)
  if (forcedSkillCall) {
    const historyBeforeForcedSkill = [...history]
    emitStream('reasoning_summary', {
      text: `Loading skill ${forcedSkill} before continuing.`,
    })
    history.push({ role: 'assistant', content: null, tool_calls: [forcedSkillCall.raw] })
    onEvent?.('assistant_message', { content: '', toolCalls: [forcedSkillCall] })
    const forcedSkillResult = await processToolCall(forcedSkillCall)
    if (forcedSkillResult) return forcedSkillResult
    const stopReason = forcedSkillStopReason(forcedSkill, toolOutcomes.get(forcedSkillCall.id), historyBeforeForcedSkill)
    if (stopReason) {
      return { finalText: `Unable to load forced skill ${forcedSkill}: ${stopReason}`, history }
    }
  }

  const forcedCall = createForcedToolCall(forceTool, history)
  if (forcedCall) {
    emitStream('reasoning_summary', {
      text: '我正在判断用户意图，并将这条消息交给浏览器任务执行。',
    })
    history.push({ role: 'assistant', content: null, tool_calls: [forcedCall.raw] })
    onEvent?.('assistant_message', { content: '', toolCalls: [forcedCall] })
    const forcedResult = await processToolCall(forcedCall)
    if (forcedResult) return forcedResult
  }

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal?.aborted) {
      return { finalText: '操作已取消', history }
    }

    emitStream('reasoning_summary', {
      text: '我正在判断当前对话状态，并准备需要的工具或最终回复。',
    })

    const response = await chat({
      model: selectedModel,
      messages: history,
      tools: tools.getAgentLoopToolSchemas(),
      signal
    })

    history.push(response.assistant_message)
    onEvent?.('assistant_message', { content: response.content, toolCalls: response.tool_calls })

    if (!response.tool_calls?.length) {
      return { finalText: response.content || '已完成', history }
    }

    for (const call of response.tool_calls) {
      const toolResult = await processToolCall(call)
      if (toolResult) return toolResult
    }
  }

  return { finalText: '已达 30 步上限', history }
}

module.exports = { runTurn, MAX_STEPS, getProvider, createStreamEvent }
