import { describe, expect, test, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const {
  buildTaskName,
  buildTaskRunCommand,
  buildCreateArgs,
  registerTask,
  deleteTask,
  getTaskStatus
} = require('../services/scheduledTasks/windowsTaskScheduler')

const dailyTask = {
  id: 'sch-123',
  schedule: { kind: 'daily', hour: 8, minute: 0, timezone: 'Asia/Shanghai', human: '每天 08:00' }
}

describe('windows task scheduler adapter', () => {
  test('builds trusted Windows task names from task ids only', () => {
    expect(buildTaskName('sch-123')).toBe('\\AionUi\\ScheduledTasks\\sch-123')
    expect(() => buildTaskName('../bad')).toThrow(/Invalid scheduled task id/)
  })

  test('builds launch command without storing secrets', () => {
    expect(buildTaskRunCommand({
      executablePath: 'C:\\Program Files\\AionUi\\AionUi.exe',
      taskId: 'sch-123'
    })).toBe('"C:\\Program Files\\AionUi\\AionUi.exe" --run-scheduled-task sch-123')
  })

  test('builds development launch command with explicit Electron app path', () => {
    expect(buildTaskRunCommand({
      executablePath: 'C:\\Users\\g\\Desktop\\5.12\\node_modules\\electron\\dist\\electron.exe',
      appPath: 'C:\\Users\\g\\Desktop\\5.12',
      taskId: 'sch-123'
    })).toBe('"C:\\Users\\g\\Desktop\\5.12\\node_modules\\electron\\dist\\electron.exe" "C:\\Users\\g\\Desktop\\5.12" --run-scheduled-task sch-123')
  })

  test('builds packaged launch command without app path', () => {
    expect(buildTaskRunCommand({
      executablePath: 'C:\\Program Files\\AionUi\\AionUi.exe',
      taskId: 'sch-123'
    })).toBe('"C:\\Program Files\\AionUi\\AionUi.exe" --run-scheduled-task sch-123')
  })

  test('builds daily schtasks create args', () => {
    const args = buildCreateArgs(dailyTask, {
      executablePath: 'C:\\Program Files\\AionUi\\AionUi.exe'
    })

    expect(args).toEqual([
      '/Create',
      '/F',
      '/TN',
      '\\AionUi\\ScheduledTasks\\sch-123',
      '/TR',
      '"C:\\Program Files\\AionUi\\AionUi.exe" --run-scheduled-task sch-123',
      '/SC',
      'DAILY',
      '/ST',
      '08:00'
    ])
  })

  test('builds weekly schtasks create args', () => {
    const args = buildCreateArgs({
      id: 'sch-weekly',
      schedule: { kind: 'weekly', dayOfWeek: 5, hour: 17, minute: 30, timezone: 'Asia/Shanghai', human: '每周五 17:30' }
    }, { executablePath: 'C:\\AionUi.exe' })

    expect(args).toContain('/SC')
    expect(args).toContain('WEEKLY')
    expect(args).toContain('/D')
    expect(args).toContain('FRI')
    expect(args).toContain('17:30')
  })

  test('builds one-time schtasks create args', () => {
    const args = buildCreateArgs({
      id: 'sch-once',
      schedule: {
        kind: 'once',
        runAt: '2026-05-12T12:00:00.000Z',
        timezone: 'Asia/Shanghai',
        human: '\u4eca\u5929 20:00'
      }
    }, {
      executablePath: 'C:\\Program Files\\AionUi\\AionUi.exe'
    })

    expect(args).toEqual([
      '/Create',
      '/F',
      '/TN',
      '\\AionUi\\ScheduledTasks\\sch-once',
      '/TR',
      '"C:\\Program Files\\AionUi\\AionUi.exe" --run-scheduled-task sch-once',
      '/SC',
      'ONCE',
      '/ST',
      '20:00',
      '/SD',
      '05/12/2026'
    ])
  })

  test('register delete and query use execFile with schtasks.exe', async () => {
    const execFile = vi.fn((_file, _args, cb) => cb(null, 'ok', ''))

    await registerTask(dailyTask, { executablePath: 'C:\\AionUi.exe', execFile })
    await deleteTask('sch-123', { execFile })
    const status = await getTaskStatus('sch-123', { execFile })

    expect(execFile.mock.calls[0][0]).toBe('schtasks.exe')
    expect(execFile.mock.calls[0][1][0]).toBe('/Create')
    expect(execFile.mock.calls[1][1]).toEqual(['/Delete', '/F', '/TN', '\\AionUi\\ScheduledTasks\\sch-123'])
    expect(execFile.mock.calls[2][1]).toEqual(['/Query', '/TN', '\\AionUi\\ScheduledTasks\\sch-123'])
    expect(status).toEqual({ registered: true, stdout: 'ok' })
  })
})
