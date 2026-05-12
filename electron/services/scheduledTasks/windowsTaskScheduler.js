const { execFile: defaultExecFile } = require('child_process')

const TASK_ROOT = '\\AionUi\\ScheduledTasks\\'
const WEEKDAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function pad(value) {
  return String(value).padStart(2, '0')
}

function assertTaskId(taskId) {
  if (!/^sch-[a-zA-Z0-9_-]+$/.test(String(taskId || ''))) {
    throw new Error(`Invalid scheduled task id: ${taskId}`)
  }
}

function buildTaskName(taskId) {
  assertTaskId(taskId)
  return `${TASK_ROOT}${taskId}`
}

function quote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`
}

function buildTaskRunCommand({ executablePath, appPath = '', taskId }) {
  assertTaskId(taskId)
  if (!executablePath) throw new Error('Missing executablePath for scheduled task command')
  const appSegment = appPath ? ` ${quote(appPath)}` : ''
  return `${quote(executablePath)}${appSegment} --run-scheduled-task ${taskId}`
}

function toTaskDateParts(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid one-time scheduled task runAt: ${value}`)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  )
  return {
    date: `${parts.month}/${parts.day}/${parts.year}`,
    time: `${parts.hour}:${parts.minute}`
  }
}

function scheduleArgs(schedule = {}) {
  if (schedule.kind === 'once') {
    const parts = toTaskDateParts(schedule.runAt)
    return ['/SC', 'ONCE', '/ST', parts.time, '/SD', parts.date]
  }
  if (schedule.kind === 'daily') {
    return ['/SC', 'DAILY', '/ST', `${pad(schedule.hour)}:${pad(schedule.minute)}`]
  }
  if (schedule.kind === 'weekly') {
    return ['/SC', 'WEEKLY', '/D', WEEKDAY_NAMES[schedule.dayOfWeek], '/ST', `${pad(schedule.hour)}:${pad(schedule.minute)}`]
  }
  if (schedule.kind === 'monthly') {
    return ['/SC', 'MONTHLY', '/D', String(schedule.dayOfMonth), '/ST', `${pad(schedule.hour)}:${pad(schedule.minute)}`]
  }
  if (schedule.kind === 'interval-minutes') {
    return ['/SC', 'MINUTE', '/MO', String(schedule.everyMinutes)]
  }
  throw new Error(`Unsupported scheduled task schedule kind: ${schedule.kind}`)
}

function buildCreateArgs(task, options = {}) {
  const taskName = buildTaskName(task.id)
  const runCommand = buildTaskRunCommand({ executablePath: options.executablePath, appPath: options.appPath, taskId: task.id })
  return ['/Create', '/F', '/TN', taskName, '/TR', runCommand, ...scheduleArgs(task.schedule)]
}

function execFilePromise(file, args, execFile = defaultExecFile) {
  return new Promise((resolve, reject) => {
    execFile(file, args, (error, stdout = '', stderr = '') => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve({ stdout, ...(stderr ? { stderr } : {}) })
    })
  })
}

async function registerTask(task, options = {}) {
  const executablePath = options.executablePath || process.execPath
  const result = await execFilePromise('schtasks.exe', buildCreateArgs(task, { executablePath, appPath: options.appPath }), options.execFile)
  return { registered: true, taskName: buildTaskName(task.id), ...result }
}

async function deleteTask(taskId, options = {}) {
  const result = await execFilePromise('schtasks.exe', ['/Delete', '/F', '/TN', buildTaskName(taskId)], options.execFile)
  return { registered: false, taskName: buildTaskName(taskId), ...result }
}

async function getTaskStatus(taskId, options = {}) {
  try {
    const result = await execFilePromise('schtasks.exe', ['/Query', '/TN', buildTaskName(taskId)], options.execFile)
    return { registered: true, ...result }
  } catch (error) {
    return { registered: false, error: error.message, stdout: error.stdout || '', stderr: error.stderr || '' }
  }
}

module.exports = {
  TASK_ROOT,
  buildTaskName,
  buildTaskRunCommand,
  buildCreateArgs,
  registerTask,
  deleteTask,
  getTaskStatus
}
