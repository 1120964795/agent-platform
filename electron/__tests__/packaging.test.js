import { test, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'))

test('desktop scripts no longer start the legacy server', () => {
  expect(pkg.scripts.dev).toBeUndefined()
  expect(pkg.scripts.setup).not.toContain('server')
  expect(pkg.scripts['electron:dev']).toContain('npm --prefix client run dev')
  expect(pkg.scripts['electron:dev']).not.toContain('server')

  const packagedInputs = JSON.stringify({
    files: pkg.build.files,
    extraResources: pkg.build.extraResources
  })
  expect(packagedInputs).not.toContain('server')
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


test('main-process runtime modules are production dependencies', () => {
  for (const dependency of ['docx', 'gray-matter', 'mammoth', 'pptxgenjs']) {
    expect(pkg.dependencies[dependency]).toBeTruthy()
    expect(pkg.devDependencies[dependency]).toBeUndefined()
  }
})
test('README keeps the manual acceptance checklist', () => {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf-8')
  const checklistItems = [
    'exe 安装后首次启动能看到 5 个内置 skill',
    '给本地 pdf 路径说“总结这个文件”',
    '说“帮我装 uv”',
    '说“删掉 D:\\temp”',
    '说“写一份关于 XX 的 Word 报告”',
    '切到 `normal` 模式',
    '自己写 `SKILL.md` 放到用户 `skills/` 目录',
    '`user_rules.md` 新增规则'
  ]

  for (const item of checklistItems) {
    expect(readme).toContain(item)
  }
})