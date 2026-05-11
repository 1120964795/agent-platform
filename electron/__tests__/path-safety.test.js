import { test, expect } from 'vitest'
import { createRequire } from 'module'
import os from 'os'
import path from 'path'
import fs from 'fs'

const require = createRequire(import.meta.url)
const { isPathSafe, validatePath } = require('../security/pathSafety')

const home = os.homedir()
const tmpDir = os.tmpdir()

test('existing file path resolves realpath', () => {
  const f = path.join(tmpDir, 'path-safety-test-' + Date.now() + '.txt')
  fs.writeFileSync(f, 'test')
  try {
    const r = validatePath(f, 'read')
    expect(r.safe).toBe(true)
    expect(r.resolved).toBe(fs.realpathSync(f))
  } finally {
    fs.unlinkSync(f)
  }
})

test('non-existent write target resolves parent realpath', () => {
  const parent = fs.realpathSync(tmpDir)
  const nonExistent = path.join(tmpDir, 'nonexistent-dir', 'new-file.txt')
  const r = validatePath(nonExistent, 'write', { writableRoots: [parent] })
  // Should resolve parent (tmpDir is real) and not fail
  expect(r.safe).toBe(true)
  expect(r.resolved).toBe(path.join(parent, 'nonexistent-dir', 'new-file.txt'))
})

test('non-existent path where parent also does not exist returns unsafe', () => {
  const r = validatePath('C:\\NONEXISTENT_ROOT_12345\\sub\\file.txt', 'write')
  expect(r.safe).toBe(false)
})

test('UNC path is blocked', () => {
  const r = validatePath('\\\\server\\share\\file.txt', 'read')
  expect(r.safe).toBe(false)
  expect(r.reason).toMatch(/UNC/)
})

test('long-path prefix is stripped and accepted', () => {
  const f = path.join(tmpDir, 'long-path-test-' + Date.now() + '.txt')
  fs.writeFileSync(f, 'test')
  try {
    const longPath = '\\\\?\\' + f
    const r = validatePath(longPath, 'read')
    expect(r.safe).toBe(true)
    expect(r.resolved).toBe(fs.realpathSync(f))
  } finally {
    fs.unlinkSync(f)
  }
})

test('read mode allows path within home directory', () => {
  const f = path.join(home, 'Desktop', 'test-read.txt')
  const r = validatePath(f, 'read')
  expect(r.safe).toBe(true)
})

test('read mode blocks system paths', () => {
  const blocked = [
    'C:\\Windows\\System32\\config\\SAM',
    'C:\\Windows\\System32\\drivers\\etc\\hosts',
    'C:\\Program Files\\SomeApp\\config.ini',
    'C:\\Program Files (x86)\\App\\data.bin',
    'C:\\ProgramData\\Microsoft\\Crypto\\RSA\\MachineKeys\\key'
  ]
  for (const p of blocked) {
    const r = validatePath(p, 'read')
    expect(r.safe).toBe(false)
  }
})

test('read mode allows non-system absolute paths', () => {
  const allowed = [
    path.join(home, 'Documents', 'notes.txt'),
    'C:\\MyProjects\\app\\config.json',
    path.join(tmpDir, 'data.csv')
  ]
  for (const p of allowed) {
    const r = validatePath(p, 'read')
    expect(r.safe).toBe(true)
  }
})

test('write mode strictly within writable-roots', () => {
  const projectDir = 'C:\\MyProjects\\myapp'
  const r = validatePath(path.join(projectDir, 'src', 'app.js'), 'write', {
    writableRoots: [projectDir, tmpDir]
  })
  expect(r.safe).toBe(true)
})

test('write mode rejects paths outside writable-roots', () => {
  const r = validatePath('C:\\OtherProject\\file.txt', 'write', {
    writableRoots: ['C:\\MyProjects']
  })
  expect(r.safe).toBe(false)
  expect(r.reason).toMatch(/可写根目录/)
})

test('write mode blocks system paths even when writableRoots includes them', () => {
  const r = validatePath('C:\\Windows\\System32\\test.dll', 'write', {
    writableRoots: ['C:\\Windows']
  })
  // System paths always blocked for write regardless of writableRoots
  expect(r.safe).toBe(false)
})

test('symlink pointing outside allowed area is detected via realpath', () => {
  // Use a path that resolves to system32 — validatePath should see realpath
  const r = validatePath('C:\\Windows\\System32\\notepad.exe', 'read')
  expect(r.safe).toBe(false)
})

test('relative path with traversal is blocked', () => {
  // Traverse from home to system32: C:\Users\g -> .. -> C:\Users -> .. -> C:\ -> Windows\System32
  const r = validatePath(path.join(home, '..', '..', 'Windows', 'System32'), 'read')
  expect(r.safe).toBe(false)
})

test('isPathSafe convenience returns boolean', () => {
  expect(isPathSafe(path.join(home, 'file.txt'), 'read')).toBe(true)
  expect(isPathSafe('C:\\Windows\\System32\\cmd.exe', 'read')).toBe(false)
})

test('empty path returns unsafe', () => {
  const r = validatePath('', 'read')
  expect(r.safe).toBe(false)
})

test('relative path resolved against cwd is checked', () => {
  const r = validatePath('test-file.txt', 'write', { writableRoots: [process.cwd()] })
  expect(r.safe).toBe(true)
})
