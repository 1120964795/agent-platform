import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { createRegister, buildSystemPrompt } = require('../ipc/chat')

function createIpcMain() {
  const handlers = new Map()
  return { handlers, handle: vi.fn((channel, handler) => handlers.set(channel, handler)) }
}

test('chat:send forwards plain stream deltas and done event in default mode', async () => {
  const ipcMain = createIpcMain()
  const send = vi.fn()
  const register = createRegister({
    storeRef: { getConfig: () => ({ permissionMode: 'default' }) },
    deepseek: { chat: async ({ onDelta }) => { onDelta('hello'); onDelta(' world'); return { content: 'hello world', assistant_message: { role: 'assistant', content: 'hello world' }, tool_calls: [] } } },
    userRules: { buildSystemPromptSection: () => '' },
    skillRegistry: { listSkills: () => [], buildSkillIndex: () => '' }
  })
  register(ipcMain)

  const result = await ipcMain.handlers.get('chat:send')({ sender: { send } }, { convId: 'conv-1', messages: [{ role: 'user', content: 'hi' }] })
  expect(result).toEqual({ ok: true })
  expect(send).toHaveBeenCalledWith('chat:delta', { convId: 'conv-1', text: 'hello' })
  expect(send).toHaveBeenCalledWith('chat:delta', { convId: 'conv-1', text: ' world' })
  expect(send).toHaveBeenCalledWith('chat:done', { convId: 'conv-1' })
})

test('chat:send executes function calls in full mode and sends tool events', async () => {
  const ipcMain = createIpcMain()
  const send = vi.fn()
  const chat = vi.fn()
    .mockImplementationOnce(async () => ({
      content: '',
      assistant_message: { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'read_file', arguments: '{"path":"x"}' } }] },
      tool_calls: [{ id: 'call-1', name: 'read_file', args: { path: 'x' } }]
    }))
    .mockImplementationOnce(async ({ onDelta }) => {
      onDelta('done')
      return { content: 'done', assistant_message: { role: 'assistant', content: 'done' }, tool_calls: [] }
    })
  const execute = vi.fn(async () => ({ content: 'file text' }))
  const register = createRegister({
    storeRef: { getConfig: () => ({ permissionMode: 'full' }) },
    deepseek: { chat },
    execute,
    toolSchemas: [{ name: 'read_file', description: '', parameters: { type: 'object' } }],
    userRules: { buildSystemPromptSection: () => '' },
    skillRegistry: { listSkills: () => [{ name: 'file-explorer', description: 'files' }], buildSkillIndex: () => 'skill index' }
  })
  register(ipcMain)

  await ipcMain.handlers.get('chat:send')({ sender: { send } }, { convId: 'conv-1', messages: [{ role: 'user', content: 'read' }] })
  expect(execute).toHaveBeenCalledWith('read_file', { path: 'x' }, expect.objectContaining({ convId: 'conv-1' }))
  expect(send).toHaveBeenCalledWith('chat:tool-start', { convId: 'conv-1', callId: 'call-1', name: 'read_file', args: { path: 'x' } })
  expect(send).toHaveBeenCalledWith('chat:tool-result', { convId: 'conv-1', callId: 'call-1', result: { content: 'file text' } })
  expect(send).toHaveBeenCalledWith('chat:delta', { convId: 'conv-1', text: 'done' })
  expect(send).toHaveBeenCalledWith('chat:done', { convId: 'conv-1' })
})

test('buildSystemPrompt includes rules and skill index only in full mode', () => {
  const deps = { userRules: { buildSystemPromptSection: () => 'rules' }, skillRegistry: { listSkills: () => [{ name: 'x', description: 'y' }], buildSkillIndex: () => 'skills' } }
  expect(buildSystemPrompt({ permissionMode: 'default' }, deps)).toContain('rules')
  expect(buildSystemPrompt({ permissionMode: 'default' }, deps)).not.toContain('skills')
  expect(buildSystemPrompt({ permissionMode: 'full' }, deps)).toContain('skills')
})

test('chat:send routes execute mode through task orchestrator', async () => {
  const ipcMain = createIpcMain()
  const send = vi.fn()
  const taskOrchestrator = {
    runExecutionTask: vi.fn(async ({ onEvent }) => {
      onEvent('chat:action-plan', { actions: [{ id: 'act1' }] })
      return { content: 'prepared', actions: [], outputs: [] }
    })
  }
  const register = createRegister({
    storeRef: { getConfig: () => ({ permissionMode: 'default' }) },
    taskOrchestrator,
    userRules: { buildSystemPromptSection: () => '' },
    skillRegistry: { listSkills: () => [], buildSkillIndex: () => '' }
  })
  register(ipcMain)

  await ipcMain.handlers.get('chat:send')({ sender: { send } }, { convId: 'conv-1', mode: 'execute', messages: [{ role: 'user', content: 'run tests' }] })
  expect(taskOrchestrator.runExecutionTask).toHaveBeenCalled()
  expect(send).toHaveBeenCalledWith('chat:action-plan', { convId: 'conv-1', actions: [{ id: 'act1' }] })
  expect(send).toHaveBeenCalledWith('chat:delta', { convId: 'conv-1', text: 'prepared' })
  expect(send).toHaveBeenCalledWith('chat:done', { convId: 'conv-1' })
})
