const { spawn: realSpawn } = require('child_process')
const { EventEmitter } = require('events')
const fs = require('fs')
const os = require('os')
const path = require('path')
const fetchImpl = global.fetch || ((...a) => import('node-fetch').then(({ default: f }) => f(...a)))

const RETRY_DELAYS = [1000, 2000, 4000]
const CHILD_EXIT_TIMEOUT_MS = 1500

const DEFAULTS = {
  uitars: { name: 'uitars-bridge', port: 8765, dir: 'server/uitars-bridge' },
  browserUse: { name: 'browser-use-bridge', port: 8780, dir: 'server/browser-use-bridge', runtime: 'python' }
}

function resolveDefaultRootDir() {
  const devRoot = path.join(__dirname, '..', '..')
  return process.defaultApp ? devRoot : (process.resourcesPath || devRoot)
}

function buildStdio(key) {
  const { logDir, stdoutLog, stderrLog } = getLogPaths(key)
  fs.mkdirSync(logDir, { recursive: true })
  const out = fs.openSync(stdoutLog, 'a')
  const err = fs.openSync(stderrLog, 'a')
  return ['ignore', out, err]
}

function closeStdioHandles(stdio) {
  if (!Array.isArray(stdio)) return
  for (const fd of stdio.slice(1, 3)) {
    if (typeof fd !== 'number') continue
    try { fs.closeSync(fd) } catch {}
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeError(error) {
  if (error instanceof Error) return error
  return new Error(error === undefined ? '未知子进程错误' : String(error))
}

function watchChildError(child) {
  let observedError = null
  let resolveError
  const promise = new Promise((resolve) => { resolveError = resolve })
  const handler = (error) => {
    if (observedError) return
    observedError = normalizeError(error)
    resolveError(observedError)
  }
  const listen = child && typeof child.on === 'function'
    ? child.on.bind(child)
    : (child && typeof child.once === 'function' ? child.once.bind(child) : null)
  const attached = Boolean(listen)

  if (listen) {
    try { listen('error', handler) } catch (error) { handler(error) }
  }

  return {
    getError: () => observedError,
    promise,
    cleanup: () => {
      if (!attached) return
      try {
        if (typeof child.off === 'function') child.off('error', handler)
        else if (typeof child.removeListener === 'function') child.removeListener('error', handler)
      } catch {}
    }
  }
}

function getLogPaths(key) {
  const logDir = path.join(os.tmpdir(), 'aionui-logs')
  return {
    logDir,
    stdoutLog: path.join(logDir, `${key}-stdout.log`),
    stderrLog: path.join(logDir, `${key}-stderr.log`)
  }
}

function buildDiagnostics(key, lastError) {
  const cfg = DEFAULTS[key]
  const logs = getLogPaths(key)
  let config = {}
  try { config = require('../store').store.getConfig() } catch {}
  const missingConfig = []
  if (key === 'browserUse') {
    if (!config.browserUseApiKey) missingConfig.push('browserUseApiKey')
    if (!config.browserUseEndpoint) missingConfig.push('browserUseEndpoint')
    if (!config.browserUseModel) missingConfig.push('browserUseModel')
  }

  const nextSteps = []
  if (missingConfig.length) nextSteps.push(`请配置缺少的设置：${missingConfig.join(', ')}`)
  nextSteps.push(`检查错误日志：${logs.stderrLog}`)
  if (key === 'uitars') nextSteps.push('检查 server/uitars-bridge 依赖和屏幕控制权限。')
  if (key === 'browserUse') nextSteps.push('检查 Python、browser-use 和 Playwright Chromium 是否已安装。')
  nextSteps.push(`请在 设置 > 运行时 中重启 ${cfg.name} 桥接服务。`)

  return {
    bridge: key,
    name: cfg.name,
    port: cfg.port,
    runtime: cfg.runtime || 'node',
    lastError,
    missingConfig,
    stdoutLog: logs.stdoutLog,
    stderrLog: logs.stderrLog,
    nextSteps
  }
}

function createSupervisor(opts = {}) {
  const spawnImpl = opts.spawnImpl || realSpawn
  const healthImpl = opts.healthImpl || (async (port) => {
    try {
      const r = await fetchImpl(`http://127.0.0.1:${port}/health`)
      return { ok: r.ok }
    } catch {
      return { ok: false }
    }
  })
  const rootDir = opts.rootDir || resolveDefaultRootDir()
  const emitter = new EventEmitter()

  const state = Object.fromEntries(
    Object.keys(DEFAULTS).map((key) => [key, { ready: false, state: 'pending', child: null, lastError: null, diagnostics: null, restarts: 0 }])
  )
  const startQueues = Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, Promise.resolve()]))
  const runGeneration = Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, 0]))
  const stopDrains = Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, null]))
  const generationWaiters = Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, new Set()]))

  function buildEnv(key) {
    const config = require('../store').store.getConfig()
    const env = { ...process.env }
    if (key === 'browserUse') {
      env.BROWSER_USE_MODEL_ENDPOINT = config.browserUseEndpoint || 'https://zenmux.ai/api/v1'
      env.BROWSER_USE_MODEL_API_KEY = config.browserUseApiKey || ''
      env.BROWSER_USE_MODEL_NAME = config.browserUseModel || 'openai/gpt-5.5'
      env.BROWSER_USE_VISION_ENABLED = config.browserUseVisionEnabled === false ? 'false' : 'true'
      env.BROWSER_USE_HEADLESS = config.browserUseHeadless === true ? 'true' : 'false'
      env.BROWSER_USE_KEEP_ALIVE = config.browserUseHeadless === true ? 'false' : 'true'
    }
    return env
  }

  function snapshot() {
    return Object.fromEntries(Object.keys(state).map((key) => [key, { ...state[key] }]))
  }

  function waitForChildExit(child) {
    const listen = typeof child.once === 'function'
      ? child.once.bind(child)
      : (typeof child.on === 'function' ? child.on.bind(child) : null)
    if (!listen) return null

    return new Promise((resolve) => {
      let settled = false
      let timeout = null
      const cleanup = () => {
        if (typeof child.off === 'function') {
          child.off('exit', done)
          child.off('close', done)
        } else if (typeof child.removeListener === 'function') {
          child.removeListener('exit', done)
          child.removeListener('close', done)
        }
      }
      const done = () => {
        if (settled) return
        settled = true
        if (timeout) clearTimeout(timeout)
        cleanup()
        resolve()
      }

      try {
        listen('exit', done)
        listen('close', done)
        timeout = setTimeout(done, CHILD_EXIT_TIMEOUT_MS)
      } catch {
        done()
      }
    })
  }

  function childHasExited(child) {
    const hasExitCode = 'exitCode' in child
    const hasSignalCode = 'signalCode' in child
    return (hasExitCode && child.exitCode !== null && child.exitCode !== undefined) ||
      (hasSignalCode && child.signalCode !== null && child.signalCode !== undefined)
  }

  async function clearBridgeChild(key) {
    const child = state[key].child
    if (!child) {
      state[key].ready = false
      return
    }

    state[key].ready = false
    if (childHasExited(child)) {
      if (state[key].child === child) state[key].child = null
      return
    }

    const exitPromise = waitForChildExit(child)
    if (typeof child.kill === 'function') {
      try { child.kill() } catch {}
    }
    if (exitPromise) await exitPromise
    if (state[key].child === child) {
      state[key].child = null
      state[key].ready = false
    }
  }

  function clearBridgeChildNow(key) {
    const child = state[key].child
    if (child && typeof child.kill === 'function') {
      try { child.kill() } catch {}
    }
    state[key].child = null
    state[key].ready = false
  }

  function isCurrentGeneration(key, generation) {
    return runGeneration[key] === generation
  }

  function notifyGenerationChanged(key) {
    const waiters = Array.from(generationWaiters[key])
    generationWaiters[key].clear()
    for (const resolve of waiters) resolve()
  }

  function watchGenerationChange(key, generation) {
    if (!isCurrentGeneration(key, generation)) {
      return { promise: Promise.resolve(), cleanup() {} }
    }

    let resolve
    const promise = new Promise((r) => { resolve = r })
    generationWaiters[key].add(resolve)
    return {
      promise,
      cleanup: () => generationWaiters[key].delete(resolve)
    }
  }

  async function cancelIfStale(key, child, generation) {
    if (isCurrentGeneration(key, generation)) return null
    if (child && state[key].child === child) await clearBridgeChild(key)
    return state[key]
  }

  async function healthProbe(key, port, childErrorWatcher, generation, deadline) {
    const existingError = childErrorWatcher && childErrorWatcher.getError()
    if (existingError) throw existingError
    const remaining = deadline - Date.now()
    if (remaining <= 0) return { ok: false, timedOut: true }

    const generationChange = watchGenerationChange(key, generation)
    try {
      const races = [
        Promise.resolve().then(() => healthImpl(port)),
        delay(Math.max(0, Math.min(remaining, 250))).then(() => ({ ok: false, timedOut: true })),
        generationChange.promise.then(() => ({ ok: false, stale: true }))
      ]
      if (childErrorWatcher) {
        races.push(childErrorWatcher.promise.then((error) => { throw error }))
      }
      const result = await Promise.race(races)
      const observedError = childErrorWatcher && childErrorWatcher.getError()
      if (observedError) throw observedError
      return result || { ok: false }
    } finally {
      generationChange.cleanup()
    }
  }

  async function waitBeforeNextHealthProbe(key, childErrorWatcher, generation, deadline) {
    const existingError = childErrorWatcher && childErrorWatcher.getError()
    if (existingError) throw existingError
    const remaining = deadline - Date.now()
    if (remaining <= 0) return

    const generationChange = watchGenerationChange(key, generation)
    try {
      const races = [
        delay(Math.max(0, Math.min(remaining, 250))),
        generationChange.promise
      ]
      if (childErrorWatcher) {
        races.push(childErrorWatcher.promise.then((error) => { throw error }))
      }
      await Promise.race(races)
      const observedError = childErrorWatcher && childErrorWatcher.getError()
      if (observedError) throw observedError
    } finally {
      generationChange.cleanup()
    }
  }

  async function startOneLocked(key, { healthTimeoutMs = 5000, maxRestarts = 3 } = {}, generation = runGeneration[key]) {
    if (!isCurrentGeneration(key, generation)) return state[key]
    const stopDrain = stopDrains[key]
    if (stopDrain) await stopDrain
    if (!isCurrentGeneration(key, generation)) return state[key]
    const cfg = DEFAULTS[key]
    state[key].state = 'starting'
    state[key].lastError = null
    state[key].diagnostics = null
    await clearBridgeChild(key)
    if (!isCurrentGeneration(key, generation)) return state[key]
    const runtime = cfg.runtime || 'node'
    let child
    let stdio
    let childErrorWatcher
    try {
      stdio = buildStdio(key)
      try {
        const spawnOptions = { stdio, env: buildEnv(key), windowsHide: true }
        child = runtime === 'python'
          ? spawnImpl('python', ['-u', path.join(rootDir, cfg.dir, 'main.py'), String(cfg.port)], spawnOptions)
          : spawnImpl('node', [path.join(rootDir, cfg.dir, 'index.js'), '--port', String(cfg.port)], spawnOptions)
        childErrorWatcher = watchChildError(child)
      } finally {
        closeStdioHandles(stdio)
      }
      state[key].child = child
      const deadline = Date.now() + healthTimeoutMs
      while (true) {
        const staleBeforeHealth = await cancelIfStale(key, child, generation)
        if (staleBeforeHealth) return staleBeforeHealth
        if (deadline - Date.now() <= 0) break
        const h = await healthProbe(key, cfg.port, childErrorWatcher, generation, deadline)
        const staleAfterHealth = await cancelIfStale(key, child, generation)
        if (staleAfterHealth) return staleAfterHealth
        if (h.ok) {
          state[key].ready = true
          state[key].state = 'running'
          state[key].lastError = null
          state[key].diagnostics = null
          emitter.emit('change', { key, state: state[key] })
          return state[key]
        }
        if (!h.timedOut) {
          await waitBeforeNextHealthProbe(key, childErrorWatcher, generation, deadline)
        }
      }
      state[key].ready = false
      const staleAfterTimeout = await cancelIfStale(key, child, generation)
      if (staleAfterTimeout) return staleAfterTimeout
      if (state[key].restarts < maxRestarts) {
        state[key].restarts++
        const delay = RETRY_DELAYS[state[key].restarts] || 4000
        emitter.emit('toast', { message: `${key} 连接断开，正在重连...`, bridge: key })
        await new Promise(r => setTimeout(r, delay))
        const staleBeforeRetry = await cancelIfStale(key, child, generation)
        if (staleBeforeRetry) return staleBeforeRetry
        return startOneLocked(key, { healthTimeoutMs, maxRestarts }, generation)
      }
      state[key].lastError = '健康检查超时'
      await clearBridgeChild(key)
      const staleBeforeFailed = await cancelIfStale(key, child, generation)
      if (staleBeforeFailed) return staleBeforeFailed
      state[key].diagnostics = buildDiagnostics(key, state[key].lastError)
      state[key].state = 'failed'
      emitter.emit('change', { key, state: state[key] })
      return state[key]
    } catch (error) {
      state[key].ready = false
      state[key].lastError = error.message
      const staleAfterError = await cancelIfStale(key, child, generation)
      if (staleAfterError) return staleAfterError
      if (state[key].restarts < maxRestarts) {
        state[key].restarts++
        const delay = RETRY_DELAYS[state[key].restarts] || 4000
        emitter.emit('toast', { message: `${key} 连接断开，正在重连...`, bridge: key })
        await new Promise(r => setTimeout(r, delay))
        const staleBeforeRetry = await cancelIfStale(key, child, generation)
        if (staleBeforeRetry) return staleBeforeRetry
        return startOneLocked(key, { healthTimeoutMs, maxRestarts }, generation)
      }
      await clearBridgeChild(key)
      const staleBeforeFailed = await cancelIfStale(key, child, generation)
      if (staleBeforeFailed) return staleBeforeFailed
      state[key].state = 'failed'
      state[key].diagnostics = buildDiagnostics(key, state[key].lastError)
      emitter.emit('change', { key, state: state[key] })
      return state[key]
    } finally {
      if (childErrorWatcher) childErrorWatcher.cleanup()
    }
  }

  function startOne(key, options = {}) {
    const previous = startQueues[key] || Promise.resolve()
    const generation = runGeneration[key]
    const next = previous.catch(() => {}).then(() => {
      if (!isCurrentGeneration(key, generation)) return state[key]
      return startOneLocked(key, options, generation)
    })
    startQueues[key] = next.catch(() => {})
    return next
  }

  async function start(options = {}) {
    await Promise.all(Object.keys(DEFAULTS).map((key) => startOne(key, options)))
    return snapshot()
  }

  function stop() {
    for (const k of Object.keys(state)) {
      runGeneration[k]++
      notifyGenerationChanged(k)
      const drain = clearBridgeChild(k).catch(() => {})
      stopDrains[k] = drain
      startQueues[k] = drain.then(() => {})
      drain.then(() => { if (stopDrains[k] === drain) stopDrains[k] = null })
      state[k].state = 'stopped'
      state[k].lastError = null
      state[k].diagnostics = null
    }
  }

  return { start, stop, startOne, getState: snapshot, events: emitter }
}

module.exports = { createSupervisor }
