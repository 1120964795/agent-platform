const { store } = require('../store')

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant' || message.role === 'tool' || message.role === 'system') && typeof message.content === 'string')
    .map((message) => ({ ...message, role: message.role, content: message.content }))
}

function register(ipcMain) {
  ipcMain.handle('conversations:list', async () => ({ ok: true, conversations: store.listConversations() }))

  ipcMain.handle('conversations:get', async (_event, payload = {}) => {
    const id = typeof payload === 'string' ? payload : payload.id
    const conversation = store.getConversation(id)
    if (!conversation) return { ok: false, error: { code: 'NOT_FOUND', message: '未找到对话。' } }
    return { ok: true, conversation }
  })

  ipcMain.handle('conversations:upsert', async (_event, payload = {}) => {
    const { id, title, assistant = 'general', messages = [] } = payload
    if (!id) return { ok: false, error: { code: 'BAD_REQUEST', message: '需要提供对话 ID。' } }

    const now = new Date().toISOString()
    const existing = store.getConversation(id)
    const conversation = {
      id,
      title: title || existing?.title || '新对话',
      assistant,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      messages: normalizeMessages(messages)
    }

    return { ok: true, conversation: store.upsertConversation(conversation) }
  })
}

module.exports = { register, normalizeMessages }
