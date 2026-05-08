import { expect, test, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { buildChineseMenuTemplate, installChineseMenu } = require('../menu')

test('Chinese application menu replaces default English top-level labels', () => {
  const template = buildChineseMenuTemplate({ isDev: true })

  expect(template.map((item) => item.label)).toEqual(['文件', '编辑', '视图', '窗口', '帮助'])
  expect(template[2].submenu.map((item) => item.label).filter(Boolean)).toContain('开发者工具')
})

test('application menu dispatches app actions for project commands', () => {
  const sendAction = vi.fn()
  const showAbout = vi.fn()
  const template = buildChineseMenuTemplate({ sendAction, showAbout })
  const fileMenu = template.find((item) => item.label === '文件')
  const viewMenu = template.find((item) => item.label === '视图')
  const helpMenu = template.find((item) => item.label === '帮助')

  fileMenu.submenu.find((item) => item.label === '新建对话').click()
  fileMenu.submenu.find((item) => item.label === '打开文件浏览器').click()
  fileMenu.submenu.find((item) => item.label === '设置').click()
  viewMenu.submenu.find((item) => item.label === '切换侧边栏').click()
  viewMenu.submenu.find((item) => item.label === '打开产物面板').click()
  helpMenu.submenu.find((item) => item.label === '关于 AgentDev Lite').click()

  expect(sendAction).toHaveBeenNthCalledWith(1, 'new-chat')
  expect(sendAction).toHaveBeenNthCalledWith(2, 'open-files')
  expect(sendAction).toHaveBeenNthCalledWith(3, 'open-settings')
  expect(sendAction).toHaveBeenNthCalledWith(4, 'toggle-sidebar')
  expect(sendAction).toHaveBeenNthCalledWith(5, 'open-artifacts')
  expect(showAbout).toHaveBeenCalled()
})

test('application menu avoids duplicate window and reload commands', () => {
  const template = buildChineseMenuTemplate({ isDev: true })
  const fileMenu = template.find((item) => item.label === '文件')
  const viewMenu = template.find((item) => item.label === '视图')
  const windowMenu = template.find((item) => item.label === '窗口')

  const fileLabels = fileMenu.submenu.map((item) => item.label).filter(Boolean)
  const viewLabels = viewMenu.submenu.map((item) => item.label).filter(Boolean)
  const windowLabels = windowMenu.submenu.map((item) => item.label).filter(Boolean)

  expect(fileLabels).toContain('退出应用')
  expect(fileLabels).not.toContain('关闭窗口')
  expect(windowLabels).toEqual(['最小化', '关闭窗口'])
  expect(viewLabels).toContain('重新加载')
  expect(windowLabels).not.toContain('重新打开窗口')
})

test('installChineseMenu builds and installs the menu template', () => {
  const menu = { id: 'menu' }
  const Menu = {
    buildFromTemplate: vi.fn(() => menu),
    setApplicationMenu: vi.fn()
  }

  installChineseMenu(Menu, { isDev: false })

  expect(Menu.buildFromTemplate).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ label: '文件' })
  ]))
  expect(Menu.setApplicationMenu).toHaveBeenCalledWith(menu)
})
