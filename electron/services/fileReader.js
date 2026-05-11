const mammoth = require('mammoth')
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')

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
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(`无法读取 PDF。请安装 pdftotext.exe 或设置 PDFTOTEXT_PATH。${lastError?.message || ''}`)
}

async function readFileAsText(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在：${filePath}`)
  }

  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value
  }
  if (ext === '.pdf') {
    return readPdfAsText(filePath)
  }
  return fs.readFileSync(filePath, 'utf-8')
}

module.exports = { readFileAsText, readPdfAsText }
