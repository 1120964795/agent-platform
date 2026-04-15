import express from 'express'
import { chatStream, DeepSeekError } from '../services/deepseek.js'
import { readFileAsText } from '../services/fileReader.js'
import { store } from '../store.js'

const router = express.Router()

const MAX_CONTEXT_FILES = 3
const MAX_CHARS_PER_FILE = 12000
const LOCAL_PATH_WITH_EXT_RE = /((?:[A-Za-z]:|\\\\)[\\/][^\r\n"'<>|?*]+?\.(?:pdf|docx|txt|md|csv|json|js|jsx|ts|tsx|py|java|c|cpp|h|hpp|html|css|log))/gi

const BASE_PROMPT = '你是 AgentDev Lite，一个学生学习助手。用中文简洁专业地回答问题。涉及代码时给可运行示例。'

const FULL_PERMISSION_PROMPT = `你是 AgentDev Lite，一个学生学习助手。用中文简洁专业地回答问题。涉及代码时给可运行示例。

当前已开启【全权限模式】，你拥有以下文件操作能力：
- 用户可以通过 /word 命令生成 Word 文档，支持引用本地文件作为参考：/word "文件路径" 指令
- 用户可以通过 /ppt 命令生成 PPT 演示文稿，同样支持引用本地文件：/ppt "文件路径" 指令
- 用户可以点击输入框左侧的 📎 按钮选择本地文件
- 用户可以在右侧面板的"文件"标签页浏览本地文件系统
- 生成的文件保存在本地，可以直接打开

当用户询问文件相关的问题时，主动引导他们使用这些功能。例如：
- "你可以用 /word 命令来生成文档，如果需要参考某个文件，点击 📎 按钮选择它"
- "你可以在右侧面板的'文件'标签页浏览你的本地文件"
- "试试 /ppt 帮我做个演示 来快速生成 PPT"`

function isLocalPath(value) {
  return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value)
}

function addUniquePath(paths, value) {
  const trimmed = value?.trim()
  if (!trimmed || !isLocalPath(trimmed)) return
  if (!paths.some(p => p.toLowerCase() === trimmed.toLowerCase())) {
    paths.push(trimmed)
  }
}

function extractLocalPaths(text = '') {
  const paths = []
  const quoteRe = /["“]([^"”]+)["”]|['‘]([^'’]+)['’]/g
  let match

  while ((match = quoteRe.exec(text))) {
    addUniquePath(paths, match[1] || match[2])
  }

  while ((match = LOCAL_PATH_WITH_EXT_RE.exec(text))) {
    addUniquePath(paths, match[1])
  }

  return paths.slice(0, MAX_CONTEXT_FILES)
}

async function buildLocalFileContext(messages) {
  const latestUserMessage = [...messages].reverse().find(m => m?.role === 'user' && typeof m.content === 'string')
  const filePaths = extractLocalPaths(latestUserMessage?.content || '')
  if (filePaths.length === 0) return ''

  const sections = []
  for (const filePath of filePaths) {
    try {
      const content = await readFileAsText(filePath)
      const trimmed = content.trim()
      sections.push([
        `文件: ${filePath}`,
        trimmed
          ? trimmed.slice(0, MAX_CHARS_PER_FILE)
          : '[文件已读取，但没有提取到可用文本。]'
      ].join('\n'))
    } catch (e) {
      sections.push(`文件: ${filePath}\n[读取失败: ${e.message || '未知错误'}]`)
    }
  }

  return `用户本次消息引用了本地文件。以下内容由应用在全权限模式下读取。
请直接基于这些内容回答；除非读取失败，不要说你无法访问本地文件。

${sections.map(section => `---\n${section}`).join('\n\n')}
---`
}

router.post('/', async (req, res) => {
  const { messages = [] } = req.body || {}

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  try {
    const config = store.getConfig()
    const systemPrompt = config.permissionMode === 'full' ? FULL_PERMISSION_PROMPT : BASE_PROMPT
    const localFileContext = config.permissionMode === 'full'
      ? await buildLocalFileContext(messages)
      : ''

    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...(localFileContext ? [{ role: 'system', content: localFileContext }] : []),
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
