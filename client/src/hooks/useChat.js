import { useReducer, useCallback, useRef, useEffect, useMemo } from 'react'
import { api } from '../lib/api.js'

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

const initialState = { messages: [], streaming: false }

function reducer(state, action) {
  switch (action.type) {
    case 'ADD':
      return { ...state, messages: [...state.messages, action.msg] }
    case 'APPEND_DELTA': {
      let matched = false
      const messages = state.messages.map((message) => {
        if (message.id !== action.id) return message
        matched = true
        return { ...message, content: (message.content || '') + action.delta, streaming: true }
      })
      return matched ? { ...state, streaming: true, messages } : state
    }
    case 'FINISH':
      return { ...state, streaming: false, messages: state.messages.map((message) => message.id === action.id ? { ...message, streaming: false } : message) }
    case 'UPDATE_CARD':
      return { ...state, messages: state.messages.map((message) => message.id === action.id ? { ...message, cardState: action.cardState, cardData: action.cardData ?? message.cardData } : message) }
    case 'UPDATE_TOOL':
      return {
        ...state,
        messages: state.messages.map((message) => {
          if (message.id !== action.id) return message
          const logs = action.log ? [...(message.logs || []), action.log] : message.logs
          return { ...message, ...action.patch, logs }
        })
      }
    case 'LOAD':
      return { ...initialState, messages: action.messages }
    case 'CLEAR':
      return initialState
    default:
      return state
  }
}

const DEFAULT_ASSISTANT = 'general'

function makeTitle(messages) {
  const firstUser = messages.find((message) => message.role === 'user' && message.content)
  return firstUser?.content.slice(0, 24) || '新对话'
}

function makeConversationId(username, assistant = DEFAULT_ASSISTANT) {
  const userKey = encodeURIComponent(username || 'guest')
  const assistantKey = encodeURIComponent(assistant || DEFAULT_ASSISTANT)
  return `${assistantKey}:user:${userKey}:default`
}

function toDisplayMessages(messages) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      id: uid(),
      role: message.role,
      content: message.content
    }))
}

function chatErrorMessage(error) {
  if (error?.code === 'DEEPSEEK_AUTH') {
    if (/not configured/i.test(error.message || '')) {
      return '请先在设置中配置 DeepSeek API Key，然后再发送消息。'
    }
    return 'DeepSeek API Key 验证失败，请在设置中检查 Key 是否正确。'
  }

  if (error?.code === 'DEEPSEEK_RATE_LIMIT') {
    return 'DeepSeek 请求过于频繁，请稍后再试。'
  }

  if (error?.code === 'DEEPSEEK_TIMEOUT') {
    return '模型响应超时，请稍后重试。'
  }

  if (error?.code === 'DEEPSEEK_NETWORK') {
    return '网络连接失败，请检查网络或接口地址设置后重试。'
  }

  return `请求失败：${error?.message || '未知错误'}`
}

export function useChat({ username, assistant = DEFAULT_ASSISTANT, conversationId, onConversationSaved } = {}) {
  const activeConversationId = useMemo(
    () => conversationId || makeConversationId(username, assistant),
    [conversationId, username, assistant]
  )
  const [state, dispatch] = useReducer(reducer, initialState)
  const activeStreamRef = useRef(null)
  const conversationIdRef = useRef(activeConversationId)
  const toolMessageIdsRef = useRef(new Map())

  const closeActiveStream = useCallback(({ notify = false, cancel = true } = {}) => {
    const active = activeStreamRef.current
    if (!active) return

    activeStreamRef.current = null
    if (cancel) active.cancel?.()
    else if (active.unsubscribe) active.unsubscribe()
    else active.cancel?.()

    if (notify) {
      active.cancelWithNotice?.()
    }
  }, [])

  useEffect(() => {
    let ignored = false
    conversationIdRef.current = activeConversationId
    toolMessageIdsRef.current = new Map()
    closeActiveStream({ cancel: false })
    dispatch({ type: 'CLEAR' })

    async function loadConversation() {
      try {
        const response = await api.invoke('conversations:get', { id: activeConversationId, username: username || 'guest' })
        if (ignored || !response.conversation?.messages) return
        dispatch({ type: 'LOAD', messages: toDisplayMessages(response.conversation.messages) })
      } catch (error) {
        if (error.code !== 'NOT_FOUND') console.error('[chat] load conversation failed:', error)
      }
    }
    loadConversation()
    return () => { ignored = true; closeActiveStream({ cancel: false }) }
  }, [activeConversationId, closeActiveStream])

  const saveConversation = useCallback(async (messages, options = {}) => {
    const id = options.conversationId || conversationIdRef.current
    try {
      const response = await api.post('/api/conversations', {
        id,
        title: makeTitle(messages),
        assistant,
        username: username || 'guest',
        messages
      })
      if (response.conversation) onConversationSaved?.(response.conversation, { select: options.select === true })
    } catch (error) {
      console.error('[chat] save conversation failed:', error)
    }
  }, [assistant, username, onConversationSaved])

  const sendUserMessage = useCallback((text) => {
    closeActiveStream({ cancel: true })
    toolMessageIdsRef.current = new Map()
    const convId = conversationIdRef.current

    const userMessage = { id: uid(), role: 'user', content: text }
    dispatch({ type: 'ADD', msg: userMessage })

    const assistantId = uid()
    dispatch({ type: 'ADD', msg: { id: assistantId, role: 'assistant', content: '', streaming: true } })

    const history = [...state.messages, userMessage]
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({ role: message.role, content: message.content }))
    saveConversation(history, { conversationId: convId, select: false })

    let assistantContent = ''
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      if (activeStreamRef.current?.assistantId === assistantId) {
        activeStreamRef.current = null
      }
      dispatch({ type: 'FINISH', id: assistantId })
      saveConversation([...history, { role: 'assistant', content: assistantContent }], { conversationId: convId, select: false })
    }

    const streamHandle = api.stream({
      channel: 'chat:send',
      payload: { convId, username: username || 'guest', assistant, messages: history },
      onDelta: (delta) => {
        assistantContent += delta
        dispatch({ type: 'APPEND_DELTA', id: assistantId, delta })
      },
      onToolStart: (event) => {
        const id = uid()
        toolMessageIdsRef.current.set(event.callId, id)
        dispatch({ type: 'ADD', msg: { id, role: 'tool', toolCallId: event.callId, toolName: event.name, args: event.args, toolStatus: 'running', logs: [] } })
      },
      onToolLog: (event) => {
        const id = toolMessageIdsRef.current.get(event.callId)
        if (id) dispatch({ type: 'UPDATE_TOOL', id, log: { stream: event.stream, chunk: event.chunk } })
      },
      onToolResult: (event) => {
        const id = toolMessageIdsRef.current.get(event.callId)
        if (event.result?.artifact) {
          const artifact = { ...event.result.artifact, username: event.result.artifact.username || username || 'guest' }
          window.dispatchEvent(new CustomEvent('agentdev:artifact-created', { detail: artifact }))
        }
        if (id) dispatch({ type: 'UPDATE_TOOL', id, patch: { toolStatus: 'ok', result: event.result } })
      },
      onToolError: (event) => {
        const id = toolMessageIdsRef.current.get(event.callId)
        if (id) dispatch({ type: 'UPDATE_TOOL', id, patch: { toolStatus: 'error', error: event.error } })
      },
      onSkillLoaded: (event) => {
        dispatch({ type: 'ADD', msg: { id: uid(), role: 'skill', skillName: event.name } })
      },
      onDone: finish,
      onError: (error) => {
        const errorText = `\n\n${chatErrorMessage(error)}`
        assistantContent += errorText
        dispatch({ type: 'APPEND_DELTA', id: assistantId, delta: errorText })
        finish()
      }
    })

    activeStreamRef.current = {
      assistantId,
      cancel: streamHandle.cancel || streamHandle,
      unsubscribe: streamHandle.unsubscribe,
      cancelWithNotice: () => {
        if (finished) return
        const notice = assistantContent ? '\n\n已停止生成。' : '已停止生成。'
        assistantContent += notice
        dispatch({ type: 'APPEND_DELTA', id: assistantId, delta: notice })
        finish()
      }
    }
  }, [assistant, closeActiveStream, state.messages, saveConversation])

  const addCard = useCallback((cardType, initialData = {}) => {
    const id = uid()
    dispatch({ type: 'ADD', msg: { id, role: 'card', cardType, cardData: initialData, cardState: 'form' } })
    return id
  }, [])

  const updateCard = useCallback((id, cardState, cardData) => dispatch({ type: 'UPDATE_CARD', id, cardState, cardData }), [])
  const addFileCard = useCallback((artifact) => {
    const scopedArtifact = artifact ? { ...artifact, username: artifact.username || username || 'guest' } : artifact
    if (scopedArtifact) window.dispatchEvent(new CustomEvent('agentdev:artifact-created', { detail: scopedArtifact }))
    dispatch({ type: 'ADD', msg: { id: uid(), role: 'card', cardType: 'file', cardData: scopedArtifact, cardState: 'done' } })
  }, [username])
  const clear = useCallback(() => dispatch({ type: 'CLEAR' }), [])

  return {
    ...state,
    sendUserMessage,
    cancelStream: () => closeActiveStream({ notify: true, cancel: true }),
    addCard,
    updateCard,
    addFileCard,
    clear
  }
}
