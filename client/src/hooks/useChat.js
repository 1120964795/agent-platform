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
      return { ...state, streaming: true, messages: state.messages.map((message) => message.id === action.id ? { ...message, content: (message.content || '') + action.delta, streaming: true } : message) }
    case 'FINISH':
      return { ...state, streaming: false, messages: state.messages.map((message) => message.id === action.id ? { ...message, streaming: false } : message) }
    case 'UPDATE_CARD':
      return { ...state, messages: state.messages.map((message) => message.id === action.id ? { ...message, cardState: action.cardState, cardData: action.cardData ?? message.cardData } : message) }
    case 'ADD_CONFIRMATION':
      return { ...state, messages: [...state.messages, action.msg] }
    case 'UPDATE_CONFIRMATION':
      return {
        ...state,
        messages: state.messages.map((message) => (
          message.type === 'confirmation' && message.confirmation?.callId === action.callId
            ? { ...message, confirmationStatus: action.status }
            : message
        ))
      }
    case 'CLEAR_CONFIRMATIONS':
      return {
        ...state,
        messages: state.messages.map((message) => (
          message.type === 'confirmation' && message.confirmationStatus === 'pending'
            ? { ...message, confirmationStatus: action.status }
            : message
        ))
      }
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
  if (!actions.length) return 'Action update received.'
  return actions.map((action) => {
    const title = action.title || action.name || action.id
    const status = action.status || 'pending'
    return `- ${title}: ${status}`
  }).join('\n')
}

function formatConfirmationContent(pending) {
  const args = JSON.stringify(pending.args || {}, null, 2)
  return [
    `需要确认高风险操作: ${pending.toolName}`,
    `风险原因: ${pending.reason || 'high risk operation'}`,
    '参数:',
    args
  ].join('\n')
}

function formatDesktopEvent(event = {}) {
  if (event.summary) return event.summary
  if (event.type === 'observe') return 'Looking at the desktop...'
  if (event.type === 'plan') return event.action?.userVisibleSummary || event.action?.reason || 'Planning the next desktop action.'
  if (event.type === 'cursor_move') return 'Moving the Computer Use cursor.'
  if (event.type === 'action_start') return `Starting desktop ${event.action || 'action'}.`
  if (event.type === 'action_result') return `Finished desktop ${event.action || 'action'}.`
  if (event.type === 'ask_user') return event.question || 'Computer Use needs your input.'
  if (event.type === 'done') return event.summary || 'Computer Use finished.'
  if (event.type === 'fail') return event.summary || event.message || 'Computer Use failed.'
  return ''
}

export function useChat(conversationId) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const abortRef = useRef(null)
  const conversationIdRef = useRef(conversationId)
  const [agentRunning, setAgentRunning] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState(null)
  const [pendingDesktopAsk, setPendingDesktopAsk] = useState(null)

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
    setAgentRunning(false)
    setPendingConfirmation(null)
    setPendingDesktopAsk(null)
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
      setPendingConfirmation(null)
      setPendingDesktopAsk(null)
    }
  }, [conversationId])

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onChatStream?.((payload) => {
      if (!payload?.event || payload.convId !== conversationIdRef.current) return
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

    if (pendingDesktopAsk) {
      const userMessage = { id: uid(), role: 'user', content: text }
      dispatch({ type: 'ADD', msg: userMessage })
      api.invoke('chat:send', { convId, desktopAskReply: true, message: text }).then((result) => {
        if (result.status === 'desktop-ask-replied' || result.status === 'missing-desktop-ask') setPendingDesktopAsk(null)
      }).catch((error) => {
        dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', content: `[Desktop ask error] ${error.message}` } })
      })
      return
    }

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
    dispatch({ type: 'ADD', msg: { id: assistantId, role: 'assistant', content: '', streaming: true } })

    const history = [...state.messages, userMessage]
      .filter((message) => (message.role === 'user' || message.role === 'assistant') && !message.stream)
      .map((message) => ({ role: message.role, content: message.content }))

    let assistantContent = ''
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      dispatch({ type: 'FINISH', id: assistantId })
      setAgentRunning(false)
      saveConversation(convId, [...history, { role: 'assistant', content: assistantContent }])
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
      onSkillLoaded: (event) => {
        dispatch({ type: 'ADD', msg: { id: uid(), role: 'skill', skillName: event.name } })
      },
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
        dispatch({
          type: 'ADD_CONFIRMATION',
          msg: {
            id: `confirm-${event.pending.callId}`,
            role: 'assistant',
            type: 'confirmation',
            content: formatConfirmationContent(event.pending),
            confirmation: event.pending,
            confirmationStatus: 'pending'
          }
        })
      },
      onConfirmationCleared: (event) => {
        setPendingConfirmation(null)
        if (event?.reason === 'timeout' || event?.reason === 'aborted' || event?.reason === 'run-ended') {
          dispatch({ type: 'CLEAR_CONFIRMATIONS', status: event.reason === 'timeout' ? 'timeout' : 'rejected' })
        }
      },
      onDesktopAsk: (event) => {
        setPendingDesktopAsk(event.request)
        dispatch({ type: 'ADD', msg: { id: `desktop-ask-${event.request.requestId}`, role: 'assistant', type: 'desktop_ask', content: event.request.question } })
      },
      onDesktopAskCleared: () => setPendingDesktopAsk(null),
      onDesktopEvent: (event) => {
        const content = formatDesktopEvent(event)
        if (content) dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', type: 'desktop_event', stream: true, content } })
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
  }, [pendingConfirmation, pendingDesktopAsk, state.messages, saveConversation])

  const respondToConfirmation = useCallback((approved) => {
    const convId = conversationIdRef.current
    const pending = pendingConfirmation
    if (!convId || !pending) return
    dispatch({ type: 'UPDATE_CONFIRMATION', callId: pending.callId, status: approved ? 'confirmed' : 'rejected' })
    api.invoke('chat:send', { convId, confirmationReply: true, approved }).then((result) => {
      if (result.status === 'confirmed' || result.status === 'rejected' || result.status === 'missing') {
        setPendingConfirmation(null)
      }
      if (result.assistantText) {
        dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', content: result.assistantText } })
      }
    }).catch((error) => {
      dispatch({ type: 'UPDATE_CONFIRMATION', callId: pending.callId, status: 'pending' })
      dispatch({ type: 'ADD', msg: { id: uid(), role: 'assistant', content: `[确认失败] ${error.message}` } })
    })
  }, [pendingConfirmation])

  const handleAbort = useCallback(() => {
    const convId = conversationIdRef.current
    abortRef.current?.()
    if (convId) abortChat(convId).catch((error) => console.error('[chat] 取消请求失败:', error))
    setPendingConfirmation(null)
    setPendingDesktopAsk(null)
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

  return { ...state, agentRunning, pendingConfirmation, pendingDesktopAsk, sendUserMessage, respondToConfirmation, handleAbort, sendCommand, addCard, updateCard, addFileCard, clear }
}
