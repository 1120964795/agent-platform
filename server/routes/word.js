import express from 'express'
import { chatJson, DeepSeekError } from '../services/deepseek.js'
import { generateDocx } from '../services/docxGen.js'
import { store } from '../store.js'

const router = express.Router()

const STYLE_HINTS = {
  academic: '严谨学术风格，正式书面语，有数据和论证',
  business: '职场正式风格，结构清晰，结论前置',
  casual: '轻松通俗风格，口语化表达'
}

function buildSystemPrompt({ wordCount, style }) {
  return `你是 Word 文档助手。根据用户要求输出纯 JSON:
{"sections":[{"heading":"一级标题","content":"正文段落..."}]}
要求:
- 至少 ${wordCount} 字（±10%）
- 风格: ${STYLE_HINTS[style] || STYLE_HINTS.academic}
- content 用普通段落，不要 Markdown 语法
- 段落之间用 \\n\\n 分隔
- 5-8 个 section
- 不要输出 JSON 以外任何文字`
}

router.post('/', async (req, res) => {
  try {
    const { conversationId, title, outline, topic, wordCount = 1500, style = 'academic' } = req.body || {}
    const outlineText = outline || topic
    if (!title || !outlineText) {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: '缺少 title 或 outline' } })
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt({ wordCount, style }) },
      { role: 'user', content: `文档标题: ${title}\n\n要求:\n${outlineText}` }
    ]

    const json = await chatJson(messages)
    if (!Array.isArray(json.sections) || json.sections.length === 0) {
      return res.status(502).json({ ok: false, error: { code: 'LLM_INVALID_JSON', message: '模型输出缺少 sections 数组' } })
    }

    const { filename, path: filePath } = await generateDocx({ title, sections: json.sections })

    const artifact = {
      id: store.genId('art-'),
      type: 'word',
      filename,
      path: filePath,
      title,
      conversationId: conversationId || null,
      createdAt: new Date().toISOString()
    }
    store.addArtifact(artifact)

    const preview = json.sections[0]?.content?.slice(0, 200) || ''

    res.json({ ok: true, artifactId: artifact.id, filename, path: filePath, preview, sections: json.sections })
  } catch (e) {
    console.error('[word]', e)
    if (e instanceof DeepSeekError) {
      return res.status(502).json({ ok: false, error: { code: e.code, message: e.message } })
    }
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: e.message } })
  }
})

export default router
