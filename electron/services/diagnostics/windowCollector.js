const { spawn } = require('child_process')

const POWERSHELL_TIMEOUT_MS = 8000

function runPowerShell(script, timeoutMs = POWERSHELL_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      resolve('')
      return
    }
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('PowerShell UIA collector timed out'))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf-8') })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf-8') })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0 && stderr.trim()) reject(new Error(stderr.trim()))
      else resolve(stdout)
    })
  })
}

function listWindowsScript() {
  return `
Add-Type -AssemblyName UIAutomationClient
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Window)
$items = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
$out = @()
foreach ($item in $items) {
  $name = $item.Current.Name
  if ([string]::IsNullOrWhiteSpace($name)) { continue }
  $out += [pscustomobject]@{
    id = "uia:" + $item.Current.NativeWindowHandle
    type = "window"
    title = $name
    processId = $item.Current.ProcessId
    nativeWindowHandle = $item.Current.NativeWindowHandle
  }
}
$out | ConvertTo-Json -Depth 3
`
}

function collectWindowTextScript(nativeWindowHandle) {
  const handle = Number(nativeWindowHandle) || 0
  return `
Add-Type -AssemblyName UIAutomationClient
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NativeWindowHandleProperty, ${handle})
$window = $root.FindFirst([System.Windows.Automation.TreeScope]::Subtree, $cond)
if ($null -eq $window) { "" ; exit 0 }
$texts = New-Object System.Collections.Generic.List[string]
function Add-Text($value) {
  if (-not [string]::IsNullOrWhiteSpace($value)) { $script:texts.Add($value.Trim()) | Out-Null }
}
function Visit($element, $depth) {
  if ($null -eq $element -or $depth -gt 5 -or $script:texts.Count -gt 300) { return }
  Add-Text $element.Current.Name
  try {
    $valuePattern = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    Add-Text $valuePattern.Current.Value
  } catch {}
  try {
    $textPattern = $element.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
    Add-Text $textPattern.DocumentRange.GetText(4000)
  } catch {}
  $children = $element.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($child in $children) { Visit $child ($depth + 1) }
}
Visit $window 0
($texts | Select-Object -Unique) -join [Environment]::NewLine
`
}

function collectRegionOcrScript(region = {}) {
  const x = Math.max(0, Number(region.x || 0))
  const y = Math.max(0, Number(region.y || 0))
  const width = Math.max(0, Number(region.width || 0))
  const height = Math.max(0, Number(region.height || 0))
  return `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Storage.FileAccessMode, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType=WindowsRuntime]
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$captureX = ${x}
$captureY = ${y}
$captureWidth = ${width}
$captureHeight = ${height}
if ($captureWidth -le 1 -or $captureHeight -le 1) {
  $captureX = $bounds.X
  $captureY = $bounds.Y
  $captureWidth = $bounds.Width
  $captureHeight = $bounds.Height
}
function Await($operation, $type) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1
  } | Select-Object -First 1
  $task = $method.MakeGenericMethod($type).Invoke($null, @($operation))
  $task.Wait()
  return $task.Result
}
$bitmap = New-Object System.Drawing.Bitmap($captureWidth, $captureHeight)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($captureX, $captureY, 0, 0, $bitmap.Size)
$tmp = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "agentdev-ocr-" + [System.Guid]::NewGuid().ToString() + ".png")
$bitmap.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tmp)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$softwareBitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) { "" ; exit 0 }
$result = Await ($engine.RecognizeAsync($softwareBitmap)) ([Windows.Media.Ocr.OcrResult])
Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
$result.Text
`
}

async function listWindowTargets() {
  const baseTargets = [
    { id: 'manual', type: 'manual', title: '手动粘贴错误文本' },
    { id: 'region:primary', type: 'region', title: '主屏幕 OCR' }
  ]
  if (process.platform !== 'win32') return baseTargets
  const stdout = await runPowerShell(listWindowsScript())
  const text = stdout.trim()
  if (!text) return baseTargets
  const parsed = JSON.parse(text)
  const items = Array.isArray(parsed) ? parsed : [parsed]
  return [
    ...baseTargets,
    ...items.filter((item) => item.nativeWindowHandle).slice(0, 40)
  ]
}

async function collectTargetText(target = {}) {
  if (target.type === 'manual' || !target.type) return ''
  if (target.type === 'region') {
    return runPowerShell(collectRegionOcrScript(target), 15000)
  }
  if (target.type === 'window' && target.nativeWindowHandle) {
    return runPowerShell(collectWindowTextScript(target.nativeWindowHandle))
  }
  return ''
}

module.exports = {
  listWindowTargets,
  collectTargetText,
  runPowerShell
}
