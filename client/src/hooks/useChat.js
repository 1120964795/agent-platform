import { useReducer, useCallback, useRef, useEffect, useState } from 'react'
import { abortChat, api, cancelAction } from '../lib/api.js'

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

const initialState = { messages: [], streaming: false }

function reducer(state, action) {
  switch (action.type) {
    case 'ADD':
      return { ...state, messages: [...state.messages, action.msg] }
    case 'APPEND_DELTA':
      return { ...state, streaming: true, messages: state.messages.map((message) => message.id === action.id ? { ...message, content: (message.content || '') + action.delta, streaming: true, startedAt: message.startedAt || action.now || Date.now() } : message) }
    case 'FINISH':
      return { ...state, streaming: false, messages: state.messages.map((message) => message.id === action.id ? { ...message, streaming: false, finishedAt: action.finishedAt || Date.now() } : message) }
    case 'INCREMENT_COMMAND_COUNT':
      return { ...state, messages: state.messages.map((message) => message.id === action.id ? { ...message, commandCount: (message.commandCount || 0) + 1 } : message) }
    case 'UPDATE_CARD':
      return { ...state, messages: state.messages.map((message) => message.id === action.id ? { ...message, cardState: action.cardState, cardData: action.cardData ?? message.cardData } : message) }
    case 'CLEAR':
      return initialState
    default:
      return state
  }
}

function makeTitle(messages) {
  const firstUser = messages.find((message) => message.role === 'user' && message.content)
  return firstUser?.content.slice(0, 30) || '新聊天'
}

function schedulePendingActionTimeout(action) {
  const risk = action.risk || action.riskLevel
  if (risk === 'high' && action.status === 'pending' && action.id) {
    setTimeout(() => {
      cancelAction(action.id, '超时自动取消').catch(() => {})
      window.dispatchEvent(new CustomEvent('aionui:actions-changed'))
    }, 5 * 60 * 1000)
  }
}

function appendActionSummary(actions = []) {
  if (!actions.length) return '收到动作更新。'
  const statusLabels = {
    pending: '待处理',
    approved: '已批准',
    denied: '已拒绝',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    blocked: '已阻止',
    cancelled: '已取消'
  }
  return actions.map((action) => {
    const title = action.title || action.name || action.id
    const status = action.status || 'pending'
    return `- ${title}：${statusLabels[status] || status}`
  }).join('\n')
}

function isInternalChatStreamEvent(event) {
  return event?.type === 'reasoning_summary' || event?.type?.startsWith('tool_')
}

export function useChat(conversationId) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const abortRef = useRef(null)
  const conversationIdRef = useRef(conversationId)
  const activeAssistantIdRef = useRef(null)
  const [agentRunning, setAgentRunning] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState(null)

  useEffect(() => {
    if (!conversationId) return undefined

    let ignored = false
    const previousConvId = conversationIdRef.current
    if (previousConvId && previousConvId !== conversationId) {
      abortChat(previousConvId).catch(() => {})
    }
    conversationIdRef.current = conversationId
    abortRef.current?.()
    abortRef.current = null
    activeAssistantIdRef.current = null
    setAgentRunning(false)
    setPendingConfirmation(null)
    dispatch({ type: 'CLEAR' })

    async function loadConversation() {
      try {
        const response = await api.get(`/api/conversations/${conversationId}`)
        if (ignored || !response.conversation?.messages) return
        response.conversation.messages
          .filter((message) => message.role === 'user' || message.role === 'assistant')
          .forEach((message) => dispatch({ type: 'ADD', msg: { id: uid(), role: message.role, content: message.content } }))
      } catch (error) {
        if (!ignored && error.code !== 'NOT_FOUND') console.error('[chat] 加载对话失败:', error)
      }
    }

    loadConversation()
    return () => {
      ignored = true
      abortRef.current?.()
      abortRef.current = null
      activeAssistantIdRef.current = null
      setPendingConfirmation(null)
    }
  }, [conversationId])

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onChatStream?.((payload) => {
      if (!payload?.event || payload.convId !== conversationIdRef.current) return
      if (isInternalChatStreamEvent(payload.event)) return
      dispatch({
        type: 'ADD',
        msg: {
          id: payload.event.id || uid(),
          role: 'assistant',
          type: payload.event.type,
          stream: true,
          content: payload.event.text || payload.event.summary || '',
          tool: payload.event.tool || null,
        }
      })
    })
    return () => unsubscribe?.()
  }, [])

  const saveConversation = useCallback(async (convId, messages) => {
    try {
      await api.post('/api/conversations', { id: convId, title: makeTitle(messages), assistant: 'general', messages })
      window.dispatchEvent(new CustomEvent('agentdev:conversations-changed'))
    } catch (error) {
      console.error('[chat] 保存对话失败:', error)
    }
  }, [])

  const sendUserMessage = useCallback((text, model, options = {}) => {
    const convId = conversationIdRef.current
    if (!convId) return

    if (pendingConfirmation) {
      const userMessage = { id: uid(), role: 'user', content: text }
      dispatch({ type: 'ADD', msg: userMessage })

      api.invoke('chat:send', { convId, message: text, confirmationReply: true }).then((result) => {
        if (result.status === 'confirmed' || result.status === 'rejected' || result.status === 'missing') {
          setPendingConfirmation(null)
        }
        if (result.assistantText) {
          const assistantMessage = { id: uid(), role: 'assistant', content: result.assistantText }
          dispatch({ type: 'ADD', msg: assistantMessage })
          const history = [...state.messages, userMessage, assistantMessage]
            .filter((message) => message.role === 'user' || message.role === 'assistant')
            .map((message) => ({ role: message.role, content: message.content }))
          saveConversation(convId, history)
        }
      }).catch((error) => {
        dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', content: `[确认失败] ${error.message}` } })
      })
      return
    }

    abortRef.current?.()
    setAgentRunning(true)

    const userMessage = { id: uid(), role: 'user', content: text }
    dispatch({ type: 'ADD', msg: userMessage })

    const assistantId = uid()
    const startedAt = Date.now()
    activeAssistantIdRef.current = assistantId
    dispatch({ type: 'ADD', msg: { id: assistantId, role: 'assistant', content: '', streaming: true, startedAt, commandCount: 0 } })

    const history = [...state.messages, userMessage]
      .filter((message) => (message.role === 'user' || message.role === 'assistant') && !message.stream)
      .map((message) => ({ role: message.role, content: message.content }))

    let assistantContent = ''
    let finished = false
    const countedToolCalls = new Set()
    const finish = () => {
      if (finished) return
      finished = true
      dispatch({ type: 'FINISH', id: assistantId, finishedAt: Date.now() })
      if (activeAssistantIdRef.current === assistantId) activeAssistantIdRef.current = null
      setAgentRunning(false)
      saveConversation(convId, [...history, { role: 'assistant', content: assistantContent }])
    }

    const countCommand = (event = {}) => {
      if (event.callId) {
        if (countedToolCalls.has(event.callId)) return
        countedToolCalls.add(event.callId)
      }
      dispatch({ type: 'INCREMENT_COMMAND_COUNT', id: assistantId })
    }

    abortRef.current = api.stream({
      channel: 'chat:send',
      payload: {
        convId,
        messages: history,
        message: text,
        model,
        pluginMode: options.pluginMode || null,
        forcedSkill: options.forcedSkill || null
      },
      onDelta: (delta) => {
        assistantContent += delta
        dispatch({ type: 'APPEND_DELTA', id: assistantId, delta })
      },
      onToolStart: countCommand,
      onActionPlan: (event) => {
        for (const action of event.actions || []) schedulePendingActionTimeout(action)
        dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', type: 'action_plan', stream: true, content: appendActionSummary(event.actions || []) } })
      },
      onActionUpdate: (event) => {
        window.dispatchEvent(new CustomEvent('aionui:actions-changed'))
        dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', type: 'action_update', stream: true, content: appendActionSummary(event.actions || []) } })
      },
      onConfirmationRequest: (event) => {
        setPendingConfirmation(event.pending)
      },
      onConfirmationCleared: () => {
        setPendingConfirmation(null)
      },
      onDone: finish,
      onError: (error) => {
        const errorText = `\n\n[错误] ${error.message}`
        assistantContent += errorText
        dispatch({ type: 'APPEND_DELTA', id: assistantId, delta: errorText })
        setAgentRunning(false)
        finish()
      }
    })
  }, [pendingConfirmation, state.messages, saveConversation])

  const handleAbort = useCallback(() => {
    const convId = conversationIdRef.current
    abortRef.current?.()
    if (convId) abortChat(convId).catch((error) => console.error('[chat] 取消请求失败:', error))
    if (activeAssistantIdRef.current) {
      dispatch({ type: 'FINISH', id: activeAssistantIdRef.current, finishedAt: Date.now() })
      activeAssistantIdRef.current = null
    }
    setPendingConfirmation(null)
    setAgentRunning(false)
  }, [])

  const sendCommand = useCallback(({ command, prompt, referencePath }) => {
    const convId = conversationIdRef.current
    if (!convId) return

    const displayText = referencePath ? `/${command} “${referencePath}” ${prompt}` : `/${command} ${prompt}`
    const userMessage = { id: uid(), role: 'user', content: displayText }
    const assistantContent = '请直接用自然语言描述你的任务，我会自动判断是否需要执行操作。'
    dispatch({ type: 'ADD', msg: userMessage })
    dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', content: assistantContent } })
    const history = [...state.messages, userMessage].filter((message) => message.role === 'user' || message.role === 'assistant').map((message) => ({ role: message.role, content: message.content }))
    saveConversation(convId, [...history, { role: 'assistant', content: assistantContent }])
  }, [state.messages, saveConversation])

  const addCard = useCallback((cardType, initialData = {}) => {
    const id = uid()
    dispatch({ type: 'ADD', msg: { id, role: 'card', cardType, cardData: initialData, cardState: 'form' } })
    return id
  }, [])

  const updateCard = useCallback((id, cardState, cardData) => dispatch({ type: 'UPDATE_CARD', id, cardState, cardData }), [])
  const addFileCard = useCallback((artifact) => {
    if (artifact) window.dispatchEvent(new CustomEvent('agentdev:artifact-created', { detail: artifact }))
    dispatch({ type: 'ADD', msg: { id: uid(), role: 'card', cardType: 'file', cardData: artifact, cardState: 'done' } })
  }, [])
  const clear = useCallback(() => dispatch({ type: 'CLEAR' }), [])

  return { ...state, agentRunning, pendingConfirmation, sendUserMessage, handleAbort, sendCommand, addCard, updateCard, addFileCard, clear }
}
