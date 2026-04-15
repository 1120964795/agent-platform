import express from 'express'
import fs from 'fs'
import path from 'path'
import { store } from '../store.js'

const router = express.Router()

// 权限检查中间件
router.use((req, res, next) => {
  const config = store.getConfig()
  if (config.permissionMode !== 'full') {
    return res.status(403).json({
      ok: false,
      error: { code: 'PERMISSION_DENIED', message: '请在设置中开启全权限模式' }
    })
  }
  next()
})

// 列出目录内容
router.get('/list', (req, res) => {
  const dir = req.query.dir
  if (!dir) return res.status(400).json({ ok: false, error: { message: '缺少 dir 参数' } })

  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return res.status(400).json({ ok: false, error: { message: '目录不存在' } })
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const items = entries
      .filter(e => !e.name.startsWith('.'))
      .map(e => {
        const fullPath = path.join(dir, e.name)
        const isDir = e.isDirectory()
        let size = null
        try { if (!isDir) size = fs.statSync(fullPath).size } catch {}
        return {
          name: e.name,
          path: fullPath,
          isDirectory: isDir,
          ext: isDir ? null : path.extname(e.name).toLowerCase(),
          size
        }
      })
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })

    res.json({ ok: true, dir, items })
  } catch (e) {
    res.status(500).json({ ok: false, error: { message: e.message } })
  }
})

// 搜索文件
router.get('/search', (req, res) => {
  const { query, dir, maxDepth = '3' } = req.query
  if (!query || !dir) return res.status(400).json({ ok: false, error: { message: '缺少 query 或 dir' } })

  const results = []
  const pattern = query.toLowerCase()
  const limit = 50

  function walk(currentDir, depth) {
    if (depth > Number(maxDepth) || results.length >= limit) return
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const fullPath = path.join(currentDir, entry.name)
        if (entry.name.toLowerCase().includes(pattern)) {
          results.push({
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            ext: entry.isFile() ? path.extname(entry.name).toLowerCase() : null
          })
        }
        if (entry.isDirectory() && results.length < limit) {
          walk(fullPath, depth + 1)
        }
      }
    } catch {}
  }

  walk(dir, 0)
  res.json({ ok: true, results })
})

export default router
