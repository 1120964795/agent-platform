import { test, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const repoRoot = path.resolve(__dirname, '..', '..')
const oldBrand = ['Aion', 'Ui'].join('')

function readTrackedTextFile(relativePath) {
  try {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
  } catch {
    return null
  }
}

test('tracked project files use 司南 instead of the old product name', () => {
  const trackedFiles = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => !file.includes('node_modules/'))

  const offenders = trackedFiles.filter((file) => readTrackedTextFile(file)?.includes(oldBrand))

  expect(offenders).toEqual([])
})

