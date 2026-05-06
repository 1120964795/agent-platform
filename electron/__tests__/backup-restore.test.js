import { test, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'
import JSZip from 'jszip'

const TMP = path.join(os.tmpdir(), `agentdev-backup-test-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')
process.env.AGENTDEV_WORKFLOW_SKILLS_DIR = path.join(TMP, 'workflow-skills')
process.env.AGENTDEV_USER_SKILLS_DIR = path.join(TMP, 'user-skills')
process.env.AGENTDEV_BUILTIN_SKILLS_DIR = path.join(TMP, 'builtin-skills')

const require = createRequire(import.meta.url)
const { store } = require('../store')
const userRules = require('../services/userRules')
const workflowRegistry = require('../workflows/registry')
const backupService = require('../backup/backupService')

const workflowDraft = {
  name: 'Vite local start',
  description: 'Install packages and start the Vite dev server with confirmation.',
  technologyStack: ['Node.js', 'Vite'],
  steps: [
    { id: 'step_node', type: 'check_command', title: 'Check Node', command: 'node --version', riskLevel: 'low', requiresConfirmation: false },
    { id: 'step_install', type: 'confirm_command', title: 'Install packages', command: 'npm install', riskLevel: 'medium', requiresNetwork: true, requiresConfirmation: true },
    { id: 'step_start', type: 'start_service', title: 'Start Vite', command: 'npm run dev', riskLevel: 'medium', requiresConfirmation: true }
  ]
}

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
  fs.mkdirSync(process.env.AGENTDEV_BUILTIN_SKILLS_DIR, { recursive: true })
})

async function seedAndExportBackup() {
  store.setConfig({
    apiKey: 'sk-should-not-export',
    minimaxApiKey: 'mini-should-not-export',
    permissionMode: 'full',
    shell_whitelist_extra: ['npm'],
    shell_blacklist_extra: ['reg']
  })
  store.saveData({
    version: 1,
    conversations: [],
    artifacts: [],
    scheduledTasks: [],
    experiences: [{ id: 'exp_1', title: 'Fix EADDRINUSE', rawOcrText: undefined }],
    projects: [{ id: 'proj_1', name: 'Vite Demo', path: 'D:\\demos\\vite-demo' }],
    projectProfiles: [{ id: 'profile_1', projectId: 'proj_1', summary: 'Vite demo project' }],
    workflowTemplateSources: [{ sourceId: 'community_1', name: 'Community', url: 'https://example.com/manifest.json', trustState: 'untrusted' }]
  })
  userRules.appendRule('Prefer workflow demos for local project startup.')
  workflowRegistry.saveDraft(workflowDraft, { changelog: 'Initial Vite workflow.' })

  const packagePath = path.join(TMP, 'aion-test.aionbackup')
  await backupService.exportBackup({ packagePath, username: 'tester', appVersion: '4.0.0' })
  return packagePath
}

test('exports previewable .aionbackup packages without secrets or full run logs', async () => {
  const packagePath = await seedAndExportBackup()
  const preview = await backupService.previewBackup(packagePath)
  expect(preview.manifest).toMatchObject({
    schemaVersion: 1,
    appVersion: '4.0.0',
    username: 'tester'
  })
  expect(preview.summary).toMatchObject({ experiences: 1, projects: 1, projectProfiles: 1, workflowSkills: 1, templateSources: 1 })
  expect(preview.restorePolicy).toMatchObject({ overwritesProjectSource: false, restoresSecrets: false, requiresReindex: true })

  const zip = await JSZip.loadAsync(fs.readFileSync(packagePath))
  const userSettings = JSON.parse(await zip.file('aion-backup/user-settings.json').async('string'))
  expect(userSettings.settings.apiKey).toBeUndefined()
  expect(userSettings.settings.minimaxApiKey).toBeUndefined()
  expect(JSON.stringify(userSettings)).not.toContain('sk-should-not-export')
  expect(JSON.stringify(userSettings)).not.toContain('mini-should-not-export')
})

test('restores backup data by merge and recreates workflow skills without project source writes', async () => {
  const packagePath = await seedAndExportBackup()
  fs.rmSync(process.env.AGENTDEV_DATA_DIR, { recursive: true, force: true })
  fs.rmSync(process.env.AGENTDEV_WORKFLOW_SKILLS_DIR, { recursive: true, force: true })
  fs.rmSync(path.join(TMP, 'user_rules.md'), { force: true })

  const restored = await backupService.restoreBackup(packagePath)
  const data = store.getData()
  expect(restored.restored).toMatchObject({ experiences: 1, projects: 1, projectProfiles: 1, templateSources: 1, workflowSkills: 1, userRules: 1 })
  expect(data.experiences.map((item) => item.id)).toContain('exp_1')
  expect(data.projects.map((item) => item.id)).toContain('proj_1')
  expect(workflowRegistry.listWorkflows()).toHaveLength(1)
  expect(userRules.readRules().map((rule) => rule.text)).toContain('Prefer workflow demos for local project startup.')
  expect(store.getConfig().apiKey).toBe('')
})

test('preview rejects path traversal and forbidden sensitive files', async () => {
  const zipSlip = new JSZip()
  zipSlip.file('aion-backup/manifest.json', JSON.stringify({ schemaVersion: 1, contents: {} }))
  zipSlip.file('aion-backup/../evil.txt', 'bad')
  const zipSlipPath = path.join(TMP, 'zip-slip.aionbackup')
  fs.mkdirSync(TMP, { recursive: true })
  fs.writeFileSync(zipSlipPath, await zipSlip.generateAsync({ type: 'nodebuffer' }))
  await expect(backupService.previewBackup(zipSlipPath)).rejects.toThrow(/path traversal|under aion-backup/i)

  const forbidden = new JSZip()
  forbidden.file('aion-backup/manifest.json', JSON.stringify({ schemaVersion: 1, contents: {} }))
  forbidden.file('aion-backup/.env', 'TOKEN=secret')
  const forbiddenPath = path.join(TMP, 'forbidden.aionbackup')
  fs.writeFileSync(forbiddenPath, await forbidden.generateAsync({ type: 'nodebuffer' }))
  await expect(backupService.previewBackup(forbiddenPath)).rejects.toThrow(/forbidden/i)
})
