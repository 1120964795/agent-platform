import { useReducer, useCallback, useRef, useEffect } from 'react'
import { api } from '../lib/api.js'

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
    case 'UPDATE_TOOL':
      return {
        ...state,
        messages: state.messages.map((message) => {
          if (message.id !== action.id) return message
          const logs = action.log ? [...(message.logs || []), action.log] : message.logs
          return { ...message, ...action.patch, logs }
        })
      }
    case 'ADD_ACTIONS':
      return { ...state, messages: [...state.messages, { id: uid(), role: 'actions', title: action.title, actions: action.actions || [] }] }
    case 'CLEAR':
      return initialState
    default:
      return state
  }
}

function makeTitle(messages) {
  const firstUser = messages.find((message) => message.role === 'user' && message.content)
  return firstUser?.content.slice(0, 24) || '新对话'
}

export function useChat(conversationId) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const abortRef = useRef(null)
  const conversationIdRef = useRef(conversationId)
  const toolMessageIdsRef = useRef(new Map())

  useEffect(() => {
    if (!conversationId) return undefined

    let ignored = false
    conversationIdRef.current = conversationId
    abortRef.current?.()
    abortRef.current = null
    toolMessageIdsRef.current = new Map()
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
    }
  }, [conversationId])

  const saveConversation = useCallback(async (convId, messages) => {
    try {
      await api.post('/api/conversations', { id: convId, title: makeTitle(messages), assistant: 'general', messages })
    } catch (error) {
      console.error('[chat] 保存对话失败:', error)
    }
  }, [])

  const sendUserMessage = useCallback((text, options = {}) => {
    const convId = conversationIdRef.current
    if (!convId) return

    abortRef.current?.()
    toolMessageIdsRef.current = new Map()

    const userMessage = { id: uid(), role: 'user', content: text }
    dispatch({ type: 'ADD', msg: userMessage })

    const assistantId = uid()
    dispatch({ type: 'ADD', msg: { id: assistantId, role: 'assistant', content: '', streaming: true } })

    const history = [...state.messages, userMessage]
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({ role: message.role, content: message.content }))

    let assistantContent = ''
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      dispatch({ type: 'FINISH', id: assistantId })
      saveConversation(convId, [...history, { role: 'assistant', content: assistantContent }])
    }

    abortRef.current = api.stream({
      channel: 'chat:send',
      payload: { convId, messages: history, mode: options.mode || 'chat' },
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
        if (id) dispatch({ type: 'UPDATE_TOOL', id, patch: { toolStatus: 'ok', result: event.result } })
      },
      onToolError: (event) => {
        const id = toolMessageIdsRef.current.get(event.callId)
        if (id) dispatch({ type: 'UPDATE_TOOL', id, patch: { toolStatus: 'error', error: event.error } })
      },
      onSkillLoaded: (event) => {
        dispatch({ type: 'ADD', msg: { id: uid(), role: 'skill', skillName: event.name } })
      },
      onActionPlan: (event) => {
        dispatch({ type: 'ADD_ACTIONS', title: event.dryRun ? '演示模式动作计划' : '动作计划', actions: event.actions || [] })
      },
      onActionUpdate: (event) => {
        window.dispatchEvent(new CustomEvent('aionui:actions-changed'))
        dispatch({ type: 'ADD_ACTIONS', title: '动作进展', actions: event.actions || [] })
      },
      onDone: finish,
      onError: (error) => {
        const errorText = `\n\n[错误] ${error.message}`
        assistantContent += errorText
        dispatch({ type: 'APPEND_DELTA', id: assistantId, delta: errorText })
        finish()
      }
    })
  }, [state.messages, saveConversation])

  const sendCommand = useCallback(({ command, prompt, referencePath }) => {
    const convId = conversationIdRef.current
    if (!convId) return

    const displayText = referencePath ? `/${command} "${referencePath}" ${prompt}` : `/${command} ${prompt}`
    const userMessage = { id: uid(), role: 'user', content: displayText }
    const assistantContent = '旧版斜杠命令已移除。请直接用自然语言描述任务；需要执行时请切换到“执行”模式。'
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

  return { ...state, sendUserMessage, sendCommand, addCard, updateCard, addFileCard, clear }
}
