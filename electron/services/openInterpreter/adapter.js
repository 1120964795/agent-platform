const { store } = require('../../store')
const { RUNTIME_NAMES } = require('../../security/actionTypes')
const { detect, getInstallGuidance } = require('./bootstrap')
const { toSidecarRequest, normalizeSidecarResult } = require('./protocol')

function getFetch() {
  if (typeof fetch === 'function') return fetch
  return null
}

function recoverableMissing(action, config) {
  return normalizeSidecarResult(action, {
    ok: false,
    exitCode: 1,
    stdout: 'Open Interpreter 尚未配置。未执行任何本地命令、文件或代码动作。',
    stderr: '',
    metadata: {
      recoverable: true,
      guidance: getInstallGuidance(config)
    }
  })
}

async function executeViaEndpoint(endpoint, request, signal) {
  const fetchImpl = getFetch()
  if (!fetchImpl) throw new Error('当前运行时无法调用 Open Interpreter 端点：fetch 不可用。')
  const resp = await fetchImpl(endpoint.replace(/\/+$/, '') + '/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    return { ok: false, exitCode: 1, stderr: `Open Interpreter sidecar 返回 ${resp.status}：${text.slice(0, 200)}` }
  }
  return resp.json()
}

function createOpenInterpreterAdapter(options = {}) {
  const storeRef = options.storeRef || store

  return {
    async execute(action, context = {}) {
      const config = storeRef.getConfig()
      if (action.runtime !== RUNTIME_NAMES.OPEN_INTERPRETER && action.runtime !== RUNTIME_NAMES.DRY_RUN) {
        throw new Error(`Open Interpreter 适配器无法执行 ${action.runtime}`)
      }
      const runtime = await detect(config)
      const request = toSidecarRequest(action)
      if (!config.openInterpreterEndpoint && !config.openInterpreterCommand) return recoverableMissing(action, config)
      if (config.openInterpreterEndpoint) {
        const result = await executeViaEndpoint(config.openInterpreterEndpoint, request, context.signal)
        return normalizeSidecarResult(action, result)
      }
      return normalizeSidecarResult(action, {
        ok: false,
        exitCode: 1,
        stdout: `已配置 Open Interpreter 命令（${config.openInterpreterCommand}），但当前没有可用于协议执行的 sidecar 端点。`,
        metadata: { recoverable: true, runtime }
      })
    },
    emergencyStop() {
      return { ok: true, runtime: 'open-interpreter' }
    }
  }
}

module.exports = { createOpenInterpreterAdapter, recoverableMissing }
