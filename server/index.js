import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import path from 'path'
import chatRouter from './routes/chat.js'
import configRouter from './routes/config.js'
import conversationsRouter from './routes/conversations.js'
import wordRouter from './routes/word.js'
import artifactsRouter, { openFileHandler } from './routes/artifacts.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 8787

app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '10mb' }))

app.use('/files', express.static(path.join(__dirname, '..', 'generated')))
app.use('/api/chat', chatRouter)
app.use('/api/config', configRouter)
app.use('/api/conversations', conversationsRouter)
app.use('/api/word', wordRouter)
app.use('/api/artifacts', artifactsRouter)
app.get('/api/open-file', openFileHandler)

app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '0.1.0' })
})

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
})
