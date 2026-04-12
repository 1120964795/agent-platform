import { useReducer, useCallback, useRef, useEffect } from 'react'
import { api } from '../lib/api.js'

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

const initialState = {
  messages: [], // {id, role: 'user'|'assistant'|'system'|'card', content, streaming?, cardType?, cardData?, cardState?}
  streaming: false
}

function reducer(state, action) {
  switch (action.type) {
    case 'ADD': return { ...state, messages: [...state.messages, action.msg] }
    case 'APPEND_DELTA': {
      const messages = state.messages.map(m =>
        m.id === action.id ? { ...m, content: (m.content || '') + action.delta, streaming: true } : m
      )
      return { ...state, messages, streaming: true }
    }
    case 'FINISH': {
      const messages = state.messages.map(m => m.id === action.id ? { ...m, streaming: false } : m)
      return { ...state, messages, streaming: false }
    }
    case 'UPDATE_CARD': {
      const messages = state.messages.map(m =>
        m.id === action.id ? { ...m, cardState: action.cardState, cardData: action.cardData ?? m.cardData } : m
      )
      return { ...state, messages }
    }
    case 'CLEAR': return initialState
    default: return state
  }
}

const DEFAULT_CONVERSATION_ID = 'general-default'

function makeTitle(messages) {
  const firstUser = messages.find(m => m.role === 'user' && m.content)
  return firstUser?.content.slice(0, 24) || '通用对话'
}

export function useChat() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const abortRef = useRef(null)
  const conversationIdRef = useRef(DEFAULT_CONVERSATION_ID)

  useEffect(() => {
    let ignored = false

    async function loadConversation() {
      try {
        const r = await api.get(`/api/conversations/${conversationIdRef.current}`)
        if (ignored || !r.conversation?.messages) return
        r.conversation.messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .forEach(m => {
            dispatch({ type: 'ADD', msg: { id: uid(), role: m.role, content: m.content } })
          })
      } catch (e) {
        if (e.code !== 'NOT_FOUND') console.error('[chat] load conversation failed:', e)
      }
    }

    loadConversation()
    return () => { ignored = true }
  }, [])

  const saveConversation = useCallback(async (messages) => {
    try {
      await api.post('/api/conversations', {
        id: conversationIdRef.current,
        title: makeTitle(messages),
        assistant: 'general',
        messages
      })
    } catch (e) {
      console.error('[chat] save conversation failed:', e)
    }
  }, [])

  const sendUserMessage = useCallback(async (text) => {
    const userMsg = { id: uid(), role: 'user', content: text }
    dispatch({ type: 'ADD', msg: userMsg })

    const asstId = uid()
    dispatch({ type: 'ADD', msg: { id: asstId, role: 'assistant', content: '', streaming: true } })

    // 取当前所有非 card 消息作为上下文
    const history = [...state.messages, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))

    let assistantContent = ''
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      dispatch({ type: 'FINISH', id: asstId })
      saveConversation([...history, { role: 'assistant', content: assistantContent }])
    }

    abortRef.current = await api.stream(
      '/api/chat',
      { conversationId: conversationIdRef.current, messages: history },
      (delta) => {
        assistantContent += delta
        dispatch({ type: 'APPEND_DELTA', id: asstId, delta })
      },
      () => finish(),
      (err) => {
        const errorText = `\n\n[错误] ${err.message}`
        assistantContent += errorText
        dispatch({ type: 'APPEND_DELTA', id: asstId, delta: errorText })
        finish()
      }
    )
  }, [state.messages, saveConversation])

  const addCard = useCallback((cardType, initialData = {}) => {
    const id = uid()
    dispatch({
      type: 'ADD',
      msg: { id, role: 'card', cardType, cardData: initialData, cardState: 'form' }
    })
    return id
  }, [])

  const updateCard = useCallback((id, cardState, cardData) => {
    dispatch({ type: 'UPDATE_CARD', id, cardState, cardData })
  }, [])

  const addFileCard = useCallback((artifact) => {
    if (artifact) {
      window.dispatchEvent(new CustomEvent('agentdev:artifact-created', { detail: artifact }))
    }
    dispatch({
      type: 'ADD',
      msg: { id: uid(), role: 'card', cardType: 'file', cardData: artifact, cardState: 'done' }
    })
  }, [])

  const clear = useCallback(() => dispatch({ type: 'CLEAR' }), [])

  return { ...state, sendUserMessage, addCard, updateCard, addFileCard, clear }
}
