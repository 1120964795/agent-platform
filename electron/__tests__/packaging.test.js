import { test, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'))

test('desktop scripts no longer start the legacy server', () => {
  expect(pkg.scripts.dev).toBeUndefined()
  expect(pkg.scripts.setup).not.toContain('server')
  expect(pkg.scripts['build:bridges']).toBe('node scripts/prepare-bridges.js')
  expect(pkg.scripts['electron:dev']).toContain('npm --prefix client run dev')
  expect(pkg.scripts['electron:dev']).not.toContain('server')
  expect(pkg.scripts['electron:dev']).not.toContain('build:bridges')
  expect(pkg.scripts['electron:build']).toContain('npm run build:client')
  expect(pkg.scripts['electron:build']).toContain('npm run build:bridges')
  expect(pkg.scripts['electron:build']).toMatch(/build:client.*build:bridges.*electron-builder --win/)

  expect(JSON.stringify(pkg.build.files)).not.toContain('server')
  expect(pkg.build.extraResources).toEqual(expect.arrayContaining([
    expect.objectContaining({ from: 'dist-bridges/browser-use-bridge', to: 'server/browser-use-bridge' }),
    expect.objectContaining({ from: 'dist-bridges/uitars-bridge', to: 'server/uitars-bridge' })
  ]))
  expect(pkg.build.extraResources).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ from: 'server/oi-bridge' }),
    expect.objectContaining({ from: 'server/uitars-bridge' })
  ]))
})

test('desktop build bundles renderer and skills resources', () => {
  expect(pkg.build.files).toEqual(expect.arrayContaining([
    'electron/**/*',
    '!electron/__tests__/**/*',
    'resources/**/*'
  ]))
  expect(pkg.build.extraResources).toEqual(expect.arrayContaining([
    expect.objectContaining({ from: 'resources/skills', to: 'skills' }),
    expect.objectContaining({ from: 'client/dist', to: 'client/dist' })
  ]))
})

test('package metadata uses AionUi product identity', () => {
  expect(pkg.name).toBe('agentdev-lite')
  expect(pkg.description).toContain('AionUi V2')
  expect(pkg.build.productName).toBe('AionUi')
})

test('main-process runtime modules are production dependencies', () => {
  for (const dependency of ['docx', 'gray-matter', 'mammoth', 'pptxgenjs']) {
    expect(pkg.dependencies[dependency]).toBeTruthy()
    expect(pkg.devDependencies[dependency]).toBeUndefined()
  }
})

test('browser-use bridge runtime dependencies are installed by the app installer', () => {
  const prepareScript = fs.readFileSync(path.join(repoRoot, 'scripts', 'prepare-bridges.js'), 'utf-8')
  const requirements = fs.readFileSync(path.join(repoRoot, 'server', 'browser-use-bridge', 'requirements.txt'), 'utf-8')

  expect(prepareScript).toContain("'.deps'")
  expect(prepareScript).not.toContain('pip install -r')
  expect(prepareScript).not.toContain('--target')
  expect(prepareScript).not.toContain('playwright install chromium')
  expect(requirements).toContain('selenium')
  expect(requirements).toContain('playwright')
})

test('windows installer runs browser runtime dependency setup after app install', () => {
  const installerInclude = path.join(repoRoot, 'build', 'installer.nsh')
  const mainProcess = fs.readFileSync(path.join(repoRoot, 'electron', 'main.js'), 'utf-8')

  expect(pkg.build.nsis.include).toBe('build/installer.nsh')
  expect(fs.existsSync(installerInclude)).toBe(true)
  expect(fs.readFileSync(installerInclude, 'utf-8')).toContain('--install-browser-runtime')
  expect(mainProcess).toContain('--install-browser-runtime')
})

test('README describes the V2 control plane scope', () => {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf-8')
  const requiredText = [
    'DeepSeek-V4 owns chat, planning, intent classification, and coding reasoning',
    'Browser Use is the browser automation capability',
    'Open Interpreter remains the managed local runtime',
    'AionUi owns policy',
    'High-risk actions always require explicit confirmation'
  ]

  for (const item of requiredText) {
    expect(readme).toContain(item)
  }
})
