import express from 'express'
import { chatJson, DeepSeekError } from '../services/deepseek.js'
import { generateDocx } from '../services/docxGen.js'
import { readFileAsText } from '../services/fileReader.js'
import { store } from '../store.js'

const router = express.Router()

function buildSystemPrompt(referenceContent) {
  let base = `你是 Word 文档助手。根据用户的自然语言指令生成文档内容。
输出纯 JSON:
{"title":"文档标题","sections":[{"heading":"一级标题","content":"正文段落..."}]}
要求:
- content 用普通段落，不要 Markdown 语法
- 段落之间用 \\n\\n 分隔
- 根据用户要求决定字数、风格和章节数量
- 如果用户没指定字数，默认 1500 字左右
- 如果用户没指定章节数，默认 5-8 个 section
- 不要输出 JSON 以外任何文字`

  if (referenceContent) {
    base += `\n\n用户提供了一个参考文件，其内容如下（你可以参考其结构、内容或风格）：\n\n---\n${referenceContent.slice(0, 8000)}\n---`
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
        console.warn('[word] 读取参考文件失败:', e.message)
        // 不阻塞，继续生成
      }
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt(referenceContent) },
      { role: 'user', content: prompt }
    ]

    const json = await chatJson(messages)
    const title = json.title || '未命名文档'
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

    res.json({ ok: true, artifactId: artifact.id, filename, path: filePath, title, preview, sections: json.sections })
  } catch (e) {
    console.error('[word]', e)
    if (e instanceof DeepSeekError) {
      return res.status(502).json({ ok: false, error: { code: e.code, message: e.message } })
    }
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: e.message } })
  }
})

export default router
