import { describe, expect, test } from 'vitest'
import { shouldRouteToDesktopTask } from './desktopIntent.js'

describe('desktop intent routing', () => {
  test('routes executable desktop tasks to Computer Use', () => {
    expect(shouldRouteToDesktopTask('帮我打开qq')).toBe(true)
    expect(shouldRouteToDesktopTask('点击右上角的关闭按钮')).toBe(true)
    expect(shouldRouteToDesktopTask('在输入框里输入 hello')).toBe(true)
    expect(shouldRouteToDesktopTask('按 ctrl s 保存')).toBe(true)
  })

  test('keeps feedback and debugging questions in normal chat', () => {
    expect(shouldRouteToDesktopTask('为啥不执行')).toBe(false)
    expect(shouldRouteToDesktopTask('为什么没有反应')).toBe(false)
    expect(shouldRouteToDesktopTask('你刚才在干嘛')).toBe(false)
    expect(shouldRouteToDesktopTask('解释一下为什么失败')).toBe(false)
  })
})
