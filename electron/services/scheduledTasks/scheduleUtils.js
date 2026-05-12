const DEFAULT_TIMEZONE = 'Asia/Shanghai'
const MAX_HISTORY = 20

const WEEKDAY_MAP = new Map([
  ['日', 0],
  ['天', 0],
  ['一', 1],
  ['二', 2],
  ['三', 3],
  ['四', 4],
  ['五', 5],
  ['六', 6],
  ['sun', 0],
  ['sunday', 0],
  ['mon', 1],
  ['monday', 1],
  ['tue', 2],
  ['tuesday', 2],
  ['wed', 3],
  ['wednesday', 3],
  ['thu', 4],
  ['thursday', 4],
  ['fri', 5],
  ['friday', 5],
  ['sat', 6],
  ['saturday', 6],
  ['一', 1],
  ['二', 2],
  ['三', 3],
  ['四', 4],
  ['五', 5],
  ['六', 6],
  ['日', 0],
  ['天', 0],
  ['1', 1],
  ['2', 2],
  ['3', 3],
  ['4', 4],
  ['5', 5],
  ['6', 6],
  ['7', 0],
  ['0', 0]
])

function pad(value) {
  return String(value).padStart(2, '0')
}

function clampInt(value, min, max) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return null
  return Math.min(max, Math.max(min, parsed))
}

const CN = {
  today: '\u4eca\u5929',
  tonight: '\u4eca\u665a',
  tomorrow: '\u660e\u5929',
  morning: '\u65e9\u4e0a|\u4e0a\u5348',
  noon: '\u4e2d\u5348',
  afternoon: '\u4e0b\u5348',
  evening: '\u665a\u4e0a',
  month: '\u6708',
  day: '\u65e5|\u53f7|\u865f',
  hour: '\u70b9|\u9ede|\u65f6|\u6642',
  minute: '\u5206|\u5206\u949f'
}

const PAST_ONCE_MESSAGE = '\u8fd9\u4e2a\u4e00\u6b21\u6027\u63d0\u9192\u65f6\u95f4\u5df2\u7ecf\u8fc7\u53bb\uff0c\u8bf7\u6362\u6210\u672a\u6765\u65f6\u95f4\uff0c\u4f8b\u5982 \u660e\u5929\u4e0a\u53488\u70b9\u3002'

function normalizeHourByPeriod(hour, period = '') {
  if (hour == null) return hour
  if (!period) return hour
  if (new RegExp(CN.afternoon).test(period) || new RegExp(CN.evening).test(period) || period === CN.tonight) {
    return hour >= 1 && hour <= 11 ? hour + 12 : hour
  }
  if (new RegExp(CN.noon).test(period)) {
    return hour >= 1 && hour <= 10 ? hour + 12 : hour
  }
  return hour
}

function parseReadableClock(text) {
  const source = String(text || '')
  const periodPattern = `${CN.tonight}|${CN.morning}|${CN.noon}|${CN.afternoon}|${CN.evening}`
  const half = source.match(new RegExp(`(${periodPattern})?\\s*(\\d{1,2})\\s*(?:${CN.hour})\\s*\\u534a`))
  if (half) {
    return {
      hour: normalizeHourByPeriod(clampInt(half[2], 0, 23), half[1] || ''),
      minute: 30
    }
  }

  const chinese = source.match(new RegExp(`(${periodPattern})?\\s*(\\d{1,2})\\s*(?:${CN.hour})(?:\\s*(\\d{1,2})\\s*(?:${CN.minute})?)?`))
  if (chinese) {
    return {
      hour: normalizeHourByPeriod(clampInt(chinese[2], 0, 23), chinese[1] || ''),
      minute: chinese[3] ? clampInt(chinese[3], 0, 59) : 0
    }
  }

  const colon = source.match(new RegExp(`(${periodPattern})?\\s*(\\d{1,2})\\s*[:\uff1a]\\s*(\\d{1,2})`))
  if (colon) {
    return {
      hour: normalizeHourByPeriod(clampInt(colon[2], 0, 23), colon[1] || ''),
      minute: clampInt(colon[3], 0, 59)
    }
  }

  const englishClock = source.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)\b/i)
  if (englishClock) {
    let hour = clampInt(englishClock[1], 0, 23)
    const minute = englishClock[2] ? clampInt(englishClock[2], 0, 59) : 0
    const meridiem = englishClock[3]?.toLowerCase()
    if (meridiem === 'pm' && hour < 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0
    return { hour, minute }
  }

  return null
}

function parseClock(text) {
  const source = String(text || '')
  const readable = parseReadableClock(source)
  if (readable) return readable
  const englishClock = source.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)?\b/i)
  if (englishClock) {
    let hour = clampInt(englishClock[1], 0, 23)
    const minute = englishClock[2] ? clampInt(englishClock[2], 0, 59) : 0
    const meridiem = englishClock[3]?.toLowerCase()
    if (meridiem === 'pm' && hour < 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0
    return { hour, minute }
  }
  const colon = source.match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/)
  if (colon) {
    return {
      hour: clampInt(colon[1], 0, 23),
      minute: clampInt(colon[2], 0, 59)
    }
  }
  const hourOnly = source.match(/(\d{1,2})\s*(点|點|时|時)/)
  if (hourOnly) {
    return {
      hour: clampInt(hourOnly[1], 0, 23),
      minute: 0
    }
  }
  return { hour: 8, minute: 0 }
}

function parseScheduleTextInternal(text) {
  const source = String(text || '').trim()
  if (!source) return null

  const readableInterval = source.match(/(?:每隔|every)\s*(\d{1,4})\s*(?:分钟|分|minutes?|mins?)/i)
  if (readableInterval) {
    const everyMinutes = clampInt(readableInterval[1], 1, 1440)
    return {
      kind: 'interval-minutes',
      everyMinutes,
      timezone: DEFAULT_TIMEZONE,
      human: `每隔 ${everyMinutes} 分钟`
    }
  }

  const readableMonthly = source.match(/(?:每月|monthly|on day)\s*(\d{1,2})\s*(日|号|號|st|nd|rd|th)?/i)
  if (readableMonthly) {
    const { hour, minute } = parseClock(source)
    const dayOfMonth = clampInt(readableMonthly[1], 1, 31)
    const daySuffix = readableMonthly[2] === '号' || readableMonthly[2] === '號' ? '号' : '日'
    return {
      kind: 'monthly',
      dayOfMonth,
      hour,
      minute,
      timezone: DEFAULT_TIMEZONE,
      human: `每月 ${dayOfMonth} ${daySuffix} ${pad(hour)}:${pad(minute)}`
    }
  }

  const readableWeekly = source.match(/(?:每周|每星期|周|星期|礼拜)\s*([一二三四五六日天0-7]|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)/i)
  if (readableWeekly) {
    const { hour, minute } = parseClock(source)
    const key = readableWeekly[1].toLowerCase()
    const dayOfWeek = WEEKDAY_MAP.get(key)
    return {
      kind: 'weekly',
      dayOfWeek,
      hour,
      minute,
      timezone: DEFAULT_TIMEZONE,
      human: `每周${readableWeekly[1]} ${pad(hour)}:${pad(minute)}`
    }
  }

  if (/每天|每日|daily|every day/i.test(source)) {
    const { hour, minute } = parseClock(source)
    return {
      kind: 'daily',
      hour,
      minute,
      timezone: DEFAULT_TIMEZONE,
      human: `每天 ${pad(hour)}:${pad(minute)}`
    }
  }

  const interval = source.match(/每\s*(隔)?\s*(\d{1,4})\s*分钟/)
  if (interval) {
    const everyMinutes = clampInt(interval[2], 1, 1440)
    return {
      kind: 'interval-minutes',
      everyMinutes,
      timezone: DEFAULT_TIMEZONE,
      human: `每隔 ${everyMinutes} 分钟`
    }
  }

  const monthly = source.match(/每月\s*(\d{1,2})\s*(号|日)?/)
  if (monthly) {
    const { hour, minute } = parseClock(source)
    const dayOfMonth = clampInt(monthly[1], 1, 31)
    return {
      kind: 'monthly',
      dayOfMonth,
      hour,
      minute,
      timezone: DEFAULT_TIMEZONE,
      human: `每月 ${dayOfMonth} 号 ${pad(hour)}:${pad(minute)}`
    }
  }

  const weekly = source.match(/每周\s*([一二三四五六日天0-7])/)
  if (weekly) {
    const { hour, minute } = parseClock(source)
    const dayOfWeek = WEEKDAY_MAP.get(weekly[1])
    return {
      kind: 'weekly',
      dayOfWeek,
      hour,
      minute,
      timezone: DEFAULT_TIMEZONE,
      human: `每周${weekly[1]} ${pad(hour)}:${pad(minute)}`
    }
  }

  if (/每天|每日/.test(source)) {
    const { hour, minute } = parseClock(source)
    return {
      kind: 'daily',
      hour,
      minute,
      timezone: DEFAULT_TIMEZONE,
      human: `每天 ${pad(hour)}:${pad(minute)}`
    }
  }

  return null
}

function makeOnceSchedule(year, month, day, hour, minute, humanPrefix, now) {
  const reference = now instanceof Date ? now : new Date(now)
  const runAtDate = shanghaiWallTimeToUtc(year, month, day, hour, minute)
  if (Number.isNaN(runAtDate.getTime())) return null
  if (runAtDate <= reference) {
    return {
      schedule: null,
      error: {
        code: 'PAST_ONCE',
        message: PAST_ONCE_MESSAGE
      }
    }
  }
  return {
    schedule: {
      kind: 'once',
      runAt: runAtDate.toISOString(),
      timezone: DEFAULT_TIMEZONE,
      human: `${humanPrefix} ${pad(hour)}:${pad(minute)}`
    },
    error: null
  }
}

function parseOnceSchedule(text, now = new Date()) {
  const source = String(text || '').trim()
  if (!source) return null
  const reference = now instanceof Date ? now : new Date(now)
  const local = toShanghaiDateParts(reference)

  const explicitDate = source.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (explicitDate) {
    const clock = parseReadableClock(source)
    if (!clock) return null
    const year = clampInt(explicitDate[1], 1970, 9999)
    const month = clampInt(explicitDate[2], 1, 12)
    const day = clampInt(explicitDate[3], 1, 31)
    return makeOnceSchedule(year, month, day, clock.hour, clock.minute, `${year}-${pad(month)}-${pad(day)}`, reference)
  }

  const monthDay = source.match(new RegExp(`(\\d{1,2})\\s*(?:${CN.month})\\s*(\\d{1,2})\\s*(?:${CN.day})`))
  if (monthDay) {
    const clock = parseReadableClock(source)
    if (!clock) return null
    const month = clampInt(monthDay[1], 1, 12)
    const day = clampInt(monthDay[2], 1, 31)
    const hasPassedDate = month < local.month || (month === local.month && day < local.day)
    const year = hasPassedDate ? local.year + 1 : local.year
    return makeOnceSchedule(year, month, day, clock.hour, clock.minute, `${month}\u6708${day}\u65e5`, reference)
  }

  const hasToday = source.includes(CN.today) || source.includes(CN.tonight)
  const hasTomorrow = source.includes(CN.tomorrow)
  if (!hasToday && !hasTomorrow) return null
  const clock = parseReadableClock(source)
  if (!clock) return null

  const base = shanghaiWallTimeToUtc(local.year, local.month, local.day, 0, 0)
  const target = addDays(base, hasTomorrow ? 1 : 0)
  const targetLocal = toShanghaiDateParts(target)
  return makeOnceSchedule(
    targetLocal.year,
    targetLocal.month,
    targetLocal.day,
    clock.hour,
    clock.minute,
    hasTomorrow ? CN.tomorrow : CN.today,
    reference
  )
}

function parseScheduleTextDetailed(text, now = new Date()) {
  const source = String(text || '').trim()
  if (!source) return { schedule: null, error: null }

  const once = parseOnceSchedule(source, now)
  if (once?.schedule || once?.error) return once

  return {
    schedule: parseScheduleTextInternal(source, now),
    error: null
  }
}

function parseScheduleText(text, now = new Date()) {
  return parseScheduleTextDetailed(text, now).schedule
}

function toShanghaiDateParts(date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  }
}

function shanghaiWallTimeToUtc(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0))
}

function addDays(date, days) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function nextRunFromSchedule(schedule = {}, from = new Date()) {
  if (schedule.kind === 'once') {
    if (!schedule.runAt) return null
    const runAt = new Date(schedule.runAt)
    if (Number.isNaN(runAt.getTime()) || runAt <= from) return null
    return runAt.toISOString()
  }

  if (schedule.kind === 'interval-minutes') {
    return new Date(from.getTime() + schedule.everyMinutes * 60 * 1000).toISOString()
  }

  const local = toShanghaiDateParts(from)
  let candidate = shanghaiWallTimeToUtc(local.year, local.month, local.day, schedule.hour || 0, schedule.minute || 0)

  if (schedule.kind === 'daily') {
    if (candidate <= from) candidate = addDays(candidate, 1)
    return candidate.toISOString()
  }

  if (schedule.kind === 'weekly') {
    const localDay = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay()
    let daysUntil = (schedule.dayOfWeek - localDay + 7) % 7
    if (daysUntil === 0 && candidate <= from) daysUntil = 7
    return addDays(candidate, daysUntil).toISOString()
  }

  if (schedule.kind === 'monthly') {
    const day = Math.min(schedule.dayOfMonth || 1, 28)
    candidate = shanghaiWallTimeToUtc(local.year, local.month, day, schedule.hour || 0, schedule.minute || 0)
    if (candidate <= from) {
      const month = local.month === 12 ? 1 : local.month + 1
      const year = local.month === 12 ? local.year + 1 : local.year
      candidate = shanghaiWallTimeToUtc(year, month, day, schedule.hour || 0, schedule.minute || 0)
    }
    return candidate.toISOString()
  }

  return null
}

function makeTaskHistoryEntry({ taskId, trigger, status, summary = '', error = null, toolCalls = [], runAt = new Date().toISOString(), completedAt = null }) {
  return {
    runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskId,
    trigger,
    status,
    runAt,
    completedAt,
    summary,
    error,
    toolCalls
  }
}

function normalizeScheduledTask(task = {}, now = new Date()) {
  const createdAt = task.createdAt || now.toISOString()
  const updatedAt = task.updatedAt || createdAt
  const schedule = task.schedule || parseScheduleText(task.prompt || '', now)
  return {
    id: task.id,
    name: task.name || 'Scheduled task',
    prompt: task.prompt || '',
    schedule,
    enabled: task.enabled !== false,
    preauthorized: true,
    authorization: {
      mode: 'full-trust',
      confirmedAt: task.authorization?.confirmedAt || createdAt,
      confirmedBy: task.authorization?.confirmedBy || 'local-user',
      summary: task.authorization?.summary || 'User confirmed that future scheduled runs do not ask again for high-risk confirmation.'
    },
    conversationId: task.conversationId,
    systemTaskName: task.systemTaskName || '',
    createdAt,
    updatedAt,
    nextRunAt: task.nextRunAt || (schedule ? nextRunFromSchedule(schedule, now) : null),
    lastRun: task.lastRun || null,
    lastStatus: task.lastStatus || 'never-run',
    history: Array.isArray(task.history) ? task.history.slice(0, MAX_HISTORY) : []
  }
}

module.exports = {
  DEFAULT_TIMEZONE,
  MAX_HISTORY,
  parseScheduleText,
  parseScheduleTextDetailed,
  nextRunFromSchedule,
  normalizeScheduledTask,
  makeTaskHistoryEntry
}
