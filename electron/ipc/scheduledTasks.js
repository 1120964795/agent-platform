const { createTaskService } = require('../services/scheduledTasks/taskService')

function createRegister(overrides = {}) {
  const service = overrides.service || createTaskService({
    ...overrides,
    executablePath: overrides.scheduledTaskExecutablePath || overrides.executablePath,
    appPath: overrides.scheduledTaskAppPath || overrides.appPath || ''
  })
  const scheduler = overrides.scheduler
  return function register(ipcMain) {
    ipcMain.handle('scheduledTasks:list', async () => ({ ok: true, tasks: service.listTasks() }))
    ipcMain.handle('scheduledTasks:draft', async (_event, payload = {}) => service.draftTask(payload.message))
    ipcMain.handle('scheduledTasks:create', async (_event, payload = {}) => {
      if (!payload.draft) return { ok: false, error: { code: 'BAD_REQUEST', message: '需要提供定时任务草案。' } }
      try {
        const task = await service.createTask(payload.draft)
        return { ok: true, task }
      } catch (error) {
        return { ok: false, error: { code: error.code || 'SCHEDULE_CREATE_FAILED', message: error.message } }
      }
    })
    ipcMain.handle('scheduledTasks:update', async (_event, payload = {}) => {
      const task = await service.updateTask(payload.id, payload.patch || {})
      if (!task) return { ok: false, error: { code: 'NOT_FOUND', message: '定时任务不存在。' } }
      return { ok: true, task }
    })
    ipcMain.handle('scheduledTasks:delete', async (_event, payload = {}) => {
      await service.removeTask(payload.id)
      return { ok: true }
    })
    ipcMain.handle('scheduledTasks:status', async (_event, payload = {}) => ({ ok: true, status: await service.statusTask(payload.id) }))
    ipcMain.handle('scheduledTasks:runNow', async (_event, payload = {}) => {
      if (!scheduler?.runNow) return { ok: false, error: { code: 'SCHEDULER_UNAVAILABLE', message: '定时任务调度器尚未初始化。' } }
      return scheduler.runNow(payload.id, 'manual')
    })
  }
}

function register(ipcMain, overrides = {}) {
  return createRegister(overrides)(ipcMain)
}

module.exports = { createRegister, register }
