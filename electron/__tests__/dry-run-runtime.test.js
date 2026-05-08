import { test, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { planTask, execute, createDryRunAdapter } = require('../services/dryRunRuntime')

test('simulates Qwen-generated actions for full demo tasks', () => {
  const plan = planTask('Inspect a fake screen, click, run a command, and write output.', { sessionId: 'sess_demo' })
  expect(plan.dryRun).toBe(true)
  expect(plan.actions.map((item) => item.type)).toEqual(expect.arrayContaining(['screen.observe', 'mouse.click', 'shell.command', 'file.write']))
  expect(plan.actions.every((item) => item.summary.includes('[演示模式]'))).toBe(true)
})

test('simulates Open Interpreter command and file results', async () => {
  const command = await execute({ id: 'a1', type: 'shell.command', payload: { command: 'npm test' } })
  expect(command.stdout).toContain('[演示模式]')
  expect(command.stdout).toContain('npm test')
  const write = await execute({ id: 'a2', type: 'file.write', payload: { path: 'out.txt' } })
  expect(write.filesChanged).toEqual(['out.txt'])
})

test('simulates UI-TARS screen and input results', async () => {
  const screen = await execute({ id: 'a3', type: 'screen.observe', payload: {} })
  expect(screen.metadata.screenshot).toBe('dry-run-screen.png')
  const type = await execute({ id: 'a4', type: 'keyboard.type', payload: { text: 'hello' } })
  expect(type.stdout).toContain('5 个字符')
})

test('creates broker-compatible dry-run adapter', async () => {
  const adapter = createDryRunAdapter()
  const result = await adapter.execute({ id: 'a5', type: 'code.execute', payload: { language: 'js' } })
  expect(result.ok).toBe(true)
  expect(adapter.emergencyStop().dryRun).toBe(true)
})
