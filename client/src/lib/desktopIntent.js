const EXECUTE_PATTERNS = [
  /打开|启动|运行|关闭|点击|点一下|输入|键入|按下|按\s*ctrl|快捷键|选择|拖动|滚动|移动鼠标|操作|帮我.*(打开|点击|输入|操作)/
]

const FEEDBACK_PATTERNS = [
  /为啥|为什么|怎么回事|没反应|不执行|没有执行|你在干嘛|刚才|解释|原因|哪里错|失败了吗|卡住/
]

export function shouldRouteToDesktopTask(text) {
  const value = String(text || '').trim().toLowerCase()
  if (!value) return false
  if (FEEDBACK_PATTERNS.some((pattern) => pattern.test(value))) return false
  return EXECUTE_PATTERNS.some((pattern) => pattern.test(value))
}
