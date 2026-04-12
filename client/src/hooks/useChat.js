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

  const sendCommand = useCallback(async ({ command, cardType, prompt, referencePath }) => {
    // 1. 显示用户的命令文本
    const displayText = referencePath
      ? `/${command} "${referencePath}" ${prompt}`
      : `/${command} ${prompt}`
    const userMsg = { id: uid(), role: 'user', content: displayText }
    dispatch({ type: 'ADD', msg: userMsg })

    // 2. 显示 loading 卡片
    const cardId = uid()
    dispatch({
      type: 'ADD',
      msg: { id: cardId, role: 'card', cardType, cardData: { prompt, referencePath }, cardState: 'loading' }
    })

    // 3. 调用对应的后端 API
    const endpoint = cardType === 'ppt' ? '/api/ppt' : '/api/word'
    try {
      const result = await api.post(endpoint, {
        conversationId: conversationIdRef.current,
        prompt,
        referencePath
      })

      // 4. 更新卡片为 done 状态
      const artifact = {
        id: result.artifactId,
        type: cardType,
        filename: result.filename,
        path: result.path,
        title: result.title || prompt.slice(0, 24),
        createdAt: new Date().toISOString()
      }
      dispatch({ type: 'UPDATE_CARD', id: cardId, cardState: 'done', cardData: { prompt, result, artifact } })

      // 5. 添加 FileCard + 通知 ArtifactsPanel
      if (artifact) {
        window.dispatchEvent(new CustomEvent('agentdev:artifact-created', { detail: artifact }))
      }
      dispatch({
        type: 'ADD',
        msg: { id: uid(), role: 'card', cardType: 'file', cardData: artifact, cardState: 'done' }
      })
    } catch (error) {
      dispatch({
        type: 'UPDATE_CARD',
        id: cardId,
        cardState: 'done',
        cardData: { prompt, error: error.message || '生成失败' }
      })
    }
  }, [saveConversation])

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

  return { ...state, sendUserMessage, sendCommand, addCard, updateCard, addFileCard, clear }
}
