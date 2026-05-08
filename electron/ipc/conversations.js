const { store } = require('../store')

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant' || message.role === 'tool' || message.role === 'system') && typeof message.content === 'string')
    .map((message) => ({ ...message, role: message.role, content: message.content }))
}

function normalizeUsername(username) {
  return String(username || 'guest').trim() || 'guest'
}

function belongsToUser(conversation, username) {
  if (!username) return true
  return normalizeUsername(conversation?.username).toLowerCase() === normalizeUsername(username).toLowerCase()
}

function register(ipcMain) {
  ipcMain.handle('conversations:list', async (_event, payload = {}) => {
    const username = typeof payload === 'string' ? payload : payload.username
    const conversations = store.listConversations().filter((conversation) => belongsToUser(conversation, username))
    return { ok: true, conversations }
  })

  ipcMain.handle('conversations:get', async (_event, payload = {}) => {
    const id = typeof payload === 'string' ? payload : payload.id
    const username = typeof payload === 'object' ? payload.username : ''
    const conversation = store.getConversation(id)
    if (!conversation || !belongsToUser(conversation, username)) return { ok: false, error: { code: 'NOT_FOUND', message: '未找到会话' } }
    return { ok: true, conversation }
  })

  ipcMain.handle('conversations:upsert', async (_event, payload = {}) => {
    const { id, title, assistant = 'general', username, messages = [] } = payload
    if (!id) return { ok: false, error: { code: 'BAD_REQUEST', message: '缺少会话 ID' } }

    const now = new Date().toISOString()
    const existing = store.getConversation(id)
    const conversation = {
      id,
      title: title || existing?.title || '新对话',
      assistant,
      username: username || existing?.username || 'guest',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      messages: normalizeMessages(messages)
    }

    return { ok: true, conversation: store.upsertConversation(conversation) }
  })
}

module.exports = { register, normalizeMessages, belongsToUser }
