const { dialog, BrowserWindow } = require('electron')
const { store } = require('./store')

let dialogProvider = defaultDialogProvider
const sessionAllowed = new Set()

function shellCommandKey(command = '') {
  return String(command).trim().split(/\s+/)[0].replace(/^['"]|['"]$/g, '').toLowerCase()
}

function buildDiagnosisDetail(payload = {}) {
  return [
    payload.title ? `Diagnosis:\n${payload.title}` : '',
    payload.command ? `Command:\n${payload.command}` : '',
    payload.cwd ? `CWD:\n${payload.cwd}` : '',
    payload.downloadUrl ? `URL:\n${payload.downloadUrl}` : '',
    payload.downloadTarget ? `Download Target:\n${payload.downloadTarget}` : '',
    payload.downloadExtension ? `Download Type:\n${payload.downloadExtension}` : '',
    `Executes After Download:\n${payload.executesAfterDownload ? 'Yes' : 'No'}`,
    `Requires Admin:\n${payload.requiresAdmin ? 'Yes' : 'No'}`,
    payload.riskLevel ? `Risk Level:\n${payload.riskLevel}` : '',
    payload.riskExplanation ? `Risk Explanation:\n${payload.riskExplanation}` : ''
  ].filter(Boolean).join('\n\n')
}

async function defaultDialogProvider({ kind, payload = {} }) {
  const window = BrowserWindow?.getFocusedWindow?.()
  const isDiagnosisFix = kind === 'diagnosis-fix'
  const detail = kind === 'shell-command'
    ? `Command:\n${payload.command}\n\nCWD:\n${payload.cwd || ''}`
    : isDiagnosisFix
      ? buildDiagnosisDetail(payload)
      : JSON.stringify(payload, null, 2)

  const result = await dialog.showMessageBox(window, {
    type: 'warning',
    title: isDiagnosisFix ? 'Confirm Diagnosis Fix' : 'Confirm Local Action',
    message: isDiagnosisFix ? 'Run this diagnosis fix command?' : `Allow ${kind}?`,
    detail,
    buttons: isDiagnosisFix ? ['Yes', 'No'] : ['Allow', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    checkboxLabel: kind === 'shell-command' ? 'Do not ask again for this command in this session' : undefined
  })

  return {
    allowed: result.response === 0,
    remember: Boolean(result.checkboxChecked)
  }
}

function setDialogProvider(fn) {
  dialogProvider = fn || defaultDialogProvider
  sessionAllowed.clear()
}

function clearConfirmCache() {
  sessionAllowed.clear()
}

async function requestConfirm({ kind, payload = {}, username }) {
  const config = username ? store.getUserConfig(username) : store.getConfig()
  const cacheEnabled = config.session_confirm_cache_enabled !== false
  const userKey = String(username || 'guest').trim() || 'guest'
  const key = kind === 'shell-command' ? `${userKey}:${shellCommandKey(payload.command)}` : ''

  if (kind !== 'diagnosis-fix' && cacheEnabled && key && sessionAllowed.has(key)) return true

  const response = await dialogProvider({ kind, payload })
  const allowed = typeof response === 'boolean' ? response : Boolean(response?.allowed)
  const remember = kind !== 'diagnosis-fix' && typeof response === 'object' && Boolean(response.remember)
  if (allowed && remember && cacheEnabled && key) sessionAllowed.add(key)
  return allowed
}

module.exports = {
  requestConfirm,
  setDialogProvider,
  clearConfirmCache,
  shellCommandKey,
  buildDiagnosisDetail
}
