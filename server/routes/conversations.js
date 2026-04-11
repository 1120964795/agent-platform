import express from 'express'
import { store } from '../store.js'

const router = express.Router()

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content }))
}

router.get('/:id', (req, res) => {
  const conversation = store.getConversation(req.params.id)
  if (!conversation) {
    res.status(404).json({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Conversation not found' }
    })
    return
  }
  res.json({ ok: true, conversation })
})

router.post('/', (req, res) => {
  const { id, title, assistant = 'general', messages = [] } = req.body || {}
  if (!id) {
    res.status(400).json({
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'conversation id is required' }
    })
    return
  }

  const now = new Date().toISOString()
  const existing = store.getConversation(id)
  const conversation = {
    id,
    title: title || existing?.title || '通用对话',
    assistant,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    messages: normalizeMessages(messages)
  }

  res.json({ ok: true, conversation: store.upsertConversation(conversation) })
})

export default router
