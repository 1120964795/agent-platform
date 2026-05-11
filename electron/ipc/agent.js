const { runTurn } = require('../services/agentLoop')

const pendingApprovals = new Map()
const activeControllers = new Map()

function register(ipcMain) {
  ipcMain.handle('agent:run-turn', async (evt, payload) => {
    const { convId, messages } = payload
    const send = (event, data = {}) => evt.sender.send(event, { convId, ...data })

    const ctl = new AbortController()
    activeControllers.set(convId, ctl)

    try {
      const result = await runTurn({
        messages,
        signal: ctl.signal,
        onEvent: (type, data) => {
          send('agent:event', { type, ...data })
        },
        requestApproval: async ({ call }) => {
          return new Promise((resolve) => {
            pendingApprovals.set(call.id, resolve)
          })
        }
      })

      return { ok: true, finalText: result.finalText, history: result.history }
    } catch (error) {
      return { ok: false, error: { code: error.code || 'AGENT_ERROR', message: error.message || 'Agent 执行失败。' } }
    } finally {
      activeControllers.delete(convId)
      // Clean up any remaining pending approvals for this conversation
      for (const [callId, resolve] of pendingApprovals) {
        resolve(false)
        pendingApprovals.delete(callId)
      }
    }
  })

  ipcMain.handle('agent:approve-tool', async (_evt, { convId, callId, approved }) => {
    const resolve = pendingApprovals.get(callId)
    if (resolve) {
      pendingApprovals.delete(callId)
      resolve(Boolean(approved))
    }
    return { ok: true }
  })

  ipcMain.handle('agent:abort', async (_evt, { convId }) => {
    const ctl = activeControllers.get(convId)
    if (ctl) {
      ctl.abort()
      activeControllers.delete(convId)
    }
    for (const [callId, resolve] of pendingApprovals) {
      resolve(false)
      pendingApprovals.delete(callId)
    }
    return { ok: true }
  })
}

module.exports = { register }
