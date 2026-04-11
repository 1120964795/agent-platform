import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 8787

app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '10mb' }))

// 静态服务 generated 目录（只读）
app.use('/files', express.static(path.join(__dirname, '..', 'generated')))

app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '0.1.0' })
})

app.listen(PORT, () => {
  console.log(`[server] running on http://localhost:${PORT}`)
})
