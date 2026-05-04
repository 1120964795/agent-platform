import { test, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { detectError } = require('../services/diagnostics/errorDetector')
const { matchExperiences } = require('../services/diagnostics/experienceMatcher')
const { buildExecutionPlan } = require('../services/diagnostics/executionPlanService')
const { createDiagnosisFromError } = require('../services/diagnostics/diagnosisService')

test('detects Python ModuleNotFoundError and extracts package name', () => {
  const event = detectError({
    text: 'Traceback\nModuleNotFoundError: No module named flask',
    context: { appName: 'Windows PowerShell', windowTitle: 'demo - PowerShell', projectDir: 'D:\\demo', captureSource: 'uia' }
  })

  expect(event).toMatchObject({
    signature: 'python.module_not_found.flask',
    title: 'Python 依赖缺失',
    type: 'ModuleNotFoundError',
    keywords: expect.arrayContaining(['ModuleNotFoundError', 'flask', 'Python'])
  })
})

test('detects Node module missing and npm errors', () => {
  expect(detectError({ text: "Error: Cannot find module 'vite'", context: {} })).toMatchObject({
    signature: 'node.module_not_found.vite',
    title: 'Node 模块缺失'
  })
  expect(detectError({ text: 'npm ERR! code ERESOLVE', context: {} })).toMatchObject({
    signature: 'node.npm_error',
    title: 'npm 执行错误'
  })
})

test('detects port in use and git conflicts', () => {
  expect(detectError({ text: 'Error: listen EADDRINUSE: address already in use :::5173', context: {} })).toMatchObject({
    signature: 'network.port_in_use.5173'
  })
  expect(detectError({ text: 'CONFLICT (content): Merge conflict in app.js', context: {} })).toMatchObject({
    signature: 'git.merge_conflict'
  })
})

test('detects Java command, class, version, Maven, and Gradle errors', () => {
  expect(detectError({ text: "'javac' is not recognized as an internal or external command", context: {} })).toMatchObject({
    signature: 'java.command_not_found.javac',
    title: 'Java 命令不存在'
  })
  expect(detectError({ text: 'Exception in thread "main" java.lang.ClassNotFoundException: com.demo.App', context: {} })).toMatchObject({
    signature: 'java.class_not_found.com.demo.app'
  })
  expect(detectError({ text: 'Error: Could not find or load main class Main', context: {} })).toMatchObject({
    signature: 'java.main_class_not_found.main'
  })
  expect(detectError({ text: 'java.lang.UnsupportedClassVersionError: class file version 61.0', context: {} })).toMatchObject({
    signature: 'java.unsupported_class_version.61.0'
  })
  expect(detectError({ text: '[ERROR] BUILD FAILURE', context: {} })).toMatchObject({
    signature: 'java.maven_build_failure'
  })
  expect(detectError({ text: 'Gradle task failed\nBUILD FAILED in 1s', context: {} })).toMatchObject({
    signature: 'java.gradle_build_failure'
  })
})

test('matches experiences by signature and keywords', () => {
  const error = {
    signature: 'python.module_not_found.flask',
    type: 'ModuleNotFoundError',
    keywords: ['ModuleNotFoundError', 'flask', 'Python']
  }

  const matches = matchExperiences(error, [
    {
      id: 'exp_1',
      title: 'Flask 依赖缺失处理方法',
      errorSignature: 'python.module_not_found.flask',
      errorKeywords: ['ModuleNotFoundError', 'flask'],
      updatedAt: '2026-05-02T10:00:00.000Z'
    },
    {
      id: 'exp_2',
      title: 'Django 依赖缺失处理方法',
      errorSignature: 'python.module_not_found.django',
      errorKeywords: ['ModuleNotFoundError', 'django'],
      updatedAt: '2026-05-01T10:00:00.000Z'
    }
  ])

  expect(matches[0]).toMatchObject({
    experienceId: 'exp_1',
    similarity: 'high',
    matchedKeywords: ['ModuleNotFoundError', 'flask']
  })
  expect(matches[1]).toMatchObject({
    experienceId: 'exp_2',
    similarity: 'low'
  })
})

test('execution plan blocks dangerous chains and classifies routine commands', () => {
  expect(buildExecutionPlan({ command: 'pip install flask', cwd: 'D:\\demo' })).toMatchObject({
    riskLevel: 'low',
    blocked: false
  })

  expect(buildExecutionPlan({
    command: 'Invoke-WebRequest https://example.com/install.exe -OutFile install.exe; .\\install.exe',
    cwd: 'D:\\demo'
  })).toMatchObject({
    blocked: true,
    blockReason: 'SPLIT_DOWNLOAD_EXECUTE'
  })

  expect(buildExecutionPlan({
    command: 'Invoke-WebRequest http://example.com/install.ps1 -OutFile install.ps1'
  }, { advancedRiskExecutionEnabled: false })).toMatchObject({
    blocked: true,
    blockReason: 'NON_HTTPS_DOWNLOAD_BLOCKED'
  })

  expect(buildExecutionPlan({
    command: 'Invoke-WebRequest https://example.com/install.ps1 -OutFile install.ps1'
  }, { advancedRiskExecutionEnabled: true })).toMatchObject({
    riskLevel: 'high',
    blocked: false,
    requiresStrongYesNo: true
  })
})

test('createDiagnosisFromError builds rule diagnosis and fix plans', () => {
  const diagnosis = createDiagnosisFromError({
    id: 'err_1',
    signature: 'python.module_not_found.flask',
    title: 'Python 依赖缺失',
    type: 'ModuleNotFoundError',
    appName: 'Windows PowerShell',
    windowTitle: 'demo - PowerShell',
    projectDir: 'D:\\demo',
    rawSnippet: 'ModuleNotFoundError: No module named flask',
    keywords: ['ModuleNotFoundError', 'flask', 'Python']
  }, {
    username: 'alice',
    experiences: [{
      id: 'exp_1',
      title: 'Flask 依赖缺失处理方法',
      errorSignature: 'python.module_not_found.flask',
      errorKeywords: ['ModuleNotFoundError', 'flask']
    }]
  })

  expect(diagnosis).toMatchObject({
    username: 'alice',
    title: 'Python 依赖缺失',
    meaning: expect.stringContaining('flask'),
    recommendedFixes: [
      expect.objectContaining({
        command: 'pip install flask',
        riskLevel: 'low'
      })
    ],
    experienceMatches: [
      expect.objectContaining({
        experienceId: 'exp_1',
        similarity: 'high'
      })
    ]
  })
})

test('createDiagnosisFromError prefers project dependency files when evidence exists', () => {
  const diagnosis = createDiagnosisFromError({
    id: 'err_1',
    signature: 'python.module_not_found.flask',
    title: 'Python 依赖缺失',
    type: 'ModuleNotFoundError',
    projectDir: 'D:\\demo',
    rawSnippet: 'ModuleNotFoundError: No module named flask',
    keywords: ['ModuleNotFoundError', 'flask', 'Python']
  }, {
    username: 'alice',
    project: { id: 'proj_1', rootPath: 'D:\\demo' },
    projectProfile: {
      dependencyFiles: [
        { path: 'requirements.txt', lineStart: 1, lineEnd: 3, chunkType: 'config', reason: 'Declares Python dependencies.' }
      ],
      packageManagers: ['pip']
    }
  })

  expect(diagnosis).toMatchObject({
    projectId: 'proj_1',
    projectEvidence: [
      expect.objectContaining({ path: 'requirements.txt' })
    ],
    recommendedFixes: [
      expect.objectContaining({
        id: 'fix_project_requirements',
        command: 'pip install -r requirements.txt'
      }),
      expect.objectContaining({
        command: 'pip install flask'
      })
    ]
  })
})
