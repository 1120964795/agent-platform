function toThumbnailDataUrl(thumbnail) {
  if (!thumbnail || typeof thumbnail.toPNG !== 'function') return ''
  return `data:image/png;base64,${thumbnail.toPNG().toString('base64')}`
}

class WindowTargetService {
  constructor(options = {}) {
    this.desktopCapturer = options.desktopCapturer
    this.appTitle = options.appTitle || 'AgentDev Lite'
  }

  async listTargets() {
    const sources = await this.desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 900, height: 600 },
      fetchWindowIcons: true
    })

    return sources
      .filter((source) => source.name && !source.name.includes(this.appTitle))
      .map((source) => ({
        type: 'window',
        id: source.id,
        title: source.name || 'Untitled Window',
        appName: source.name || 'Window',
        thumbnail: toThumbnailDataUrl(source.thumbnail)
      }))
  }
}

module.exports = { WindowTargetService, toThumbnailDataUrl }
