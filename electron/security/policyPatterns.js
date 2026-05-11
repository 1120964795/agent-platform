// Extracted regex constants from actionPolicy.js, plus new v4 security patterns.
// actionPolicy.js re-exports these for backward compatibility.

const LOW_SHELL_PREFIXES = [
  'pwd', 'cd', 'dir', 'ls', 'type', 'cat', 'where', 'which', 'echo',
  'git status', 'git diff', 'git log', 'npm --version', 'node --version',
  'python --version', 'pip --version'
]

const INSTALL_PATTERN = /\b(npm|pnpm|yarn|pip|pip3|uv|winget|choco|scoop)\s+(install|add|i)\b|\bsetup\.exe\b|\bmsiexec\b/i
const DELETE_PATTERN = /\b(rm|del|erase|rd|rmdir|remove-item)\b/i
const FORMAT_PATTERN = /\b(format|diskpart|mkfs|dd)\b/i
const SECURITY_DISABLE_PATTERN = /\b(Set-MpPreference|DisableRealtimeMonitoring|Add-MpPreference|netsh\s+advfirewall|sc\s+stop|Stop-Service)\b/i
const CREDENTIAL_PATTERN = /\b(api[_-]?key|secret|token|password|passwd|credential|authorization|bearer)\b/i
const EXFIL_PATTERN = /\b(curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod)\b/i
const HIDDEN_PATTERN = /\b(-WindowStyle\s+Hidden|Start-Process\b.*\bHidden\b|nohup\b|setsid\b|schtasks\s+\/create|Start-Job\b)\b/i
const UNBOUNDED_DELETE_PATTERN = /\b(rm\s+(-[a-z]*r[a-z]*f|-rf|-fr)\s+([\\/]|\.|\*)|del\s+\/s\s+\/q\s+([A-Z]:\\|\\|\*)|remove-item\b.*\b-recurse\b.*\b-force\b.*([A-Z]:\\|\\|\*))\b/i

// --- New v4 patterns ---

const URL_PROTOCOLS_BLOCKED = /^(file|ftp|javascript|vbscript|data):/i

const RFC1918_HOST = /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/

const PAYMENT_INTENT = /\b(send|pay|donate|transfer|remit)\s+\$?\d+[,\d]*\b|\$\d+[,\d]*\s+(to|via|through)\b|\b(payment|alipay|wechat\s*pay|paypal)\b/i

const ACCOUNT_DESTRUCTION = /\b(delete|destroy|deactivate|remove|unregister|wipe)\s+(\w+\s+){0,2}(accounts?|user\s+accounts?|admin\s+accounts?|user\s+profiles?|profiles?|devices?)\b/i

const PASSWORD_CHANGE = /\b(change|reset|set\s+new|modify|update)\s+(\w+\s+)?(passwords?|credentials|passwd|logins?)\s+(for|of|to)\b/i

const MONEY_TRANSFER = /\b(wire\s+transfer|remit|withdraw|deposit)\b|\bsend\s+money\s+to\b|\brouting\s+number\b/i

const PS_INVOKE_EXPRESSION = /\b(Invoke-Expression|iex)\b/i

const CODE_EXFIL_PATTERN = /\b(requests|http\.client|urllib|fetch|XMLHttpRequest|axios|superagent|got|node-fetch|httpx|aiohttp)\b/i

module.exports = {
  LOW_SHELL_PREFIXES,
  INSTALL_PATTERN,
  DELETE_PATTERN,
  FORMAT_PATTERN,
  SECURITY_DISABLE_PATTERN,
  CREDENTIAL_PATTERN,
  EXFIL_PATTERN,
  HIDDEN_PATTERN,
  UNBOUNDED_DELETE_PATTERN,
  URL_PROTOCOLS_BLOCKED,
  RFC1918_HOST,
  PAYMENT_INTENT,
  ACCOUNT_DESTRUCTION,
  PASSWORD_CHANGE,
  MONEY_TRANSFER,
  PS_INVOKE_EXPRESSION,
  CODE_EXFIL_PATTERN
}
