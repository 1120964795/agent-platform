const { register } = require('./index')
const { healthCheck, execute } = require('../services/browserUse/adapter')
const { requestConfirm } = require('../confirm')

async function browserTask(args, context = {}) {
  const { goal, max_steps = 15, start_url } = args

  if (!goal || typeof goal !== 'string') {
    return { error: { code: 'INVALID_ARGS', message: '需要提供浏览器任务目标。' } }
  }

  const health = await healthCheck()
  if (!health.available) {
    return {
      error: {
        code: 'RUNTIME_UNAVAILABLE',
        message: '浏览器自动化运行时不可用。请确认 Python、browser-use、Playwright 和浏览器自动化设置已配置。',
        detail: health.detail,
      },
    }
  }

  if (!context.skipInternalConfirm) {
    const allowed = await requestConfirm({
      kind: 'browser-task',
      payload: { goal, max_steps, start_url },
    })
    if (!allowed) {
      return { error: { code: 'USER_CANCELLED', message: '用户已取消浏览器任务。' } }
    }
  }

  const result = await execute(
    { goal, max_steps, start_url },
    { signal: context.signal }
  )

  return result
}

register({
  name: 'browser_task',
  description: '使用 AI 执行独立的网页浏览器子任务。智能体会在真实网页中导航、点击、输入并提取信息。适用于登录网站、抓取信息、填写表单、打开 URL。参数：goal（必填）为自然语言任务描述；max_steps（可选，默认 15）为最大浏览器步骤数；start_url（可选）为起始网址。',
  parameters: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: '浏览器任务的自然语言描述。' },
      max_steps: { type: 'number', description: '最大浏览器交互步骤数。默认 15。' },
      start_url: { type: 'string', description: '可选起始网址。' },
    },
    required: ['goal'],
  },
}, browserTask)

module.exports = { browserTask }
