const { execFile } = require('child_process')

function escapePowerShell(value = '') {
  return String(value || '').replace(/'/g, "''")
}

class UiaCollector {
  constructor(options = {}) {
    this.execFile = options.execFile || execFile
    this.timeoutMs = Number(options.timeoutMs) || 1500
    this.platform = options.platform || process.platform
  }

  collect(target = {}) {
    if (this.platform !== 'win32') {
      return Promise.resolve({
        ok: false,
        source: 'uia',
        error: { code: 'UIA_UNSUPPORTED_PLATFORM', message: 'UIA is supported on Windows only.' }
      })
    }

    const title = escapePowerShell(target.title || '')
    const script = `
      Add-Type -AssemblyName UIAutomationClient
      $root = [Windows.Automation.AutomationElement]::RootElement
      $windows = $root.FindAll([Windows.Automation.TreeScope]::Children, [Windows.Automation.Condition]::TrueCondition)
      $match = $null
      for ($i = 0; $i -lt $windows.Count; $i++) {
        $candidate = $windows.Item($i)
        if ($candidate.Current.Name -like '*${title}*') { $match = $candidate; break }
      }
      if (-not $match) { Write-Error 'UIA_TEXT_UNAVAILABLE'; exit 1 }
      $parts = New-Object System.Collections.Generic.List[string]
      if ($match.Current.Name) { $parts.Add($match.Current.Name) }
      $nodes = $match.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
      for ($i = 0; $i -lt $nodes.Count; $i++) {
        try {
          $node = $nodes.Item($i)
          $name = $node.Current.Name
          if ($name -and $name.Trim().Length -gt 0) { $parts.Add($name.Trim()) }
        } catch {}
      }
      $text = (($parts | Select-Object -Unique | Select-Object -First 300) -join "\`n")
      if (-not $text) { Write-Error 'UIA_TEXT_UNAVAILABLE'; exit 1 }
      if ($text.Length -gt 8000) { $text = $text.Substring(0, 8000) }
      Write-Output $text
    `

    return new Promise((resolve) => {
      this.execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', script], {
        timeout: this.timeoutMs,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }, (error, stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            source: 'uia',
            error: {
              code: error.killed ? 'UIA_TIMEOUT' : 'UIA_TEXT_UNAVAILABLE',
              message: stderr?.trim() || error.message
            }
          })
          return
        }

        const text = String(stdout || '').trim()
        if (!text) {
          resolve({
            ok: false,
            source: 'uia',
            error: { code: 'UIA_TEXT_UNAVAILABLE', message: 'Window text is unavailable.' }
          })
          return
        }

        resolve({
          ok: true,
          source: 'uia',
          text,
          confidence: 0.9,
          capturedAt: new Date().toISOString()
        })
      })
    })
  }
}

module.exports = { UiaCollector }
