let supervisor = null

function setSupervisor(sup) { supervisor = sup }

function register(ipcMain) {
  ipcMain.handle('bridge:status', async () => {
    if (!supervisor) return { bridges: {} }
    const state = supervisor.getState()
    const bridges = {}
    for (const [key, s] of Object.entries(state)) {
      bridges[key] = {
        state: s.state,
        ready: s.ready,
        lastError: s.lastError || null,
        diagnostics: s.diagnostics || null,
        restarts: s.restarts || 0,
      }
    }
    return { bridges }
  })

  ipcMain.handle('bridge:restart', async (_event, { key } = {}) => {
    if (!supervisor) return { ok: false, error: '桥接监控不可用' }
    try {
      await supervisor.startOne(key)
      const state = supervisor.getState()
      return { ok: true, state: state[key] }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })
}

module.exports = { register, setSupervisor }
