import express from 'express'
import path from 'path'
import { exec } from 'child_process'
import { store } from '../store.js'

const router = express.Router()

router.get('/', (req, res) => {
  res.json({ ok: true, items: store.listArtifacts() })
})

function openGeneratedFile(targetPath, res) {
  if (typeof targetPath !== 'string' || !targetPath) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: '缺少 path' } })
  }
  const resolved = path.resolve(targetPath)
  const generatedRoot = path.resolve(store.GENERATED_DIR)
  if (!(resolved === generatedRoot || resolved.startsWith(generatedRoot + path.sep))) {
    return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: '路径越界' } })
  }

  // Windows 用 start "" "<path>"，注意转义
  const cmd = process.platform === 'win32'
    ? `start "" "${resolved}"`
    : process.platform === 'darwin'
      ? `open "${resolved}"`
      : `xdg-open "${resolved}"`

  exec(cmd, (err) => {
    if (err) {
      console.error('[open-file]', err)
      return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: err.message } })
    }
    res.json({ ok: true })
  })
}

router.post('/open', (req, res) => {
  const { path: targetPath } = req.body || {}
  return openGeneratedFile(targetPath, res)
})

export function openFileHandler(req, res) {
  const { path: targetPath } = req.query || {}
  return openGeneratedFile(targetPath, res)
}

export default router
