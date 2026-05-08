import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { createTaskOrchestrator, summarizeSubmitted } = require('../services/taskOrchestrator')

test('uses dry-run planning when Qwen is not configured', async () => {
  const broker = { submitActions: vi.fn(async (actions) => actions.map((action) => ({ ...action, status: 'pending' }))) }
  const events = []
  const orchestrator = createTaskOrchestrator({
    storeRef: { getConfig: () => ({ dryRunEnabled: true, workspace_root: 'C:\\work' }) },
    broker,
    addRunOutput: vi.fn(),
    now: () => new Date('2026-05-08T00:00:00Z')
  })

  const result = await orchestrator.runExecutionTask({
    convId: 'sess1',
    messages: [{ role: 'user', content: 'inspect a fake screen and run a command' }],
    onEvent: (event, data) => events.push({ event, data })
  })

  expect(result.dryRun).toBe(true)
  expect(broker.submitActions).toHaveBeenCalled()
  expect(events.map((item) => item.event)).toEqual(['chat:action-plan', 'chat:action-update'])
  expect(result.content).toContain('[演示模式]')
})

test('uses Qwen model router when configured', async () => {
  const modelRouter = {
    jsonForRole: vi.fn(async () => ({
      actions: [{ runtime: 'open-interpreter', type: 'shell.command', payload: { command: 'git status' }, risk: 'low' }]
    }))
  }
  const broker = { submitActions: vi.fn(async (actions) => actions.map((action) => ({ ...action, status: 'completed', result: { stdout: 'clean' } }))) }
  const addRunOutput = vi.fn((output) => ({ id: 'out1', ...output }))
  const orchestrator = createTaskOrchestrator({
    storeRef: { getConfig: () => ({ qwenApiKey: 'sk-qwen', dryRunEnabled: true }) },
    modelRouter,
    broker,
    addRunOutput,
    now: () => new Date('2026-05-08T00:00:00Z')
  })
  const result = await orchestrator.runExecutionTask({ convId: 'sess2', messages: [{ role: 'user', content: 'run git status' }] })
  expect(modelRouter.jsonForRole).toHaveBeenCalled()
  expect(result.actions[0].status).toBe('completed')
  expect(addRunOutput).toHaveBeenCalled()
})

test('summarizes action statuses for chat', () => {
  expect(summarizeSubmitted([{ status: 'pending' }, { status: 'completed' }])).toContain('待审批 1 个')
})
