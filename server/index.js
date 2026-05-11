import express from 'express'
import cors from 'cors'
import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import chatRouter from './routes/chat.js'
import configRouter from './routes/config.js'
import conversationsRouter from './routes/conversations.js'
import wordRouter from './routes/word.js'
import pptRouter from './routes/ppt.js'
import artifactsRouter, { openFileHandler } from './routes/artifacts.js'
import filesRouter from './routes/files.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 8787
const generatedDir = process.env.AGENTDEV_GENERATED_DIR || path.join(__dirname, '..', 'generated')

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '10mb' }))

app.use('/files', express.static(generatedDir))
app.use('/api/chat', chatRouter)
app.use('/api/config', configRouter)
app.use('/api/conversations', conversationsRouter)
app.use('/api/word', wordRouter)
app.use('/api/ppt', pptRouter)
app.use('/api/artifacts', artifactsRouter)
app.use('/api/files', filesRouter)
app.get('/api/open-file', openFileHandler)

app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '0.1.0' })
})

// 生产模式：服务前端 dist
const clientDist = process.env.AGENTDEV_CLIENT_DIST
if (clientDist) {
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist))
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/files')) return next()
      res.sendFile(path.join(clientDist, 'index.html'))
    })
  }
}

// 全局错误兜底
app.use((err, req, res, next) => {
  console.error('[error]', err)
  res.status(500).json({
    ok: false,
    error: { code: err.code || 'INTERNAL', message: err.message || '内部错误' }
  })
})

app.listen(PORT, () => {
  console.log(`[server] running on http://localhost:${PORT}`)
  if (process.send) process.send('ready')
})
