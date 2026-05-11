import { Check, Loader2, X } from 'lucide-react'
import RiskBadge from './RiskBadge.jsx'

const STATUS_LABELS = {
  proposed: '已提议',
  pending: '待审批',
  approved: '已批准',
  denied: '已拒绝',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  blocked: '已阻止',
  cancelled: '已取消'
}

const RUNTIME_LABELS = {
  deepseek: 'DeepSeek',
  'browser-use': '浏览器自动化',
  'ui-tars': 'UI-TARS',
  'aionui-dry-run': '演示模式'
}

const ACTION_TYPE_LABELS = {
  'shell.command': 'Shell 命令',
  'file.read': '读取文件',
  'file.write': '写入文件',
  'file.delete': '删除文件',
  'file.move': '移动文件',
  'code.execute': '执行代码',
  'runtime.setup': '运行时设置',
  'runtime.start': '启动运行时',
  'runtime.stop': '停止运行时',
  'screen.observe': '查看屏幕',
  'screen.region.select': '选择屏幕区域',
  'mouse.move': '移动鼠标',
  'mouse.click': '鼠标点击',
  'keyboard.type': '键盘输入',
  'keyboard.shortcut': '键盘快捷键',
  'web.navigate': '网页导航',
  'web.observe': '查看网页',
  'web.click': '网页点击',
  'web.type': '网页输入',
  'web.query': '网页查询',
  'output.open': '打开输出',
  'audit.export': '导出审计'
}

function payloadText(payload) {
  if (!payload || Object.keys(payload).length === 0) return ''
  return JSON.stringify(payload, null, 2)
}

export default function ActionCard({ action, onApprove, onDeny, onCancel, compact = false }) {
  const risk = action.risk || action.riskLevel || 'medium'
  const status = action.status || 'proposed'
  const runtimeLabel = RUNTIME_LABELS[action.runtime] || action.runtime || '运行时'
  const typeLabel = ACTION_TYPE_LABELS[action.type] || action.type || '动作'
  const canConfirmHighRisk = risk === 'high' && status === 'pending' && onApprove && onDeny
  const canCancelRunning = (risk === 'low' || risk === 'medium') && status === 'running' && onCancel
  const borderClass = risk === 'high' && status === 'pending'
    ? 'border-2 border-[color:var(--error)]'
    : risk === 'high' && status === 'running'
      ? 'border border-yellow-400'
      : 'border border-[color:var(--border)]'

  let statusText = STATUS_LABELS[status] || status
  if ((risk === 'low' || risk === 'medium') && status === 'running') statusText = `${risk === 'low' ? '低风险' : '中风险'} · 自动执行中...`
  if (risk === 'high' && status === 'pending') statusText = '高风险 · 需要确认'
  if (risk === 'high' && status === 'running') statusText = '已确认 · 执行中'
  if (status === 'completed') statusText = '执行完成'
  if (status === 'denied') statusText = '用户拒绝'

  return (
    <div className={`rounded-md bg-[color:var(--bg-secondary)] p-3 ${borderClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{action.title || typeLabel}</div>
          <div className="mt-1 flex items-center gap-1 text-xs text-[color:var(--text-muted)]">
            {status === 'running' && <Loader2 size={12} className="animate-spin" />}
            <span>{runtimeLabel} · {typeLabel} · {statusText}</span>
          </div>
        </div>
        <RiskBadge risk={risk} />
      </div>
      {action.summary && <p className="mt-2 text-xs text-[color:var(--text-muted)]">{action.summary}</p>}
      {!compact && payloadText(action.payload) && (
        <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-[color:var(--bg-primary)] border border-[color:var(--border)] p-2 text-[11px] whitespace-pre-wrap break-words">{payloadText(action.payload)}</pre>
      )}
      {action.blockedReason && <div className="mt-2 text-xs text-[color:var(--error)]">{action.blockedReason}</div>}
      {action.error?.message && <div className="mt-2 text-xs text-[color:var(--error)]">{action.error.message}</div>}
      {canConfirmHighRisk && (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => onApprove(action.id)} className="h-8 flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-green-600 text-white text-sm hover:bg-green-700">
            <Check size={14} /> 确认执行
          </button>
          <button type="button" onClick={() => onDeny(action.id)} className="h-8 flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-[color:var(--border)] text-sm hover:bg-[color:var(--bg-tertiary)]">
            <X size={14} /> 取消
          </button>
        </div>
      )}
      {canCancelRunning && (
        <div className="mt-3">
          <button type="button" onClick={() => onCancel(action.id)} className="h-8 inline-flex items-center justify-center gap-1 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)]">
            <X size={14} /> 取消
          </button>
        </div>
      )}
    </div>
  )
}
