import { test, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-workflow-ipc-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')
process.env.AGENTDEV_WORKFLOW_SKILLS_DIR = path.join(TMP, 'workflow-skills')
process.env.AGENTDEV_USER_SKILLS_DIR = path.join(TMP, 'user-skills')
process.env.AGENTDEV_BUILTIN_SKILLS_DIR = path.join(TMP, 'builtin-skills')
process.env.ELECTRON_OVERRIDE_DIST_PATH = 'C:\\Windows'

const require = createRequire(import.meta.url)
const { registerAll } = require('../ipc')

function createIpcMain() {
  const handlers = new Map()
  return { handlers, handle: vi.fn((channel, handler) => handlers.set(channel, handler)) }
}

const draft = {
  name: 'Node local check',
  description: 'Check Node and ask before installing packages.',
  technologyStack: ['Node.js'],
  steps: [
    { id: 'step_node', type: 'check_command', title: 'Node version', command: 'node --version', riskLevel: 'low', requiresConfirmation: false },
    { id: 'step_install', type: 'confirm_command', title: 'Install packages', command: 'npm install', riskLevel: 'medium', requiresConfirmation: true }
  ]
}

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
})

test('workflow IPC registers the V3 channel surface and runs confirmation flow', async () => {
  const ipcMain = createIpcMain()
  const executed = []
  registerAll(ipcMain, {
    workflowExecutor: {
      execute: async (step) => {
        executed.push(step.id)
        return { status: 'completed', exitCode: 0, stdoutTail: step.id, stderrTail: '' }
      }
    }
  })

  expect([...ipcMain.handlers.keys()]).toEqual(expect.arrayContaining([
    'workflow-skills:list',
    'workflow-skills:get',
    'workflow-skills:saveDraft',
    'workflow-skills:disable',
    'workflow-skills:delete',
    'workflow-skills:export',
    'workflow-versions:list',
    'workflow-versions:diff',
    'workflow-versions:rollback',
    'workflow-runs:start',
    'workflow-runs:confirmStep',
    'workflow-runs:pause',
    'workflow-runs:resume',
    'workflow-runs:skipStep',
    'workflow-runs:retryStep',
    'workflow-runs:terminate',
    'workflow-runs:insertTemporaryStep',
    'workflow-runs:list',
    'workflow-runs:get',
    'workflow-template-sources:list',
    'workflow-template-sources:add',
    'workflow-template-sources:updateTrust',
    'workflow-templates:list',
    'workflow-templates:preview',
    'workflow-templates:import'
  ]))

  const saved = await ipcMain.handlers.get('workflow-skills:saveDraft')({}, { draft, changelog: 'Initial.' })
  expect(saved.ok).toBe(true)

  const started = await ipcMain.handlers.get('workflow-runs:start')({}, { workflowId: saved.workflow.id })
  expect(started.run.status).toBe('waiting_confirmation')
  expect(executed).toEqual(['step_node'])

  const confirmed = await ipcMain.handlers.get('workflow-runs:confirmStep')({}, { runId: started.run.runId, accepted: true })
  expect(confirmed.run.status).toBe('completed')
  expect(executed).toEqual(['step_node', 'step_install'])
})
