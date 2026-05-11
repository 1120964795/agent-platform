import mammoth from 'mammoth'
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const PDFTOTEXT_CANDIDATES = [
  process.env.PDFTOTEXT_PATH,
  'pdftotext.exe',
  'pdftotext',
  'D:\\Labtex\\texlive\\2025\\bin\\windows\\pdftotext.exe',
  'C:\\texlive\\2025\\bin\\windows\\pdftotext.exe'
].filter(Boolean)

async function readPdfAsText(filePath) {
  let lastError = null

  for (const command of PDFTOTEXT_CANDIDATES) {
    try {
      const { stdout } = await execFileAsync(
        command,
        ['-layout', '-nopgbrk', '-enc', 'UTF-8', filePath, '-'],
        { windowsHide: true, maxBuffer: 12 * 1024 * 1024, timeout: 30000 }
      )
      return stdout.trim()
    } catch (e) {
      lastError = e
    }
  }

  throw new Error(
    `无法读取 PDF 文件，请安装 pdftotext.exe 或设置 PDFTOTEXT_PATH。${lastError?.message || ''}`
  )
}

/**
 * 读取文件内容为纯文本，支持 .docx、.pdf 和普通文本文件
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

  if (ext === '.pdf') {
    return readPdfAsText(filePath)
  }

  // 其它按纯文本读
  return fs.readFileSync(filePath, 'utf-8')
}
