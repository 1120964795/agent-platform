import express from 'express'
import { chatJson, DeepSeekError } from '../services/deepseek.js'
import { generatePptx } from '../services/pptxGen.js'
import { readFileAsText } from '../services/fileReader.js'
import { store } from '../store.js'

const router = express.Router()

function buildSystemPrompt(referenceContent) {
  let base = `你是 PPT 助手。根据用户的自然语言指令生成演示文稿内容。
输出纯 JSON:
{"title":"演示标题","slides":[{"title":"页标题","bullets":["要点1","要点2"]}]}
要求:
- 第一页是封面（title 为主题，bullets 为副标题/作者/日期）
- 每页 bullets 3-5 条，每条不超过 25 字
- 最后一页是总结/致谢
- 如果用户没指定页数，默认 8 页
- 不要输出 JSON 以外任何文字`

  if (referenceContent) {
    base += `\n\n用户提供了一个参考文件，其内容如下（你可以参考其内容来生成 PPT）：\n\n---\n${referenceContent.slice(0, 8000)}\n---`
  }

  return base
}

router.post('/', async (req, res) => {
  try {
    const { conversationId, prompt, referencePath } = req.body || {}

    if (!prompt) {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: '缺少 prompt' } })
    }

    let referenceContent = null
    if (referencePath) {
      try {
        referenceContent = await readFileAsText(referencePath)
      } catch (e) {
        console.warn('[ppt] 读取参考文件失败:', e.message)
      }
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt(referenceContent) },
      { role: 'user', content: prompt }
    ]

    const json = await chatJson(messages)
    const title = json.title || '未命名演示'
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

    res.json({ ok: true, artifactId: artifact.id, filename, path: filePath, title, slides: json.slides })
  } catch (e) {
    console.error('[ppt]', e)
    if (e instanceof DeepSeekError) {
      return res.status(502).json({ ok: false, error: { code: e.code, message: e.message } })
    }
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: e.message } })
  }
})

export default router
