function noop() {}

function buildChineseMenuTemplate({ isDev = false, sendAction = noop, showAbout = noop } = {}) {
  return [
    {
      label: '文件',
      submenu: [
        {
          label: '新建对话',
          accelerator: 'CommandOrControl+N',
          click: () => sendAction('new-chat')
        },
        {
          label: '打开文件浏览器',
          accelerator: 'CommandOrControl+O',
          click: () => sendAction('open-files')
        },
        { type: 'separator' },
        {
          label: '设置',
          accelerator: 'CommandOrControl+,',
          click: () => sendAction('open-settings')
        },
        {
          label: '退出登录',
          click: () => sendAction('logout')
        },
        { type: 'separator' },
        { label: '退出应用', role: 'quit' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '切换侧边栏',
          accelerator: 'CommandOrControl+B',
          click: () => sendAction('toggle-sidebar')
        },
        {
          label: '打开产物面板',
          accelerator: 'CommandOrControl+Shift+A',
          click: () => sendAction('open-artifacts')
        },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' },
        ...(isDev ? [
          { type: 'separator' },
          { label: '重新加载', role: 'reload' },
          { label: '强制重新加载', role: 'forceReload' },
          { label: '开发者工具', role: 'toggleDevTools' }
        ] : [])
      ]
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '关闭窗口', role: 'close' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 AgentDev Lite',
          click: showAbout
        }
      ]
    }
  ]
}

function installChineseMenu(Menu, options = {}) {
  if (!Menu?.buildFromTemplate || !Menu?.setApplicationMenu) return
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildChineseMenuTemplate(options)))
}

module.exports = { buildChineseMenuTemplate, installChineseMenu }
