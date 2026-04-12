import mammoth from 'mammoth'
import fs from 'fs'
import path from 'path'

/**
 * 读取文件内容为纯文本，支持 .docx 和普通文本文件
 * @param {string} filePath 绝对路径
 * @returns {Promise<string>} 文件文本内容
 */
export async function readFileAsText(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`)
  }

  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value
  }

  // 其它按纯文本读
  return fs.readFileSync(filePath, 'utf-8')
}
