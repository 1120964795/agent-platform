import { test, expect, vi, beforeEach, afterAll } from 'vitest'
import { createRequire } from 'module'
import path from 'path'
import os from 'os'
import fs from 'fs'

const require = createRequire(import.meta.url)

const testDir = path.join(os.tmpdir(), 'aionui-conv-test-' + Date.now())

require.cache[require.resolve('electron')] = {
  exports: {
    app: {
      getPath: vi.fn(() => testDir)
    }
  }
}

const conversationStore = require('../services/conversationStore')

fs.mkdirSync(testDir, { recursive: true })
conversationStore.__testDbPath = path.join(testDir, 'conversations.db')

beforeEach(() => {
  conversationStore.close()
})

afterAll(() => {
  conversationStore.close()
  try { fs.rmSync(testDir, { recursive: true, force: true }) } catch {}
  conversationStore.__testDbPath = null
})

const { listConversations, upsertConversation, getConversation, deleteConversation, renameConversation } = conversationStore

test('listConversations returns empty array when no conversations', () => {
  const list = listConversations()
  expect(list).toEqual([])
})

test('upsertConversation creates a new conversation', () => {
  const conv = upsertConversation('conv-1', { title: 'Test', messages: [{ role: 'user', content: 'hello' }] })
  expect(conv.id).toBe('conv-1')
  expect(conv.title).toBe('Test')
  expect(conv.messages).toHaveLength(1)
})

test('getConversation returns the created conversation', () => {
  const conv = getConversation('conv-1')
  expect(conv).not.toBeNull()
  expect(conv.title).toBe('Test')
})

test('upsertConversation updates an existing conversation', () => {
  upsertConversation('conv-1', { title: 'Updated Title' })
  const conv = getConversation('conv-1')
  expect(conv.title).toBe('Updated Title')
  expect(conv.messages).toHaveLength(1)
})

test('listConversations returns all conversations', () => {
  upsertConversation('conv-2', { title: 'Second' })
  upsertConversation('conv-3', { title: 'Third' })
  const list = listConversations()
  expect(list.length).toBe(3)
  const ids = list.map(c => c.id)
  expect(ids).toContain('conv-1')
  expect(ids).toContain('conv-2')
  expect(ids).toContain('conv-3')
  const first = list.find(c => c.id === 'conv-1')
  expect(first.firstMessagePreview).toBe('hello')
})

test('listConversations filters by title search', () => {
  const list = listConversations('sec')
  expect(list.map(c => c.id)).toEqual(['conv-2'])
})

test('renameConversation updates the title and timestamp', () => {
  const before = getConversation('conv-2')
  const renamed = renameConversation('conv-2', 'Renamed Chat')
  expect(renamed.title).toBe('Renamed Chat')
  expect(renamed.updatedAt >= before.updatedAt).toBe(true)
  expect(listConversations('Renamed').map(c => c.id)).toEqual(['conv-2'])
})

test('deleteConversation removes the conversation', () => {
  deleteConversation('conv-1')
  const conv = getConversation('conv-1')
  expect(conv).toBeNull()
  const list = listConversations()
  expect(list.length).toBe(2)
})

test('open migrates legacy data.json conversations into sqlite once', () => {
  conversationStore.close()
  const originalDbPath = conversationStore.__testDbPath
  const migrationDir = path.join(testDir, 'migration')
  const dataDir = path.join(migrationDir, 'agentdev-lite', 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'data.json'), JSON.stringify({
    conversations: [{
      id: 'legacy-1',
      title: 'Legacy Chat',
      assistant: 'deepseek',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-02T00:00:00.000Z',
      messages: [{ role: 'user', content: 'legacy hello' }]
    }]
  }), 'utf8')

  conversationStore.__testDbPath = path.join(migrationDir, 'conversations.db')
  require('electron').app.getPath.mockReturnValue(migrationDir)

  const list = listConversations()
  expect(list).toHaveLength(1)
  expect(list[0]).toMatchObject({ id: 'legacy-1', title: 'Legacy Chat', firstMessagePreview: 'legacy hello' })
  expect(getConversation('legacy-1').messages).toEqual([{ role: 'user', content: 'legacy hello' }])
  expect(fs.existsSync(path.join(dataDir, 'data.json.bak'))).toBe(true)

  conversationStore.close()
  conversationStore.__testDbPath = originalDbPath
  require('electron').app.getPath.mockReturnValue(testDir)
})
