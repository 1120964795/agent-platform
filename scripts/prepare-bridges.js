const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const BRIDGES = ['uitars-bridge']
const REPO_ROOT = path.join(__dirname, '..')
const SRC_ROOT = path.join(REPO_ROOT, 'server')
// Stage OUTSIDE the workspace tree so npm doesn't walk up to the repo's
// package.json (which would trigger the root's electron-rebuild postinstall
// and ignore --no-workspaces). After deps install in temp, we copy the
// finished sidecar back to <repo>/dist-bridges/ for electron-builder to ship.
const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-bridges-'))
const STAGING_ROOT = path.join(REPO_ROOT, 'dist-bridges')

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}

function copyDir(src, dst, ignore = []) {
  fs.mkdirSync(dst, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (ignore.includes(entry.name)) continue
    const s = path.join(src, entry.name)
    const d = path.join(dst, entry.name)
    if (entry.isDirectory()) copyDir(s, d, ignore)
    else if (entry.isFile()) fs.copyFileSync(s, d)
  }
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) {
    process.stderr.write(`\n[prepare-bridges] ${cmd} ${args.join(' ')} failed in ${cwd}\n`)
    process.exit(r.status || 1)
  }
}

rmrf(STAGING_ROOT)
fs.mkdirSync(STAGING_ROOT, { recursive: true })

for (const name of BRIDGES) {
  const src = path.join(SRC_ROOT, name)
  const tempDst = path.join(TEMP_ROOT, name)
  const finalDst = path.join(STAGING_ROOT, name)
  if (!fs.existsSync(src)) {
    process.stderr.write(`[prepare-bridges] missing source ${src}\n`)
    process.exit(1)
  }
  copyDir(src, tempDst, ['__tests__', 'node_modules'])
  process.stdout.write(`[prepare-bridges] installing deps for ${name} in ${tempDst}\n`)
  run('npm', ['install', '--omit=dev', '--no-package-lock'], tempDst)
  process.stdout.write(`[prepare-bridges] copying ${name} into ${finalDst}\n`)
  copyDir(tempDst, finalDst)
}

// Python bridge: copy source + install Python deps
const pySrc = path.join(SRC_ROOT, 'browser-use-bridge')
const pyFinal = path.join(STAGING_ROOT, 'browser-use-bridge')
if (fs.existsSync(pySrc)) {
  copyDir(pySrc, pyFinal, ['__tests__', '__pycache__', '.venv', 'venv'])
  // Install Python dependencies if pip is available
  const reqPath = path.join(pyFinal, 'requirements.txt')
  if (fs.existsSync(reqPath)) {
    try {
      const { execSync } = require('child_process')
      execSync(`pip install -r "${reqPath}" --target "${path.join(pyFinal, '.deps')}"`, {
        encoding: 'utf8',
        timeout: 120000,
        stdio: 'pipe'
      })
      console.log('[prepare-bridges] Python deps installed for browser-use-bridge')
    } catch (e) {
      process.stderr.write(`[prepare-bridges] pip install failed — bridge may need manual dep setup\n`)
    }
  }
} else {
  process.stderr.write(`[prepare-bridges] missing Python bridge source: ${pySrc}\n`)
}

rmrf(TEMP_ROOT)
process.stdout.write('[prepare-bridges] done\n')
