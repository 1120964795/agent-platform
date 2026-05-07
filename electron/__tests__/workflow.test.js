import { test, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-workflow-test-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')
process.env.AGENTDEV_WORKFLOW_SKILLS_DIR = path.join(TMP, 'workflow-skills')
process.env.AGENTDEV_USER_SKILLS_DIR = path.join(TMP, 'user-skills')
process.env.AGENTDEV_BUILTIN_SKILLS_DIR = path.join(TMP, 'builtin-skills')

const require = createRequire(import.meta.url)
const skillRegistry = require('../skills/registry')
const workflowRegistry = require('../workflows/registry')
const versionService = require('../workflows/versionService')
const diffService = require('../workflows/diffService')
const { WorkflowRunner } = require('../workflows/runner')
const packageService = require('../workflows/packageService')

const flaskDraft = {
  name: 'Flask local start',
  description: 'Check Python, install dependencies, start Flask, and diagnose common failures.',
  technologyStack: ['Python', 'Flask'],
  source: { kind: 'generated_from_project', projectId: 'proj_1', projectPath: 'D:\\study\\flask-blog' },
  steps: [
    {
      id: 'step_check_python',
      type: 'check_command',
      title: 'Check Python version',
      command: 'python --version',
      cwd: 'D:\\study\\flask-blog',
      riskLevel: 'low',
      requiresConfirmation: false,
      source: { kind: 'project_profile', projectId: 'proj_1', path: 'requirements.txt' }
    },
    {
      id: 'step_install_requirements',
      type: 'confirm_command',
      title: 'Install requirements',
      command: 'pip install -r requirements.txt',
      cwd: 'D:\\study\\flask-blog',
      riskLevel: 'medium',
      requiresNetwork: true,
      requiresConfirmation: true,
      source: { kind: 'experience_card', cardId: 'exp_1' }
    }
  ]
}

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
  fs.mkdirSync(process.env.AGENTDEV_BUILTIN_SKILLS_DIR, { recursive: true })
  skillRegistry.reload()
})

test('registry saves workflow skills as structured files and exposes them in the skill list', () => {
  const saved = workflowRegistry.saveDraft(flaskDraft, { changelog: 'Initial workflow.' })

  const workflowDir = path.join(process.env.AGENTDEV_WORKFLOW_SKILLS_DIR, saved.workflow.id)
  expect(fs.existsSync(path.join(workflowDir, 'workflow.json'))).toBe(true)
  expect(fs.existsSync(path.join(workflowDir, 'versions', '1.0.0.json'))).toBe(true)
  expect(fs.readFileSync(path.join(workflowDir, 'SKILL.md'), 'utf-8')).toContain('Flask local start')

  const listed = workflowRegistry.listWorkflows()
  expect(listed[0]).toMatchObject({
    id: saved.workflow.id,
    name: 'Flask local start',
    currentVersion: '1.0.0',
    stepCount: 2,
    riskSummary: { maxRiskLevel: 'medium', hasNetworkCommand: true, hasStartService: false }
  })

  skillRegistry.reload()
  expect(skillRegistry.listSkills().map((skill) => skill.name)).toContain('Flask local start')
})

test('versions can be diffed and rollback creates a new version without deleting history', () => {
  const saved = workflowRegistry.saveDraft(flaskDraft, { changelog: 'Initial workflow.' })
  versionService.createVersion(saved.workflow.id, {
    changelog: 'Add service start.',
    steps: [
      ...flaskDraft.steps,
      {
        id: 'step_start_flask',
        type: 'start_service',
        title: 'Start Flask service',
        command: 'python app.py',
        cwd: 'D:\\study\\flask-blog',
        riskLevel: 'medium',
        requiresConfirmation: true,
        detectPort: 5000
      }
    ]
  })

  const diff = diffService.diffVersions(saved.workflow.id, '1.0.0', '1.1.0')
  expect(diff.changes).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'step_added', stepId: 'step_start_flask' })
  ]))

  const rollback = versionService.rollback(saved.workflow.id, '1.0.0', 'Back to initial steps.')
  expect(rollback.version).toBe('1.2.0')
  expect(versionService.listVersions(saved.workflow.id).map((version) => version.version)).toEqual(['1.2.0', '1.1.0', '1.0.0'])
  expect(workflowRegistry.getWorkflow(saved.workflow.id).workflow.currentVersion).toBe('1.2.0')
})

test('runner auto-executes low risk steps and waits for confirmation on medium risk steps', async () => {
  const saved = workflowRegistry.saveDraft(flaskDraft, { changelog: 'Initial workflow.' })
  const executed = []
  const runner = new WorkflowRunner({
    executor: {
      execute: async (step) => {
        executed.push(step.id)
        return { status: 'completed', exitCode: 0, stdoutTail: `${step.id} ok`, stderrTail: '' }
      }
    }
  })

  const run = await runner.start(saved.workflow.id)
  expect(run.status).toBe('waiting_confirmation')
  expect(run.currentStepId).toBe('step_install_requirements')
  expect(executed).toEqual(['step_check_python'])

  const confirmed = await runner.confirmStep(run.runId, true)
  expect(confirmed.status).toBe('completed')
  expect(executed).toEqual(['step_check_python', 'step_install_requirements'])

  const persisted = runner.getRun(run.runId)
  expect(persisted.stepResults).toEqual(expect.arrayContaining([
    expect.objectContaining({ stepId: 'step_install_requirements', confirmedByUser: true, status: 'completed' })
  ]))
})

test('temporary steps only affect the active run until explicitly saved as a version', async () => {
  const saved = workflowRegistry.saveDraft(flaskDraft, { changelog: 'Initial workflow.' })
  const runner = new WorkflowRunner({
    executor: { execute: async (step) => ({ status: 'completed', exitCode: 0, stdoutTail: step.id, stderrTail: '' }) }
  })

  const run = await runner.start(saved.workflow.id)
  await runner.insertTemporaryStep(run.runId, {
    reason: 'Port appears busy.',
    suggestedStep: {
      id: 'temp_check_port',
      type: 'check_command',
      title: 'Check port',
      command: 'netstat -ano | findstr :5000',
      riskLevel: 'low',
      requiresConfirmation: false
    }
  })

  const withTemp = runner.getRun(run.runId)
  expect(withTemp.insertedTemporarySteps[0].stepId).toBe('temp_check_port')
  expect(workflowRegistry.getWorkflow(saved.workflow.id).version.steps.map((step) => step.id)).not.toContain('temp_check_port')

  const newVersion = versionService.createVersionFromRun(saved.workflow.id, run.runId, 'Keep port check.', { includeTemporarySteps: true })
  expect(newVersion.steps.map((step) => step.id)).toContain('temp_check_port')
})

test('package service exports previews and blocks forbidden files before import', async () => {
  const saved = workflowRegistry.saveDraft(flaskDraft, { changelog: 'Initial workflow.' })
  const exported = await packageService.exportWorkflow(saved.workflow.id)

  const preview = await packageService.previewPackage(exported.packagePath, {
    sourceUrl: 'https://community.example/workflows/manifest.json',
    sourceTrustState: 'untrusted',
    signatureState: 'unsigned'
  })

  expect(preview.workflow.name).toBe('Flask local start')
  expect(preview.requiresStrongConfirmation).toBe(true)
  expect(preview.riskSummary.hasNetworkCommand).toBe(true)

  const badDir = path.join(TMP, 'bad-package')
  fs.mkdirSync(badDir, { recursive: true })
  fs.copyFileSync(path.join(process.env.AGENTDEV_WORKFLOW_SKILLS_DIR, saved.workflow.id, 'workflow.json'), path.join(badDir, 'workflow.json'))
  fs.writeFileSync(path.join(badDir, 'SKILL.md'), '# Bad\n', 'utf-8')
  fs.writeFileSync(path.join(badDir, 'install.ps1'), 'Write-Host bad', 'utf-8')
  const badPackage = path.join(TMP, 'bad.aionworkflow')
  await packageService.createPackageFromDirectory(badDir, badPackage)

  await expect(packageService.previewPackage(badPackage)).rejects.toThrow(/forbidden/i)
})
