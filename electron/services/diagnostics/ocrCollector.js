const crypto = require('crypto')

function createOptionalWorkerFactory() {
  try {
    const { createWorker } = require('tesseract.js')
    return createWorker
  } catch {
    return null
  }
}

class OcrCollector {
  constructor(options = {}) {
    this.desktopCapturer = options.desktopCapturer
    this.screen = options.screen
    this.nativeImage = options.nativeImage
    this.createWorker = Object.prototype.hasOwnProperty.call(options, 'createWorker')
      ? options.createWorker
      : createOptionalWorkerFactory()
    this.worker = null
    this.lastImageHash = ''
    this.busy = false
  }

  async ensureWorker() {
    if (!this.createWorker) return null
    if (this.worker) return this.worker
    this.worker = await this.createWorker('eng')
    return this.worker
  }

  async getWindowImage(target) {
    const sources = await this.desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 1600, height: 1200 }
    })
    const source = sources.find((item) => item.id === target.id)
    return source?.thumbnail || null
  }

  async getRegionImage(target) {
    const display = this.screen.getAllDisplays().find((item) => String(item.id) === String(target.displayId))
    if (!display) return null
    const sources = await this.desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(display.size.width * (display.scaleFactor || 1)),
        height: Math.round(display.size.height * (display.scaleFactor || 1))
      }
    })
    const source = sources.find((item) => String(item.display_id) === String(target.displayId))
    if (!source?.thumbnail) return null

    const image = this.nativeImage.createFromBuffer(source.thumbnail.toPNG())
    const imageSize = image.getSize()
    const scaleX = imageSize.width / display.size.width
    const scaleY = imageSize.height / display.size.height
    return image.crop({
      x: Math.round((target.x - display.bounds.x) * scaleX),
      y: Math.round((target.y - display.bounds.y) * scaleY),
      width: Math.round(target.width * scaleX),
      height: Math.round(target.height * scaleY)
    })
  }

  async collect(target = {}) {
    if (this.busy) {
      return {
        ok: false,
        source: 'ocr',
        error: { code: 'OCR_BUSY', message: 'OCR is still running.' }
      }
    }

    const worker = await this.ensureWorker()
    if (!worker) {
      return {
        ok: false,
        source: 'ocr',
        error: { code: 'OCR_UNAVAILABLE', message: 'tesseract.js is not installed.' }
      }
    }

    const image = target.type === 'region'
      ? await this.getRegionImage(target)
      : await this.getWindowImage(target)

    if (!image || image.isEmpty?.()) {
      return {
        ok: false,
        source: 'ocr',
        error: { code: 'OCR_CAPTURE_FAILED', message: 'Unable to capture target image.' }
      }
    }

    const png = image.toPNG()
    const hash = crypto.createHash('sha1').update(png).digest('hex')
    if (hash === this.lastImageHash) {
      return {
        ok: false,
        source: 'ocr',
        error: { code: 'OCR_UNCHANGED', message: 'Captured image is unchanged.' }
      }
    }

    this.busy = true
    try {
      const result = await worker.recognize(png)
      const text = String(result?.data?.text || '').trim()
      this.lastImageHash = hash
      if (!text) {
        return {
          ok: false,
          source: 'ocr',
          error: { code: 'OCR_TEXT_UNAVAILABLE', message: 'OCR did not return text.' }
        }
      }
      return {
        ok: true,
        source: 'ocr',
        text,
        confidence: Number(result?.data?.confidence || 0) / 100,
        capturedAt: new Date().toISOString()
      }
    } catch (error) {
      return {
        ok: false,
        source: 'ocr',
        error: { code: 'OCR_FAILED', message: error.message || 'OCR failed.' }
      }
    } finally {
      this.busy = false
    }
  }

  async dispose() {
    if (this.worker?.terminate) {
      await this.worker.terminate()
    }
    this.worker = null
  }
}

module.exports = { OcrCollector }
