import { test, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-test-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = TMP
const require = createRequire(import.meta.url)
const { store } = require('../store')

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
})

test('getConfig returns defaults including new fields', () => {
  const config = store.getConfig()
  expect(config.modelProvider).toBe('deepseek')
  expect(config.model).toBe('deepseek-v4-flash')
  expect(config.minimaxBaseUrl).toBe('https://api.minimax.io')
  expect(config.minimaxModel).toBe('MiniMax-M2.7')
  expect(config.permissionMode).toBe('default')
  expect(config.workspace_root).toBe(os.homedir())
  expect(config.shell_whitelist_extra).toEqual([])
  expect(config.shell_blacklist_extra).toEqual([])
  expect(config.session_confirm_cache_enabled).toBe(true)
})

test('getAuth returns auth defaults', () => {
  expect(store.getAuth()).toEqual({
    version: 1,
    accounts: [],
    loginHistory: [],
    loginPrefs: {
      username: '',
      password: '',
      rememberPassword: false,
      autoLogin: false
    },
    session: null
  })
})

test('setConfig persists patches', () => {
  store.setConfig({ apiKey: 'sk-x', minimaxApiKey: 'mini-x', modelProvider: 'minimax', workspace_root: 'D:\\work' })
  expect(store.getConfig().apiKey).toBe('sk-x')
  expect(store.getConfig().minimaxApiKey).toBe('mini-x')
  expect(store.getConfig().modelProvider).toBe('minimax')
  expect(store.getConfig().workspace_root).toBe('D:\\work')
})

test('user config does not inherit global sensitive settings', () => {
  store.setConfig({ apiKey: 'sk-global', permissionMode: 'full', workspace_root: 'D:\\global' })
  store.setUserConfig('alice', { apiKey: 'sk-alice', permissionMode: 'full' })

  expect(store.getUserConfig('alice').apiKey).toBe('sk-alice')
  expect(store.getUserConfig('alice').permissionMode).toBe('full')
  expect(store.getUserConfig('bob').apiKey).toBe('')
  expect(store.getUserConfig('bob').permissionMode).toBe('default')
  expect(store.getUserConfig('bob').workspace_root).toBe(os.homedir())
})
