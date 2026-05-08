import { test, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-projects-services-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')
const require = createRequire(import.meta.url)
const { store } = require('../store')
const {
  createProjectServices,
  ProjectIgnorePolicy,
  getProjectIndexSchemaSql
} = require('../services/projects')
const {
  extractReplacementIntent,
  createUnifiedDiff
} = require('../services/projects/patchDraftService')

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
}

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
  fs.mkdirSync(TMP, { recursive: true })
})

test('project registry creates username-scoped projects and default settings', () => {
  const root = path.join(TMP, 'flask-blog')
  fs.mkdirSync(root, { recursive: true })
  const services = createProjectServices({ storeRef: store })

  const project = services.registry.add({ username: 'alice', rootPath: root })
  const duplicate = services.registry.add({ username: 'alice', rootPath: root })
  const bobProject = services.registry.add({ username: 'bob', rootPath: root })
  const settings = services.settings.getOrCreate(project.id)

  expect(duplicate.id).toBe(project.id)
  expect(bobProject.id).not.toBe(project.id)
  expect(services.registry.list('alice').map((item) => item.id)).toEqual([project.id])
  expect(settings).toMatchObject({
    projectId: project.id,
    watchEnabled: true,
    embeddingEnabled: false,
    debounceMs: 3000,
    maxFileBytes: 524288
  })
  expect(settings.includeExtensions).toContain('.ts')
  expect(settings.includeFilenames).toContain('.env.example')
})

test('project profile detects Python Flask entry and cited commands', () => {
  const root = path.join(TMP, 'flask-blog')
  writeFile(path.join(root, 'requirements.txt'), 'Flask==3.0.2\npytest==8.0.0\n')
  writeFile(path.join(root, 'app.py'), [
    'from flask import Flask',
    'app = Flask(__name__)',
    'if __name__ == "__main__":',
    '    app.run(debug=True)'
  ].join('\n'))
  const services = createProjectServices({ storeRef: store })
  const project = services.registry.add({ username: 'alice', rootPath: root })

  const profile = services.profiles.refresh(project)

  expect(profile.language).toBe('Python')
  expect(profile.frameworks).toContain('Flask')
  expect(profile.packageManagers).toContain('pip')
  expect(profile.dependencyFiles[0]).toMatchObject({ path: 'requirements.txt', lineStart: 1 })
  expect(profile.entryFiles[0]).toMatchObject({ path: 'app.py', chunkType: 'entry' })
  expect(profile.startCommands).toEqual(expect.arrayContaining([
    expect.objectContaining({ command: 'python app.py', sourcePath: 'app.py' })
  ]))
  expect(profile.testCommands).toEqual(expect.arrayContaining([
    expect.objectContaining({ command: 'pytest', sourcePath: 'requirements.txt' })
  ]))
})

test('project profile detects Node package scripts and frameworks', () => {
  const root = path.join(TMP, 'vite-demo')
  writeFile(path.join(root, 'package.json'), JSON.stringify({
    scripts: {
      dev: 'vite --host 0.0.0.0',
      test: 'vitest run'
    },
    dependencies: {
      '@vitejs/plugin-react': '^4.0.0',
      react: '^18.0.0'
    },
    devDependencies: {
      vite: '^5.0.0',
      vitest: '^1.0.0'
    }
  }, null, 2))
  writeFile(path.join(root, 'src', 'main.jsx'), 'import React from "react"\n')
  const services = createProjectServices({ storeRef: store })
  const project = services.registry.add({ username: 'alice', rootPath: root })

  const profile = services.profiles.refresh(project)

  expect(profile.language).toBe('JavaScript')
  expect(profile.frameworks).toEqual(expect.arrayContaining(['Vite', 'React']))
  expect(profile.packageManagers).toContain('npm')
  expect(profile.startCommands).toEqual(expect.arrayContaining([
    expect.objectContaining({ command: 'npm run dev', sourcePath: 'package.json' })
  ]))
  expect(profile.testCommands).toEqual(expect.arrayContaining([
    expect.objectContaining({ command: 'npm test', sourcePath: 'package.json' })
  ]))
})

test('project profile detects Java Maven and Gradle project commands', () => {
  const mavenRoot = path.join(TMP, 'java-maven')
  const gradleRoot = path.join(TMP, 'java-gradle')
  writeFile(path.join(mavenRoot, 'pom.xml'), [
    '<project>',
    '  <dependencies>',
    '    <dependency><artifactId>spring-boot-starter-web</artifactId></dependency>',
    '  </dependencies>',
    '</project>'
  ].join('\n'))
  writeFile(path.join(mavenRoot, 'src', 'main', 'java', 'App.java'), 'class App {}\n')
  writeFile(path.join(gradleRoot, 'build.gradle'), [
    'plugins {',
    '  id "org.springframework.boot" version "3.2.0"',
    '}'
  ].join('\n'))
  writeFile(path.join(gradleRoot, 'src', 'main', 'java', 'App.java'), 'class App {}\n')
  const services = createProjectServices({ storeRef: store })
  const mavenProject = services.registry.add({ username: 'alice', rootPath: mavenRoot })
  const gradleProject = services.registry.add({ username: 'alice', rootPath: gradleRoot })

  const mavenProfile = services.profiles.refresh(mavenProject)
  const gradleProfile = services.profiles.refresh(gradleProject)

  expect(mavenProfile).toMatchObject({
    language: 'Java',
    packageManagers: expect.arrayContaining(['maven']),
    frameworks: expect.arrayContaining(['Spring Boot'])
  })
  expect(mavenProfile.startCommands).toEqual(expect.arrayContaining([
    expect.objectContaining({ command: 'mvn spring-boot:run', sourcePath: 'pom.xml' })
  ]))
  expect(mavenProfile.testCommands).toEqual(expect.arrayContaining([
    expect.objectContaining({ command: 'mvn test', sourcePath: 'pom.xml' })
  ]))
  expect(gradleProfile).toMatchObject({
    language: 'Java',
    packageManagers: expect.arrayContaining(['gradle']),
    frameworks: expect.arrayContaining(['Spring Boot'])
  })
  expect(gradleProfile.startCommands).toEqual(expect.arrayContaining([
    expect.objectContaining({ command: 'gradle bootRun', sourcePath: 'build.gradle' })
  ]))
  expect(gradleProfile.testCommands).toEqual(expect.arrayContaining([
    expect.objectContaining({ command: 'gradle test', sourcePath: 'build.gradle' })
  ]))
})

test('project ignore policy blocks sensitive paths and honors gitignore', () => {
  const root = path.join(TMP, 'policy')
  writeFile(path.join(root, '.gitignore'), 'ignored/**\n')
  writeFile(path.join(root, '.env'), 'SECRET=1\n')
  writeFile(path.join(root, '.env.example'), 'SECRET=\n')
  writeFile(path.join(root, 'ignored', 'app.py'), 'print("skip")\n')
  writeFile(path.join(root, 'src', 'app.py'), 'print("ok")\n')
  writeFile(path.join(TMP, 'outside.py'), 'print("outside")\n')

  const policy = new ProjectIgnorePolicy()
  const settings = {
    maxFileBytes: 524288,
    includeExtensions: ['.py'],
    includeFilenames: ['.env.example'],
    excludeGlobs: []
  }

  expect(policy.isAllowedFile({ rootPath: root, filePath: path.join(root, '.env'), settings }).reason).toBe('SENSITIVE_FILE')
  expect(policy.isAllowedFile({ rootPath: root, filePath: path.join(root, '.env.example'), settings }).allowed).toBe(true)
  expect(policy.isAllowedFile({ rootPath: root, filePath: path.join(root, 'ignored', 'app.py'), settings }).reason).toBe('EXCLUDED_BY_PATTERN')
  expect(policy.isAllowedFile({ rootPath: root, filePath: path.join(root, 'src', 'app.py'), settings }).allowed).toBe(true)
  expect(policy.isAllowedFile({ rootPath: root, filePath: path.join(TMP, 'outside.py'), settings }).reason).toBe('OUTSIDE_PROJECT')
})

test('project index schema includes FTS and patch record tables', () => {
  const sql = getProjectIndexSchemaSql()
  expect(sql).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS project_chunks_fts USING fts5')
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS patch_apply_records')
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS project_settings')
})

test('project indexer builds searchable chunks with citations', async () => {
  const root = path.join(TMP, 'searchable')
  writeFile(path.join(root, 'README.md'), '# Demo\n\nRun with npm run dev.\n')
  writeFile(path.join(root, 'src', 'api', 'auth.ts'), [
    'export async function login() {',
    '  return fetch("/auth/login")',
    '}'
  ].join('\n'))
  writeFile(path.join(root, '.env'), 'SECRET=1\n')
  const services = createProjectServices({ storeRef: store })
  const project = services.registry.add({ username: 'alice', rootPath: root })
  const settings = services.settings.getOrCreate(project.id)

  const stats = await services.indexer.indexProject(project, settings)
  const search = await services.search.search(project.id, 'login auth', { limit: 3 })

  expect(stats.status).toBe('indexed')
  expect(stats.fileCount).toBe(2)
  expect(search.results[0]).toMatchObject({
    path: 'src/api/auth.ts',
    lineStart: 1,
    chunkType: 'source'
  })
  expect(search.results[0].reason).toContain('SQLite FTS')
  expect(store.listProjectFiles(project.id).map((item) => item.relativePath)).not.toContain('.env')
})

test('project indexer incrementally updates modified and deleted files', async () => {
  const root = path.join(TMP, 'incremental')
  writeFile(path.join(root, 'src', 'api.js'), 'export const marker = "oldtoken"\n')
  writeFile(path.join(root, 'README.md'), 'olddocsunique\n')
  const services = createProjectServices({ storeRef: store })
  const project = services.registry.add({ username: 'alice', rootPath: root })
  const settings = services.settings.getOrCreate(project.id)

  await services.indexer.indexProject(project, settings)
  expect((await services.search.search(project.id, 'oldtoken')).results[0]).toMatchObject({ path: 'src/api.js' })

  writeFile(path.join(root, 'src', 'api.js'), 'export const marker = "newtoken"\n')
  const changedStats = await services.indexer.indexChangedFiles(project, settings, ['src/api.js'])
  const oldSearch = await services.search.search(project.id, 'oldtoken')
  const newSearch = await services.search.search(project.id, 'newtoken')

  expect(changedStats).toMatchObject({
    status: 'indexed',
    changedFiles: 1,
    removedFiles: 0
  })
  expect(oldSearch.results.find((item) => item.path === 'src/api.js')).toBeUndefined()
  expect(newSearch.results[0]).toMatchObject({ path: 'src/api.js' })

  fs.unlinkSync(path.join(root, 'README.md'))
  const deletedStats = await services.indexer.indexChangedFiles(project, settings, ['README.md'])
  const files = store.listProjectFiles(project.id).map((item) => item.relativePath)
  const deletedSearch = await services.search.search(project.id, 'olddocsunique')

  expect(deletedStats.removedFiles).toBe(1)
  expect(files).not.toContain('README.md')
  expect(deletedSearch.results).toEqual([])
})

test('project index queue coalesces changed paths and refreshes the index', async () => {
  const root = path.join(TMP, 'queue')
  writeFile(path.join(root, 'README.md'), 'first token\n')
  const services = createProjectServices({ storeRef: store })
  const project = services.registry.add({ username: 'alice', rootPath: root })
  const settings = services.settings.getOrCreate(project.id)
  await services.indexer.indexProject(project, settings)

  writeFile(path.join(root, 'README.md'), 'second token\n')
  await services.indexQueue.enqueue(project, settings, ['README.md', 'README.md'])

  const queueStatus = services.indexQueue.status(project.id)
  const search = await services.search.search(project.id, 'second token')

  expect(queueStatus).toMatchObject({
    status: 'indexed',
    pendingFiles: 0
  })
  expect(search.results[0]).toMatchObject({ path: 'README.md' })
})

test('project QA answers commands only when backed by citations', async () => {
  const root = path.join(TMP, 'qa')
  writeFile(path.join(root, 'package.json'), JSON.stringify({
    scripts: { dev: 'vite --host 0.0.0.0', test: 'vitest run' },
    devDependencies: { vite: '^5.0.0', vitest: '^1.0.0' }
  }, null, 2))
  const services = createProjectServices({ storeRef: store })
  const project = services.registry.add({ username: 'alice', rootPath: root })
  const profile = services.profiles.refresh(project)
  await services.indexer.indexProject(project, services.settings.getOrCreate(project.id))

  const startAnswer = await services.qa.answer({ project, profile, question: '这个项目怎么启动' })
  const noEvidence = await services.qa.answer({ project, profile, question: '支付回调在哪里' })

  expect(startAnswer).toMatchObject({
    confidence: 'high',
    suggestedCommands: [expect.objectContaining({ command: 'npm run dev' })]
  })
  expect(startAnswer.citations[0]).toMatchObject({ path: 'package.json' })
  expect(noEvidence.confidence).toBe('none')
  expect(noEvidence.citations).toEqual([])
})

test('patch draft service extracts replacement intent and creates unified diffs', () => {
  expect(extractReplacementIntent('replace /api/login with /auth/login')).toEqual({
    from: '/api/login',
    to: '/auth/login'
  })
  expect(extractReplacementIntent('\u628a /api/login \u6539\u4e3a /auth/login')).toEqual({
    from: '/api/login',
    to: '/auth/login'
  })

  const diff = createUnifiedDiff('src/api/auth.ts', [
    'export function login() {',
    '  return fetch("/api/login")',
    '}'
  ], 1, '  return fetch("/auth/login")')

  expect(diff).toContain('diff --git a/src/api/auth.ts b/src/api/auth.ts')
  expect(diff).toContain('-  return fetch("/api/login")')
  expect(diff).toContain('+  return fetch("/auth/login")')
})

test('project QA returns patch drafts from cited search evidence', async () => {
  const root = path.join(TMP, 'qa-patch')
  writeFile(path.join(root, 'README.md'), 'Docs mention replace /api/login with /auth/login.\n')
  writeFile(path.join(root, 'src', 'api', 'auth.ts'), [
    'export async function login() {',
    '  return fetch("/api/login")',
    '}'
  ].join('\n'))
  writeFile(path.join(root, 'src', 'api', 'auth.test.ts'), [
    'expect(loginPath).toBe("/api/login")'
  ].join('\n'))
  writeFile(path.join(root, 'server', 'routes', 'auth.js'), [
    'app.post("/auth/login", loginHandler)'
  ].join('\n'))
  const services = createProjectServices({ storeRef: store })
  const project = services.registry.add({ username: 'alice', rootPath: root })
  const settings = services.settings.getOrCreate(project.id)
  const profile = services.profiles.refresh(project)
  await services.indexer.indexProject(project, settings)

  const answer = await services.qa.answer({
    username: 'alice',
    project,
    profile,
    settings,
    question: 'replace /api/login with /auth/login'
  })

  expect(answer.citations.length).toBeGreaterThan(0)
  expect(answer.patchDrafts[0]).toMatchObject({
    projectId: project.id,
    affectedFiles: [expect.objectContaining({ path: 'src/api/auth.ts' })]
  })
  expect(answer.patchDrafts[0].diff).toContain('+  return fetch("/auth/login")')
})

test('project QA can use a model answer when citations exist and a key is configured', async () => {
  const root = path.join(TMP, 'qa-model')
  writeFile(path.join(root, 'README.md'), '# Demo\n\nLogin lives in src/api/auth.ts.\n')
  writeFile(path.join(root, 'src', 'api', 'auth.ts'), 'export const loginPath = "/auth/login"\n')
  const modelClient = {
    answerProjectQuestion: async ({ sources }) => `模型回答，引用 ${sources[0].path}`
  }
  const services = createProjectServices({ storeRef: store, modelClient })
  const project = services.registry.add({ username: 'alice', rootPath: root })
  const settings = services.settings.getOrCreate(project.id)
  const profile = services.profiles.refresh(project)
  store.setUserConfig('alice', { apiKey: 'sk-test' })
  await services.indexer.indexProject(project, settings)

  const answer = await services.qa.answer({
    username: 'alice',
    project,
    profile,
    settings,
    question: 'login path'
  })

  expect(answer.answer).toContain('模型回答')
  expect(answer.citations.length).toBeGreaterThan(0)
})

test('patch service previews and applies safe unified diffs', () => {
  const root = path.join(TMP, 'patch-safe')
  writeFile(path.join(root, 'app.txt'), 'hello\nold\n')
  const services = createProjectServices({ storeRef: store })
  const project = services.registry.add({ username: 'alice', rootPath: root })
  const settings = services.settings.getOrCreate(project.id)
  const diff = [
    'diff --git a/app.txt b/app.txt',
    '--- a/app.txt',
    '+++ b/app.txt',
    '@@ -1,2 +1,2 @@',
    ' hello',
    '-old',
    '+new'
  ].join('\n')

  const preview = services.patch.preview(project, settings, {
    username: 'alice',
    title: 'Change app text',
    diff
  })
  const applied = services.patch.apply(project, settings, {
    patchId: preview.id,
    confirmed: true
  })

  expect(preview).toMatchObject({
    status: 'draft',
    riskLevel: 'medium',
    affectedFiles: [expect.objectContaining({ path: 'app.txt', changeType: 'modify' })]
  })
  expect(applied.status).toBe('applied')
  expect(fs.readFileSync(path.join(root, 'app.txt'), 'utf-8')).toContain('new')
})

test('patch service records conflicts without overwriting files', () => {
  const root = path.join(TMP, 'patch-conflict')
  writeFile(path.join(root, 'app.txt'), 'hello\ncurrent\n')
  const services = createProjectServices({ storeRef: store })
  const project = services.registry.add({ username: 'alice', rootPath: root })
  const settings = services.settings.getOrCreate(project.id)
  const diff = [
    'diff --git a/app.txt b/app.txt',
    '--- a/app.txt',
    '+++ b/app.txt',
    '@@ -1,2 +1,2 @@',
    ' hello',
    '-old',
    '+new'
  ].join('\n')

  const preview = services.patch.preview(project, settings, {
    username: 'alice',
    title: 'Conflicting patch',
    diff
  })
  const applied = services.patch.apply(project, settings, {
    patchId: preview.id,
    confirmed: true
  })

  expect(applied.status).toBe('conflict')
  expect(applied.conflicts[0]).toMatchObject({
    path: 'app.txt',
    reason: 'PATCH_CONFLICT'
  })
  expect(fs.readFileSync(path.join(root, 'app.txt'), 'utf-8')).toBe('hello\ncurrent\n')
})

test('patch service blocks sensitive and outside paths', () => {
  const root = path.join(TMP, 'patch-blocked')
  writeFile(path.join(root, 'app.txt'), 'hello\n')
  const services = createProjectServices({ storeRef: store })
  const project = services.registry.add({ username: 'alice', rootPath: root })
  const settings = services.settings.getOrCreate(project.id)
  const diff = [
    'diff --git a/.env b/.env',
    '--- a/.env',
    '+++ b/.env',
    '@@ -1 +1 @@',
    '-A=1',
    '+A=2'
  ].join('\n')

  const preview = services.patch.preview(project, settings, {
    username: 'alice',
    title: 'Blocked patch',
    diff
  })

  expect(preview.status).toBe('blocked')
  expect(preview.blocked[0]).toMatchObject({
    path: '.env',
    reason: 'PATCH_PATH_BLOCKED'
  })
})

test('experience migration matcher recommends same-stack experiences', () => {
  const currentRoot = path.join(TMP, 'current-flask')
  const sourceRoot = path.join(TMP, 'source-flask')
  writeFile(path.join(currentRoot, 'requirements.txt'), 'Flask==3.0.2\n')
  writeFile(path.join(currentRoot, 'app.py'), 'from flask import Flask\napp = Flask(__name__)\n')
  writeFile(path.join(sourceRoot, 'requirements.txt'), 'Flask==3.0.0\n')
  writeFile(path.join(sourceRoot, 'app.py'), 'from flask import Flask\napp = Flask(__name__)\n')
  const services = createProjectServices({ storeRef: store })
  const current = services.registry.add({ username: 'alice', rootPath: currentRoot })
  const source = services.registry.add({ username: 'alice', rootPath: sourceRoot })
  const currentProfile = services.profiles.refresh(current)
  services.profiles.refresh(source)
  store.upsertExperience({
    id: 'exp_flask',
    username: 'alice',
    title: 'Flask dependency fix',
    errorSignature: 'python.module_not_found.flask',
    errorKeywords: ['flask', 'ModuleNotFoundError'],
    projectDirs: [sourceRoot],
    commands: [{ command: 'pip install -r requirements.txt', cwd: sourceRoot }]
  })

  const matches = services.migration.match({
    username: 'alice',
    project: current,
    profile: currentProfile,
    query: 'flask'
  })

  expect(matches[0]).toMatchObject({
    experienceId: 'exp_flask',
    reuseLevel: 'same_stack',
    activeRecommendation: true
  })
  expect(matches[0].samePoints).toEqual(expect.arrayContaining(['python', 'flask', 'pip']))
})

test('optional embedding service only embeds selected project snippets when enabled', async () => {
  const root = path.join(TMP, 'embedding')
  writeFile(path.join(root, 'README.md'), '# Demo\n\nRun with npm run dev.\n')
  writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' }, devDependencies: { vite: '^5.0.0' } }, null, 2))
  writeFile(path.join(root, 'src', 'main.js'), 'console.log("entry")\n')
  const mockFetch = async (_url, request) => {
    const body = JSON.parse(request.body)
    return {
      ok: true,
      async json() {
        return {
          data: body.input.map((_item, index) => ({ embedding: [index, index + 1] }))
        }
      }
    }
  }
  const services = createProjectServices({ storeRef: store, fetch: mockFetch })
  const project = services.registry.add({ username: 'alice', rootPath: root })
  const profile = services.profiles.refresh(project)
  const settings = services.settings.update(project.id, { embeddingEnabled: true })
  store.setUserConfig('alice', { apiKey: 'sk-test', embeddingModel: 'embed-test', baseUrl: 'https://example.test' })
  await services.indexer.indexProject(project, settings)

  const result = await services.embedding.refresh({
    username: 'alice',
    project,
    profile,
    settings
  })

  expect(result).toMatchObject({
    status: 'embedded',
    embeddingModel: 'embed-test'
  })
  expect(result.eligibleCount).toBeGreaterThan(0)
  expect(result.embeddingCount).toBe(result.eligibleCount)
})

test('project QA uses embedding evidence when FTS has no lexical match', async () => {
  const root = path.join(TMP, 'embedding-qa')
  writeFile(path.join(root, 'README.md'), '# Demo\n\nazuregate lives in this project overview.\n')
  writeFile(path.join(root, 'src', 'main.js'), 'console.log("entry")\n')
  const mockFetch = async (_url, request) => {
    const body = JSON.parse(request.body)
    return {
      ok: true,
      async json() {
        return {
          data: body.input.map((item) => ({
            embedding: String(item).includes('azuregate') || String(item).includes('semantic question')
              ? [1, 0]
              : [0, 1]
          }))
        }
      }
    }
  }
  const services = createProjectServices({
    storeRef: store,
    fetch: mockFetch,
    modelClient: { answerProjectQuestion: async () => '' }
  })
  const project = services.registry.add({ username: 'alice', rootPath: root })
  const profile = services.profiles.refresh(project)
  const settings = services.settings.update(project.id, { embeddingEnabled: true })
  store.setUserConfig('alice', { apiKey: 'sk-test', embeddingModel: 'embed-test', baseUrl: 'https://example.test' })
  await services.indexer.indexProject(project, settings)
  await services.embedding.refresh({ username: 'alice', project, profile, settings })

  const answer = await services.qa.answer({
    username: 'alice',
    project,
    profile,
    settings,
    question: 'semantic question'
  })

  expect(answer.confidence).toBe('medium')
  expect(answer.citations[0]).toMatchObject({
    path: 'README.md',
    chunkType: 'markdown'
  })
  expect(answer.citations[0].reason).toContain('Embedding similarity')
})
