const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const BRIDGES = ['uitars-bridge', 'desktop-use-bridge']
const REPO_ROOT = path.join(__dirname, '..')
const SRC_ROOT = path.join(REPO_ROOT, 'server')
const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-bridges-'))
const STAGING_ROOT = path.join(REPO_ROOT, 'dist-bridges')

function rmrf(targetPath) {
  if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { recursive: true, force: true })
}

function copyDir(src, dst, ignore = []) {
  fs.mkdirSync(dst, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (ignore.includes(entry.name)) continue
    const sourcePath = path.join(src, entry.name)
    const destPath = path.join(dst, entry.name)
    if (entry.isDirectory()) copyDir(sourcePath, destPath, ignore)
    else if (entry.isFile()) fs.copyFileSync(sourcePath, destPath)
  }
}

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) {
    process.stderr.write(`\n[prepare-bridges] ${cmd} ${args.join(' ')} failed in ${cwd}\n`)
    process.exit(result.status || 1)
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

// Python bridge: copy source. The app installer prepares Python deps in user app data.
const pySrc = path.join(SRC_ROOT, 'browser-use-bridge')
const pyFinal = path.join(STAGING_ROOT, 'browser-use-bridge')
if (fs.existsSync(pySrc)) {
  copyDir(pySrc, pyFinal, ['__tests__', '__pycache__', '.venv', 'venv', '.deps'])
  process.stdout.write('[prepare-bridges] browser-use Python deps will be installed by the app installer runtime setup\n')
} else {
  process.stderr.write(`[prepare-bridges] missing Python bridge source: ${pySrc}\n`)
}

rmrf(TEMP_ROOT)
process.stdout.write('[prepare-bridges] done\n')
