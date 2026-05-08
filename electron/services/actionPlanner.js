const {
  KNOWN_RUNTIME_NAMES,
  KNOWN_ACTION_TYPES,
  ACTION_STATUS,
  RISK_LEVELS
} = require('../security/actionTypes')

class ActionPlannerError extends Error {
  constructor(code, message, details) {
    super(message)
    this.code = code
    this.details = details
  }
}

function dateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

function makeId(prefix, date, index) {
  return `${prefix}_${dateStamp(date)}_${String(index + 1).padStart(6, '0')}`
}

function parseModelJson(raw) {
  if (Array.isArray(raw) || (raw && typeof raw === 'object')) return raw
  const text = String(raw || '').replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim()
  const objectStart = text.indexOf('{')
  const objectEnd = text.lastIndexOf('}')
  const arrayStart = text.indexOf('[')
  const arrayEnd = text.lastIndexOf(']')
  if (arrayStart !== -1 && arrayEnd > arrayStart && (objectStart === -1 || arrayStart < objectStart)) return JSON.parse(text.slice(arrayStart, arrayEnd + 1))
  if (objectStart !== -1 && objectEnd > objectStart) return JSON.parse(text.slice(objectStart, objectEnd + 1))
  throw new ActionPlannerError('PLAN_JSON_MISSING', 'Qwen 未返回 JSON 动作提案。')
}

function unwrapPlan(parsed) {
  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed.actions)) return parsed.actions
  if (Array.isArray(parsed.proposals)) return parsed.proposals
  if (Array.isArray(parsed.actionProposals)) return parsed.actionProposals
  throw new ActionPlannerError('PLAN_ACTIONS_MISSING', 'Qwen JSON 中没有动作提案数组。')
}

function text(value, fallback = '') {
  const str = String(value || '').trim()
  return str || fallback
}

function summarizePayload(type, payload = {}) {
  if (type === 'shell.command') return text(payload.command, '运行 Shell 命令')
  if (type === 'file.read') return `读取 ${text(payload.path, '文件')}`
  if (type === 'file.write') return `写入 ${text(payload.path, '文件')}`
  if (type === 'file.delete') return `删除 ${text(payload.path, '路径')}`
  if (type === 'file.move') return `将 ${text(payload.from || payload.source, '路径')} 移动到 ${text(payload.to || payload.target, '目标位置')}`
  if (type === 'code.execute') return `执行 ${text(payload.language, 'code')} 代码片段`
  if (type === 'screen.observe') return '观察屏幕'
  if (type === 'screen.region.select') return '选择屏幕区域'
  if (type === 'mouse.move') return `移动鼠标到 ${payload.x ?? '?'}，${payload.y ?? '?'}`
  if (type === 'mouse.click') return `点击 ${payload.x ?? '?'}，${payload.y ?? '?'}`
  if (type === 'keyboard.type') return '输入文本'
  if (type === 'keyboard.shortcut') return `按下快捷键 ${Array.isArray(payload.keys) ? payload.keys.join('+') : text(payload.keys, 'shortcut')}`
  if (type === 'runtime.setup') return `设置 ${text(payload.runtime, '运行时')}`
  if (type === 'audit.export') return '导出审计日志'
  if (type === 'output.open') return `打开 ${text(payload.path, '输出')}`
  return type
}

function normalizeRisk(value) {
  return Object.values(RISK_LEVELS).includes(value) ? value : RISK_LEVELS.MEDIUM
}

function validateProposal(item, index) {
  if (!item || typeof item !== 'object') throw new ActionPlannerError('PLAN_ACTION_INVALID', `索引 ${index} 的动作不是对象。`)
  if (!KNOWN_RUNTIME_NAMES.includes(item.runtime)) throw new ActionPlannerError('PLAN_RUNTIME_UNKNOWN', `未知运行时：${item.runtime}`, { index, runtime: item.runtime })
  if (!KNOWN_ACTION_TYPES.includes(item.type)) throw new ActionPlannerError('PLAN_ACTION_TYPE_UNKNOWN', `未知动作类型：${item.type}`, { index, type: item.type })
}

function normalizeActionPlan(raw, options = {}) {
  const parsed = parseModelJson(raw)
  const actions = unwrapPlan(parsed)
  const now = options.now || new Date()
  const sessionId = options.sessionId || makeId('sess', now, 0)

  return actions.map((item, index) => {
    validateProposal(item, index)
    const type = item.type
    const payload = item.payload && typeof item.payload === 'object' ? item.payload : {}
    const summary = text(item.summary, summarizePayload(type, payload))
    const title = text(item.title, summary)
    const risk = normalizeRisk(item.risk)
    return {
      id: text(item.id, makeId('act', now, index)),
      sessionId: text(item.sessionId, sessionId),
      runtime: item.runtime,
      type,
      title,
      summary,
      payload,
      risk,
      requiresConfirmation: typeof item.requiresConfirmation === 'boolean'
        ? item.requiresConfirmation
        : risk === RISK_LEVELS.MEDIUM || risk === RISK_LEVELS.HIGH,
      status: item.status && Object.values(ACTION_STATUS).includes(item.status) ? item.status : ACTION_STATUS.PENDING,
      createdAt: text(item.createdAt, now.toISOString())
    }
  })
}

function buildPlannerPrompt(userTask) {
  return [
    {
      role: 'system',
      content: [
        'You are Qwen inside AionUi. Return only JSON.',
        'Create an array of ActionProposal objects for AionUi to validate.',
        'Never ask runtimes to execute hidden background work.',
        'Use open-interpreter for command, file, and code work.',
        'Use ui-tars for screen, mouse, and keyboard work.',
        'Use aionui-dry-run when the task is explicitly a demo or runtimes are unavailable.'
      ].join('\n')
    },
    { role: 'user', content: userTask }
  ]
}

module.exports = {
  ActionPlannerError,
  buildPlannerPrompt,
  normalizeActionPlan,
  parseModelJson,
  summarizePayload
}
