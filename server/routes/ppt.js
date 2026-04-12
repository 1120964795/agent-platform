import express from 'express'
import { chatJson, DeepSeekError } from '../services/deepseek.js'
import { generatePptx } from '../services/pptxGen.js'
import { store } from '../store.js'

const router = express.Router()

function buildSystemPrompt({ slideCount }) {
  return `你是 PPT 助手。根据要求输出纯 JSON:
{"slides":[{"title":"页标题","bullets":["要点1","要点2"]}]}
要求:
- 恰好 ${slideCount} 页
- 第一页是封面（title 为主题，bullets 为副标题/作者/日期）
- 每页 bullets 3-5 条，每条不超过 25 字
- 最后一页是总结/致谢
- 不要输出 JSON 以外任何文字`
}

router.post('/', async (req, res) => {
  try {
    const { conversationId, title, topic, slideCount: requestedSlideCount, slides: requestedSlides, style = 'business' } = req.body || {}
    const slideCount = Number(requestedSlideCount ?? requestedSlides ?? 10) || 10
    if (!title || !topic) {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: '缺少 title 或 topic' } })
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt({ slideCount }) },
      { role: 'user', content: `主题: ${title}\n内容方向: ${topic}\n风格: ${style}` }
    ]

    const json = await chatJson(messages)
    if (!Array.isArray(json.slides) || json.slides.length === 0) {
      return res.status(502).json({ ok: false, error: { code: 'LLM_INVALID_JSON', message: '模型输出缺少 slides 数组' } })
    }

    const { filename, path: filePath } = await generatePptx({ title, slides: json.slides })

    const artifact = {
      id: store.genId('art-'),
      type: 'ppt',
      filename,
      path: filePath,
      title,
      conversationId: conversationId || null,
      createdAt: new Date().toISOString()
    }
    store.addArtifact(artifact)

    res.json({ ok: true, artifactId: artifact.id, filename, path: filePath, slides: json.slides })
  } catch (e) {
    console.error('[ppt]', e)
    if (e instanceof DeepSeekError) {
      return res.status(502).json({ ok: false, error: { code: e.code, message: e.message } })
    }
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: e.message } })
  }
})

export default router
