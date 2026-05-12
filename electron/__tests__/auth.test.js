import { test, expect, beforeEach, describe, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-auth-test-${Date.now()}-${process.pid}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')
const require = createRequire(import.meta.url)

// Mock electron — auth module must not import electron's app directly
require.cache[require.resolve('electron')] = {
  exports: {
    app: { getPath: () => TMP }
  }
}

function freshAuth() {
  // Wipe data directory and reload the module so each test gets a clean slate.
  try { fs.rmSync(TMP, { recursive: true, force: true }) } catch {}
  fs.mkdirSync(path.join(TMP, 'data'), { recursive: true })
  delete require.cache[require.resolve('../ipc/auth')]
  return require('../ipc/auth')
}

function createIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle: (channel, handler) => handlers.set(channel, handler),
    invoke: (channel, payload) => {
      const fn = handlers.get(channel)
      if (!fn) throw new Error(`no handler for ${channel}`)
      return fn({}, payload)
    }
  }
}

function registerAuth() {
  const auth = freshAuth()
  const ipc = createIpcMain()
  auth.register(ipc)
  return { auth, ipc }
}

beforeEach(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true }) } catch {}
})

describe('auth:get-status', () => {
  test('reports needsSetup=true when no user exists', async () => {
    const { ipc } = registerAuth()
    const status = await ipc.invoke('auth:get-status')
    expect(status).toEqual({ needsSetup: true, hasSession: false })
  })

  test('reports needsSetup=false after setup', async () => {
    const { ipc } = registerAuth()
    await ipc.invoke('auth:setup', { username: 'alice', password: 'Str0ng!Pass' })
    const status = await ipc.invoke('auth:get-status')
    expect(status.needsSetup).toBe(false)
  })
})

describe('auth:setup', () => {
  test('creates the primary account and returns a session token', async () => {
    const { ipc } = registerAuth()
    const result = await ipc.invoke('auth:setup', { username: 'alice', password: 'Str0ng!Pass' })
    expect(result.ok).toBe(true)
    expect(result.token).toMatch(/^[a-f0-9]{64}$/)
    expect(result.user).toEqual({ username: 'alice' })
  })

  test('allows registering additional accounts with different usernames', async () => {
    const { ipc } = registerAuth()
    await ipc.invoke('auth:setup', { username: 'alice', password: 'Str0ng!Pass' })
    const result = await ipc.invoke('auth:setup', { username: 'bob', password: 'An0ther!Pw' })
    expect(result.ok).toBe(true)
    expect(result.user).toEqual({ username: 'bob' })
  })

  test('rejects setup when the username is already taken', async () => {
    const { ipc } = registerAuth()
    await ipc.invoke('auth:setup', { username: 'alice', password: 'Str0ng!Pass' })
    const result = await ipc.invoke('auth:setup', { username: 'alice', password: 'An0ther!Pw' })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('USERNAME_TAKEN')
  })

  test('rejects username with bad characters', async () => {
    const { ipc } = registerAuth()
    const result = await ipc.invoke('auth:setup', { username: 'al ice', password: 'Str0ng!Pass' })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('INVALID_USERNAME')
  })

  test('rejects weak password (too short)', async () => {
    const { ipc } = registerAuth()
    const result = await ipc.invoke('auth:setup', { username: 'alice', password: 'short1' })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('WEAK_PASSWORD')
  })

  test('rejects weak password (only one character class)', async () => {
    const { ipc } = registerAuth()
    const result = await ipc.invoke('auth:setup', { username: 'alice', password: 'alllowercase' })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('WEAK_PASSWORD')
  })

  test('does not store the password in plaintext on disk', async () => {
    const { ipc } = registerAuth()
    await ipc.invoke('auth:setup', { username: 'alice', password: 'Str0ng!Pass' })
    const raw = fs.readFileSync(path.join(TMP, 'data', 'auth.json'), 'utf8')
    expect(raw).not.toContain('Str0ng!Pass')
  })
})

describe('auth:login', () => {
  test('returns a session token on correct credentials', async () => {
    const { ipc } = registerAuth()
    await ipc.invoke('auth:setup', { username: 'alice', password: 'Str0ng!Pass' })
    const result = await ipc.invoke('auth:login', { username: 'alice', password: 'Str0ng!Pass', remember: true })
    expect(result.ok).toBe(true)
    expect(result.token).toMatch(/^[a-f0-9]{64}$/)
  })

  test('rejects wrong password', async () => {
    const { ipc } = registerAuth()
    await ipc.invoke('auth:setup', { username: 'alice', password: 'Str0ng!Pass' })
    const result = await ipc.invoke('auth:login', { username: 'alice', password: 'WrongPass1!', remember: false })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('BAD_CREDENTIALS')
  })

  test('rejects unknown user with same generic error (no enumeration)', async () => {
    const { ipc } = registerAuth()
    await ipc.invoke('auth:setup', { username: 'alice', password: 'Str0ng!Pass' })
    const result = await ipc.invoke('auth:login', { username: 'mallory', password: 'Whatever1!', remember: false })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('BAD_CREDENTIALS')
  })

  test('persists session when remember=true', async () => {
    const { ipc } = registerAuth()
    await ipc.invoke('auth:setup', { username: 'alice', password: 'Str0ng!Pass' })
    const login = await ipc.invoke('auth:login', { username: 'alice', password: 'Str0ng!Pass', remember: true })
    const raw = JSON.parse(fs.readFileSync(path.join(TMP, 'data', 'auth.json'), 'utf8'))
    expect(raw.sessions.some(s => s.token === login.token)).toBe(true)
  })

  test('does NOT persist session when remember=false', async () => {
    const { ipc } = registerAuth()
    await ipc.invoke('auth:setup', { username: 'alice', password: 'Str0ng!Pass' })
    const login = await ipc.invoke('auth:login', { username: 'alice', password: 'Str0ng!Pass', remember: false })
    const raw = JSON.parse(fs.readFileSync(path.join(TMP, 'data', 'auth.json'), 'utf8'))
    expect(raw.sessions.some(s => s.token === login.token)).toBe(false)
  })
})

describe('rate limit / lockout', () => {
  test('locks account after 5 failed attempts', async () => {
    const { ipc } = registerAuth()
    await ipc.invoke('auth:setup', { username: 'alice', password: 'Str0ng!Pass' })
    for (let i = 0; i < 5; i++) {
      await ipc.invoke('auth:login', { username: 'alice', password: 'wrong', remember: false })
    }
    const locked = await ipc.invoke('auth:login', { username: 'alice', password: 'Str0ng!Pass', remember: false })
    expect(locked.ok).toBe(false)
    expect(locked.error).toBe('LOCKED')
  })
})

describe('auth:get-status with session token', () => {
  test('hasSession=true and resolves username for valid persistent token', async () => {
    const { ipc } = registerAuth()
    await ipc.invoke('auth:setup', { username: 'alice', password: 'Str0ng!Pass' })
    const login = await ipc.invoke('auth:login', { username: 'alice', password: 'Str0ng!Pass', remember: true })
    const status = await ipc.invoke('auth:get-status', { token: login.token })
    expect(status.hasSession).toBe(true)
    expect(status.username).toBe('alice')
  })

  test('hasSession=false for unknown token', async () => {
    const { ipc } = registerAuth()
    await ipc.invoke('auth:setup', { username: 'alice', password: 'Str0ng!Pass' })
    const status = await ipc.invoke('auth:get-status', { token: 'deadbeef'.repeat(8) })
    expect(status.hasSession).toBe(false)
  })

  test('hasSession=false for expired persistent token', async () => {
    const { ipc, auth } = registerAuth()
    await ipc.invoke('auth:setup', { username: 'alice', password: 'Str0ng!Pass' })
    const login = await ipc.invoke('auth:login', { username: 'alice', password: 'Str0ng!Pass', remember: true })
    // Forge expiry into the past for the matching session
    const file = path.join(TMP, 'data', 'auth.json')
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    const target = data.sessions.find(s => s.token === login.token)
    target.expiresAt = Date.now() - 1000
    fs.writeFileSync(file, JSON.stringify(data), 'utf8')
    const status = await ipc.invoke('auth:get-status', { token: login.token })
    expect(status.hasSession).toBe(false)
  })
})

describe('auth:logout', () => {
  test('invalidates the session token', async () => {
    const { ipc } = registerAuth()
    await ipc.invoke('auth:setup', { username: 'alice', password: 'Str0ng!Pass' })
    const login = await ipc.invoke('auth:login', { username: 'alice', password: 'Str0ng!Pass', remember: true })
    await ipc.invoke('auth:logout', { token: login.token })
    const status = await ipc.invoke('auth:get-status', { token: login.token })
    expect(status.hasSession).toBe(false)
  })
})
