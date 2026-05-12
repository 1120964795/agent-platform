import { describe, expect, test } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const {
  parseScheduleText,
  parseScheduleTextDetailed,
  nextRunFromSchedule,
  normalizeScheduledTask,
  makeTaskHistoryEntry
} = require('../services/scheduledTasks/scheduleUtils')

describe('scheduled task schedule utilities', () => {
  test('parses daily Chinese schedule text', () => {
    const schedule = parseScheduleText('每天早上 8 点检查 https://example.com', new Date('2026-05-12T01:00:00+08:00'))

    expect(schedule).toEqual({
      kind: 'daily',
      hour: 8,
      minute: 0,
      timezone: 'Asia/Shanghai',
      human: '每天 08:00'
    })
  })

  test('parses readable Chinese schedule text', () => {
    expect(parseScheduleText('每天 8 点检查 https://example.com')).toEqual({
      kind: 'daily',
      hour: 8,
      minute: 0,
      timezone: 'Asia/Shanghai',
      human: '每天 08:00'
    })
    expect(parseScheduleText('每周一 9:30 汇总日报')).toMatchObject({
      kind: 'weekly',
      dayOfWeek: 1,
      hour: 9,
      minute: 30
    })
    expect(parseScheduleText('每月 1 日 8 点生成报告')).toMatchObject({
      kind: 'monthly',
      dayOfMonth: 1,
      hour: 8,
      minute: 0
    })
    expect(parseScheduleText('每隔 15 分钟检查一次')).toMatchObject({
      kind: 'interval-minutes',
      everyMinutes: 15
    })
  })

  test('parses weekly Chinese schedule text', () => {
    const schedule = parseScheduleText('每周一 9:30 生成报告', new Date('2026-05-12T01:00:00+08:00'))

    expect(schedule).toEqual({
      kind: 'weekly',
      dayOfWeek: 1,
      hour: 9,
      minute: 30,
      timezone: 'Asia/Shanghai',
      human: '每周一 09:30'
    })
  })

  test('parses monthly Chinese schedule text', () => {
    const schedule = parseScheduleText('每月 1 号 8 点生成月报', new Date('2026-05-12T01:00:00+08:00'))

    expect(schedule).toEqual({
      kind: 'monthly',
      dayOfMonth: 1,
      hour: 8,
      minute: 0,
      timezone: 'Asia/Shanghai',
      human: '每月 1 号 08:00'
    })
  })

  test('parses minute interval schedule text', () => {
    const schedule = parseScheduleText('每隔 15 分钟检查一次状态', new Date('2026-05-12T01:00:00+08:00'))

    expect(schedule).toEqual({
      kind: 'interval-minutes',
      everyMinutes: 15,
      timezone: 'Asia/Shanghai',
      human: '每隔 15 分钟'
    })
  })

  test('returns null when no schedule is clear', () => {
    expect(parseScheduleText('有空的时候检查网页')).toBeNull()
  })

  test('parses one-time Chinese reminder for tonight', () => {
    const schedule = parseScheduleText('今天晚上8点提醒我', new Date('2026-05-12T10:00:00+08:00'))

    expect(schedule).toEqual({
      kind: 'once',
      runAt: '2026-05-12T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      human: '今天 20:00'
    })
  })

  test('parses one-time Chinese reminder for tomorrow morning', () => {
    const schedule = parseScheduleText('明天上午9点提醒我', new Date('2026-05-12T10:00:00+08:00'))

    expect(schedule).toEqual({
      kind: 'once',
      runAt: '2026-05-13T01:00:00.000Z',
      timezone: 'Asia/Shanghai',
      human: '明天 09:00'
    })
  })

  test('parses one-time Chinese reminder with afternoon colon time', () => {
    const schedule = parseScheduleText('明天下午3:30提醒我', new Date('2026-05-12T10:00:00+08:00'))

    expect(schedule).toEqual({
      kind: 'once',
      runAt: '2026-05-13T07:30:00.000Z',
      timezone: 'Asia/Shanghai',
      human: '明天 15:30'
    })
  })

  test('parses one-time explicit date reminder', () => {
    const schedule = parseScheduleText('2026-05-13 20:30 提醒我', new Date('2026-05-12T10:00:00+08:00'))

    expect(schedule).toEqual({
      kind: 'once',
      runAt: '2026-05-13T12:30:00.000Z',
      timezone: 'Asia/Shanghai',
      human: '2026-05-13 20:30'
    })
  })

  test('parses one-time Chinese month-day reminder', () => {
    const schedule = parseScheduleText('5月13日20点提醒我', new Date('2026-05-12T10:00:00+08:00'))

    expect(schedule).toEqual({
      kind: 'once',
      runAt: '2026-05-13T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      human: '5月13日 20:00'
    })
  })

  test('returns detailed error for one-time reminder in the past', () => {
    const parsed = parseScheduleTextDetailed('今天上午8点提醒我', new Date('2026-05-12T10:00:00+08:00'))

    expect(parsed).toEqual({
      schedule: null,
      error: {
        code: 'PAST_ONCE',
        message: '这个一次性提醒时间已经过去，请换成未来时间，例如 明天上午8点。'
      }
    })
  })

  test('calculates next daily run after current time', () => {
    const next = nextRunFromSchedule(
      { kind: 'daily', hour: 8, minute: 0, timezone: 'Asia/Shanghai', human: '每天 08:00' },
      new Date('2026-05-12T09:00:00+08:00')
    )

    expect(next).toBe('2026-05-13T00:00:00.000Z')
  })

  test('calculates next run for future and past one-time schedules', () => {
    const schedule = {
      kind: 'once',
      runAt: '2026-05-12T12:00:00.000Z',
      timezone: 'Asia/Shanghai',
      human: '今天 20:00'
    }

    expect(nextRunFromSchedule(schedule, new Date('2026-05-12T10:00:00+08:00'))).toBe('2026-05-12T12:00:00.000Z')
    expect(nextRunFromSchedule(schedule, new Date('2026-05-12T21:00:00+08:00'))).toBeNull()
  })

  test('normalizes scheduled task records with preauthorization fields', () => {
    const task = normalizeScheduledTask({
      id: 'sch-test',
      name: '检查网页',
      prompt: '每天 8 点检查网页',
      schedule: { kind: 'daily', hour: 8, minute: 0, timezone: 'Asia/Shanghai', human: '每天 08:00' },
      conversationId: 'conv-test',
      createdAt: '2026-05-12T00:00:00.000Z',
      updatedAt: '2026-05-12T00:00:00.000Z'
    })

    expect(task).toMatchObject({
      id: 'sch-test',
      enabled: true,
      preauthorized: true,
      authorization: { mode: 'full-trust', confirmedBy: 'local-user' },
      lastStatus: 'never-run',
      history: []
    })
  })

  test('history entries keep recent structured run data', () => {
    expect(makeTaskHistoryEntry({
      taskId: 'sch-test',
      trigger: 'manual',
      status: 'success',
      summary: 'Ran task',
      toolCalls: [{ name: 'browser_task', status: 'success' }]
    })).toMatchObject({
      taskId: 'sch-test',
      trigger: 'manual',
      status: 'success',
      summary: 'Ran task',
      toolCalls: [{ name: 'browser_task', status: 'success' }]
    })
  })
})
