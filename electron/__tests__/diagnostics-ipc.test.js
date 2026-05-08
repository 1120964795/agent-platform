import { test, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-diagnostics-ipc-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')
const require = createRequire(import.meta.url)
const diagnostics = require('../ipc/diagnostics')
const experiences = require('../ipc/experiences')
const { store } = require('../store')

function createIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler))
  }
}

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
  fs.mkdirSync(TMP, { recursive: true })
})

test('diagnostics IPC registers observer lifecycle handlers', async () => {
  const ipcMain = createIpcMain()
  const companionService = {
    listTargets: vi.fn(async () => [{ id: 'window:1', type: 'window' }]),
    selectRegion: vi.fn(async () => ({ type: 'region', width: 300, height: 120 })),
    start: vi.fn(async () => ({ status: 'running' })),
    stop: vi.fn(() => ({ status: 'stopped' })),
    resumeNow: vi.fn(() => ({ status: 'running' })),
    status: vi.fn(() => ({ session: { status: 'running' }, hasModel: true, advancedRiskExecutionEnabled: false, libraryNotice: '' })),
    ignore: vi.fn(),
    listDiagnostics: vi.fn(() => []),
    getDiagnosis: vi.fn(() => null),
    popupManager: { close: vi.fn() }
  }

  diagnostics.createRegister({ companionService, mainWindowRef: () => null })(ipcMain)

  expect([...ipcMain.handlers.keys()]).toEqual(expect.arrayContaining([
    'diagnostics:targets',
    'diagnostics:selectRegion',
    'diagnostics:start',
    'diagnostics:stop',
    'diagnostics:resumeNow',
    'diagnostics:status',
    'diagnostics:ignore',
    'diagnostics:list',
    'diagnostics:get',
    'diagnostics:executeFix',
    'diagnostics:explain',
    'diagnostics:rewritePlan',
    'diagnostics:popup-action'
  ]))

  const targets = await ipcMain.handlers.get('diagnostics:targets')({}, {})
  expect(targets.targets).toEqual([{ id: 'window:1', type: 'window' }])
})

test('popup action opens one diagnosis explanation in main window', async () => {
  const ipcMain = createIpcMain()
  const send = vi.fn()
  const close = vi.fn()
  const mainWindow = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    webContents: { send }
  }
  const companionService = {
    listTargets: vi.fn(async () => []),
    selectRegion: vi.fn(async () => null),
    start: vi.fn(async () => null),
    stop: vi.fn(() => null),
    resumeNow: vi.fn(() => null),
    status: vi.fn(() => ({ session: null, hasModel: false, advancedRiskExecutionEnabled: false, libraryNotice: '' })),
    ignore: vi.fn(),
    listDiagnostics: vi.fn(() => []),
    getDiagnosis: vi.fn(() => null),
    popupManager: { close }
  }

  diagnostics.createRegister({ companionService, mainWindowRef: () => mainWindow })(ipcMain)
  const result = await ipcMain.handlers.get('diagnostics:popup-action')({}, {
    action: 'open-diagnosis-explanation',
    diagnosisId: 'diag_1'
  })

  expect(result).toEqual({ ok: true })
  expect(mainWindow.restore).toHaveBeenCalled()
  expect(mainWindow.show).toHaveBeenCalled()
  expect(mainWindow.focus).toHaveBeenCalled()
  expect(send).toHaveBeenCalledWith('diagnostics:event', {
    type: 'popup-open-diagnosis-explanation',
    diagnosisId: 'diag_1',
    diagnosisIds: ['diag_1']
  })
  expect(close).toHaveBeenCalled()
})

test('default diagnostics register receives companion service deps', async () => {
  const ipcMain = createIpcMain()
  const companionService = {
    listTargets: vi.fn(async () => [{ id: 'window:2', type: 'window', title: 'PowerShell' }]),
    selectRegion: vi.fn(async () => null),
    start: vi.fn(async () => null),
    stop: vi.fn(() => null),
    resumeNow: vi.fn(() => null),
    status: vi.fn(() => ({ session: null, hasModel: false, advancedRiskExecutionEnabled: false, libraryNotice: '' })),
    ignore: vi.fn(),
    listDiagnostics: vi.fn(() => []),
    getDiagnosis: vi.fn(() => null),
    popupManager: { close: vi.fn() }
  }

  diagnostics.register(ipcMain, { companionService, mainWindowRef: () => null })

  const result = await ipcMain.handlers.get('diagnostics:targets')({}, {})
  expect(result).toMatchObject({
    ok: true,
    targets: [{ id: 'window:2', type: 'window', title: 'PowerShell' }]
  })
  expect(companionService.listTargets).toHaveBeenCalled()
})

test('diagnostics:explain returns updated diagnosis with model explanation', async () => {
  const ipcMain = createIpcMain()
  const diagnosis = {
    id: 'diag_1',
    username: 'alice',
    title: 'Python 依赖缺失',
    meaning: '规则说明',
    modelExplanation: '模型补充说明'
  }
  const companionService = {
    listTargets: vi.fn(async () => []),
    selectRegion: vi.fn(async () => null),
    start: vi.fn(async () => null),
    stop: vi.fn(() => null),
    resumeNow: vi.fn(() => null),
    status: vi.fn(() => ({ session: null, hasModel: true, advancedRiskExecutionEnabled: false, libraryNotice: '' })),
    ignore: vi.fn(),
    listDiagnostics: vi.fn(() => []),
    getDiagnosis: vi.fn(() => diagnosis),
    explainDiagnosis: vi.fn(async () => diagnosis),
    rewritePlan: vi.fn(async () => null),
    popupManager: { close: vi.fn() }
  }

  diagnostics.createRegister({ companionService, mainWindowRef: () => null })(ipcMain)
  const result = await ipcMain.handlers.get('diagnostics:explain')({}, { username: 'alice', diagnosisId: 'diag_1' })
  expect(result).toMatchObject({
    ok: true,
    diagnosis: {
      meaning: '规则说明',
      modelExplanation: '模型补充说明'
    }
  })
})

test('diagnostics:rewritePlan returns risk-checked plan', async () => {
  const ipcMain = createIpcMain()
  const plan = {
    command: 'pip install flask',
    cwd: 'D:\\new',
    reason: '当前项目目录不同，命令保持一致。',
    riskLevel: 'low',
    blocked: false
  }
  const companionService = {
    listTargets: vi.fn(async () => []),
    selectRegion: vi.fn(async () => null),
    start: vi.fn(async () => null),
    stop: vi.fn(() => null),
    resumeNow: vi.fn(() => null),
    status: vi.fn(() => ({ session: null, hasModel: true, advancedRiskExecutionEnabled: false, libraryNotice: '' })),
    ignore: vi.fn(),
    listDiagnostics: vi.fn(() => []),
    getDiagnosis: vi.fn(() => null),
    explainDiagnosis: vi.fn(async () => null),
    rewritePlan: vi.fn(async () => plan),
    popupManager: { close: vi.fn() }
  }

  diagnostics.createRegister({ companionService, mainWindowRef: () => null })(ipcMain)
  const result = await ipcMain.handlers.get('diagnostics:rewritePlan')({}, {
    username: 'alice',
    diagnosisId: 'diag_1',
    experienceId: 'exp_1'
  })
  expect(result).toMatchObject({
    ok: true,
    plan: {
      command: 'pip install flask',
      cwd: 'D:\\new',
      riskLevel: 'low',
      blocked: false
    },
    reason: '当前项目目录不同，命令保持一致。'
  })
})

test('diagnostics:executeFix uses strong confirmation and updates experience on success', async () => {
  const ipcMain = createIpcMain()
  const diagnosis = {
    id: 'diag_1',
    username: 'alice',
    title: 'Python 依赖缺失',
    experienceId: 'exp_1',
    recommendedFixes: [{
      id: 'fix_1',
      command: 'Invoke-WebRequest https://example.com/install.exe -OutFile install.exe',
      cwd: 'D:\\demo',
      riskLevel: 'high',
      blocked: false,
      riskExplanation: '下载可执行文件',
      requiresStrongYesNo: true,
      downloadUrl: 'https://example.com/install.exe',
      downloadTarget: 'install.exe',
      downloadExtension: '.exe',
      executesAfterDownload: false,
      requiresAdmin: false
    }]
  }

  const companionService = {
    listTargets: vi.fn(async () => []),
    selectRegion: vi.fn(async () => null),
    start: vi.fn(async () => null),
    stop: vi.fn(() => null),
    resumeNow: vi.fn(() => null),
    status: vi.fn(() => ({ session: null, hasModel: true, advancedRiskExecutionEnabled: false, libraryNotice: '' })),
    ignore: vi.fn(),
    listDiagnostics: vi.fn(() => []),
    getDiagnosis: vi.fn(() => diagnosis),
    explainDiagnosis: vi.fn(async () => null),
    rewritePlan: vi.fn(async () => null),
    recordExecution: vi.fn(() => ({ id: 'exp_1', status: 'resolved' })),
    popupManager: { close: vi.fn() }
  }
  const execute = vi.fn(async () => ({ exit_code: 0, stdout: 'ok', stderr: '' }))
  const requestConfirm = vi.fn(async () => true)

  diagnostics.createRegister({
    companionService,
    execute,
    requestConfirm,
    mainWindowRef: () => null
  })(ipcMain)

  const result = await ipcMain.handlers.get('diagnostics:executeFix')(
    { sender: { send: vi.fn() } },
    { username: 'alice', diagnosisId: 'diag_1', fixId: 'fix_1' }
  )

  expect(requestConfirm).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'diagnosis-fix'
  }))
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({
    command: 'Invoke-WebRequest https://example.com/install.exe -OutFile install.exe'
  }), expect.objectContaining({
    alreadyConfirmed: true
  }))
  expect(result).toMatchObject({
    ok: true,
    experience: { status: 'resolved' },
    result: { exit_code: 0 }
  })
})

test('experiences IPC lists, searches, updates, deletes, and exports records', async () => {
  store.upsertExperience({
    id: 'exp_1',
    username: 'alice',
    title: 'Flask 依赖缺失处理方法',
    status: 'draft',
    errorSignature: 'python.module_not_found.flask',
    errorKeywords: ['flask'],
    notes: ['pip install flask']
  })

  const ipcMain = createIpcMain()
  experiences.register(ipcMain, { storeRef: store, companionService: { cleanupExperiencesIfNeeded: vi.fn() } })

  const listResult = await ipcMain.handlers.get('experiences:list')({}, { username: 'alice' })
  expect(listResult.items.map((item) => item.id)).toEqual(['exp_1'])

  const searchResult = await ipcMain.handlers.get('experiences:search')({}, { username: 'alice', query: 'flask' })
  expect(searchResult.items.map((item) => item.id)).toEqual(['exp_1'])

  const updateResult = await ipcMain.handlers.get('experiences:update')({}, {
    username: 'alice',
    id: 'exp_1',
    status: 'resolved',
    notes: ['done']
  })
  expect(updateResult.item.status).toBe('resolved')

  const exportResult = await ipcMain.handlers.get('experiences:export')({}, { username: 'alice' })
  expect(exportResult).toMatchObject({
    ok: true,
    filename: expect.stringContaining('aionui-experiences-'),
    payload: {
      version: 1,
      username: 'alice'
    }
  })

  const deleteResult = await ipcMain.handlers.get('experiences:delete')({}, { username: 'alice', id: 'exp_1' })
  expect(deleteResult.deleted).toBe(true)
})
