const CONFIRM_WORDS = new Set(['确认', '可以', '同意', '继续', '可以的', '确认执行'])
const REJECT_WORDS = new Set(['取消', '拒绝', '不行', '不要', '取消吧', '不要了'])
const CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000

function normalizeReply(text) {
  return String(text || '')
    .trim()
    .replace(/[。！!.\s]+$/g, '')
    .toLowerCase()
}

function classifyConfirmationReply(text) {
  const normalized = normalizeReply(text)
  if (CONFIRM_WORDS.has(normalized)) return 'confirm'
  if (REJECT_WORDS.has(normalized)) return 'reject'
  return 'clarification'
}

function formatArgs(args) {
  if (!args || typeof args !== 'object') return ''
  try {
    return JSON.stringify(args, null, 2).slice(0, 1200)
  } catch {
    return String(args).slice(0, 1200)
  }
}

function buildConfirmationPrompt({ call, decision, retry }) {
  const lines = [
    `需要确认高风险操作: ${call.name}`,
    `风险原因: ${decision.reason || '高风险操作'}`,
  ]
  const args = formatArgs(call.args)
  if (args) lines.push(`参数:\n${args}`)
  if (retry?.previousError) {
    lines.push(`上一次尝试失败: ${retry.previousError.code}: ${retry.previousError.message}`)
  }
  lines.push('回复“确认 / 可以 / 同意 / 继续”执行。')
  lines.push('回复“取消 / 拒绝 / 不行 / 不要”取消。')
  return `${lines.join('\n')}\n`
}

function buildPendingExplanation(pending) {
  const lines = [
    `当前仍在等待确认: ${pending.call.name}`,
    `风险原因: ${pending.decision.reason || '高风险操作'}`,
  ]
  const args = formatArgs(pending.call.args)
  if (args) lines.push(`参数:\n${args}`)
  lines.push('请回复“确认 / 可以 / 同意 / 继续”执行，或回复“取消 / 拒绝 / 不行 / 不要”取消。')
  return lines.join('\n')
}

function buildNoPendingMessage() {
  return '当前没有等待确认的高风险操作。'
}

function buildMissingSkillMessage(name, skills = []) {
  const suggestions = skills.slice(0, 8).map((skill) => (
    skill.description ? `/${skill.name} - ${skill.description}` : `/${skill.name}`
  )).join('\n')
  return suggestions
    ? `未安装或未启用技能: ${name}\n可用技能:\n${suggestions}`
    : `未安装或未启用技能: ${name}\n当前没有可用技能。`
}

module.exports = {
  CONFIRMATION_TIMEOUT_MS,
  classifyConfirmationReply,
  buildConfirmationPrompt,
  buildPendingExplanation,
  buildNoPendingMessage,
  buildMissingSkillMessage
}
