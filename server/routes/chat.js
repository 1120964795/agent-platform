import express from 'express'
import { chatStream, DeepSeekError } from '../services/deepseek.js'

const router = express.Router()

const SYSTEM_PROMPT = `你是 AgentDev Lite，一个学生学习助手。用中文简洁专业地回答问题。涉及代码时给可运行示例。`

router.post('/', async (req, res) => {
  const { messages = [] } = req.body || {}

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  try {
    const fullMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages
    ]
    for await (const delta of chatStream({ messages: fullMessages })) {
      send({ delta })
    }
    send({ done: true })
  } catch (e) {
    const payload = e instanceof DeepSeekError
      ? { error: { code: e.code, message: e.message } }
      : { error: { code: 'INTERNAL', message: e.message || '未知错误' } }
    send(payload)
  } finally {
    res.end()
  }
})

export default router
