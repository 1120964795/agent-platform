import { test, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-tools-test-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')
process.env.AGENTDEV_GENERATED_DIR = path.join(TMP, 'generated')
const require = createRequire(import.meta.url)
const { execute, TOOL_SCHEMAS, TOOLS, getExecutionToolSchemas } = require('../tools')
const { setDialogProvider, clearConfirmCache } = require('../confirm')
const { store } = require('../store')

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
  fs.mkdirSync(TMP, { recursive: true })
  store.setConfig({ permissionMode: 'full', workspace_root: TMP, session_confirm_cache_enabled: true, shell_whitelist_extra: [], shell_blacklist_extra: [] })
  setDialogProvider(async () => ({ allowed: true, remember: false }))
  clearConfirmCache()
})

test('tool registry loads expected stage B tools', () => {
  expect(TOOL_SCHEMAS.map((schema) => schema.name)).toEqual(expect.arrayContaining([
    'read_file', 'write_file', 'edit_file', 'list_dir', 'search_files', 'create_dir', 'delete_path', 'move_path', 'run_shell_command', 'get_os_info', 'which', 'remember_user_rule', 'forget_user_rule', 'generate_docx', 'generate_pptx', 'load_skill'
  ]))
  expect(typeof TOOLS.read_file).toBe('function')
})

test('legacy tools are hidden from AionUi Execute mode', () => {
  expect(getExecutionToolSchemas()).toEqual([])
})

test('fs tools read, write, edit, list and search files', async () => {
  const filePath = path.join(TMP, 'notes', 'a.txt')
  expect(await execute('create_dir', { path: path.dirname(filePath) })).toEqual({ path: path.dirname(filePath) })
  const write = await execute('write_file', { path: filePath, content: 'hello world' })
  expect(write.bytes_written).toBe(11)
  expect((await execute('read_file', { path: filePath })).content).toBe('hello world')
  expect((await execute('edit_file', { path: filePath, old_string: 'world', new_string: 'agent' })).replacements).toBe(1)
  expect((await execute('list_dir', { path: path.dirname(filePath) })).entries[0].name).toBe('a.txt')
  expect((await execute('search_files', { root: TMP, query: 'a.txt' })).results[0].name).toBe('a.txt')
})

test('destructive fs tools require confirmation', async () => {
  const filePath = path.join(TMP, 'delete-me.txt')
  fs.writeFileSync(filePath, 'x')
  setDialogProvider(async () => ({ allowed: false }))
  expect((await execute('delete_path', { path: filePath })).error.code).toBe('USER_CANCELLED')
  expect(fs.existsSync(filePath)).toBe(true)

  setDialogProvider(async () => ({ allowed: true }))
  expect((await execute('delete_path', { path: filePath })).path).toBe(filePath)
  expect(fs.existsSync(filePath)).toBe(false)
})

test('shell policy blocks blacklisted commands and confirms gray commands', async () => {
  const denied = await execute('run_shell_command', { command: 'rm something' })
  expect(denied.error.code).toBe('PERMISSION_DENIED')

  let confirmCount = 0
  setDialogProvider(async () => { confirmCount += 1; return { allowed: false } })
  const gray = await execute('run_shell_command', { command: 'unknowncmd --version' })
  expect(gray.error.code).toBe('USER_CANCELLED')
  expect(confirmCount).toBe(1)
})

test('remember tools persist and remove user rules', async () => {
  const add = await execute('remember_user_rule', { rule: 'Always answer in Chinese.' })
  expect(add.rule_id).toMatch(/^r_/)
  const section = require('../services/userRules').buildSystemPromptSection()
  expect(section).toContain('Always answer in Chinese.')
  const remove = await execute('forget_user_rule', { rule_id: add.rule_id })
  expect(remove.removed_count).toBe(1)
})

test('env which reports missing command without throwing', async () => {
  const result = await execute('which', { command: 'definitely-not-a-real-agentdev-command' })
  expect(result.found).toBe(false)
})
