const { store } = require('../../store')
const { SQLiteIndexStore } = require('./sqliteIndexStore')

const ALLOWED_EMBEDDING_TYPES = ['markdown', 'config', 'entry', 'profile']
const MAX_EMBEDDING_SNIPPETS = 32

function getFetch() {
  if (typeof fetch === 'function') return fetch
  const error = new Error('Fetch is not available in this runtime.')
  error.code = 'EMBEDDING_RUNTIME'
  throw error
}

function buildProfileSnippet(profile = {}) {
  const lines = [
    `language: ${profile.language || ''}`,
    `frameworks: ${(profile.frameworks || []).join(', ')}`,
    `packageManagers: ${(profile.packageManagers || []).join(', ')}`,
    `startCommands: ${(profile.startCommands || []).map((item) => item.command).join(', ')}`,
    `testCommands: ${(profile.testCommands || []).map((item) => item.command).join(', ')}`
  ].filter((line) => !line.endsWith(': '))
  if (lines.length === 0) return null
  return {
    id: `profile_${profile.projectId}`,
    relativePath: '__project_profile__',
    chunkType: 'profile',
    text: lines.join('\n')
  }
}

function isEntryChunk(chunk, profile = {}) {
  return (profile.entryFiles || []).some((entry) => entry.path === chunk.relativePath)
}

function cosineSimilarity(left = [], right = []) {
  const length = Math.min(left.length, right.length)
  if (length === 0) return 0
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < length; index += 1) {
    const leftValue = Number(left[index]) || 0
    const rightValue = Number(right[index]) || 0
    dot += leftValue * rightValue
    leftNorm += leftValue * leftValue
    rightNorm += rightValue * rightValue
  }
  if (!leftNorm || !rightNorm) return 0
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

async function requestEmbeddings({ fetchRef, config, input }) {
  const response = await fetchRef(`${config.baseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.embeddingModel,
      input
    })
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const error = new Error(`Embedding request failed: ${response.status} ${text.slice(0, 160)}`)
    error.code = 'EMBEDDING_REQUEST_FAILED'
    throw error
  }
  const data = await response.json()
  return data.data || []
}

class OptionalEmbeddingService {
  constructor(options = {}) {
    this.store = options.storeRef || store
    this.indexStore = options.indexStore || new SQLiteIndexStore(options)
    this.fetch = options.fetch || null
    this.now = options.now || (() => new Date())
  }

  async eligibleSnippets(projectId, profile = {}) {
    const chunks = await this.indexStore.listProjectChunks(projectId)
    const snippets = chunks
      .filter((chunk) => (
        chunk.chunkType === 'markdown' ||
        chunk.chunkType === 'config' ||
        isEntryChunk(chunk, profile)
      ))
      .map((chunk) => ({
        id: chunk.id,
        relativePath: chunk.relativePath,
        chunkType: isEntryChunk(chunk, profile) ? 'entry' : chunk.chunkType,
        text: String(chunk.text || '').slice(0, 4000)
      }))

    const profileSnippet = buildProfileSnippet(profile)
    if (profileSnippet) snippets.unshift(profileSnippet)
    return snippets.slice(0, MAX_EMBEDDING_SNIPPETS)
  }

  async refresh({ username, project, profile, settings }) {
    const snippets = await this.eligibleSnippets(project.id, profile)
    if (!settings?.embeddingEnabled) {
      return {
        projectId: project.id,
        status: 'disabled',
        eligibleCount: snippets.length,
        allowedTypes: ALLOWED_EMBEDDING_TYPES,
        embeddingCount: 0,
        message: 'Embedding is disabled for this project.'
      }
    }

    const config = this.store.getUserConfig(username)
    if (!config.apiKey || !config.embeddingModel) {
      return {
        projectId: project.id,
        status: 'unavailable',
        eligibleCount: snippets.length,
        allowedTypes: ALLOWED_EMBEDDING_TYPES,
        embeddingCount: 0,
        message: 'Configure an API key and embedding model before generating embeddings.'
      }
    }

    const fetchRef = this.fetch || getFetch()
    const data = await requestEmbeddings({
      fetchRef,
      config,
      input: snippets.map((item) => item.text)
    })
    const embeddedAt = this.now().toISOString()
    const embeddings = data.map((item, index) => ({
      chunkId: snippets[index]?.id,
      relativePath: snippets[index]?.relativePath,
      embeddingModel: config.embeddingModel,
      vector: item.embedding || [],
      embeddedAt
    })).filter((item) => item.chunkId && Array.isArray(item.vector))

    const stats = await this.indexStore.replaceEmbeddings(project.id, embeddings)
    return {
      projectId: project.id,
      status: 'embedded',
      eligibleCount: snippets.length,
      allowedTypes: ALLOWED_EMBEDDING_TYPES,
      ...stats
    }
  }

  async search({ username, project, profile, settings, query, limit = 3 } = {}) {
    const text = String(query || '').trim()
    if (!text || !settings?.embeddingEnabled) return { query, results: [], status: 'disabled' }

    const config = this.store.getUserConfig(username)
    if (!config.apiKey || !config.embeddingModel) {
      return { query, results: [], status: 'unavailable' }
    }

    const embeddings = (await this.indexStore.listEmbeddings(project.id))
      .filter((item) => item.embeddingModel === config.embeddingModel && Array.isArray(item.vector))
    if (embeddings.length === 0) return { query, results: [], status: 'pending' }

    const fetchRef = this.fetch || getFetch()
    const data = await requestEmbeddings({ fetchRef, config, input: [text] })
    const queryVector = data[0]?.embedding || []
    if (!Array.isArray(queryVector) || queryVector.length === 0) return { query, results: [], status: 'empty' }

    const snippets = await this.eligibleSnippets(project.id, profile)
    const snippetMap = new Map(snippets.map((item) => [item.id, item]))
    const chunkMap = new Map((await this.indexStore.listProjectChunks(project.id)).map((chunk) => [chunk.id, chunk]))

    const results = embeddings
      .map((item) => {
        const snippet = snippetMap.get(item.chunkId)
        const chunk = chunkMap.get(item.chunkId)
        const score = cosineSimilarity(queryVector, item.vector)
        return {
          path: snippet?.relativePath || chunk?.relativePath || item.relativePath,
          lineStart: chunk?.lineStart || 1,
          lineEnd: chunk?.lineEnd || chunk?.lineStart || 1,
          chunkType: snippet?.chunkType || chunk?.chunkType || 'profile',
          language: chunk?.language || '',
          score,
          reason: `Embedding similarity ${score.toFixed(3)}`,
          textPreview: String(snippet?.text || chunk?.textPreview || chunk?.text || '').slice(0, 240),
          text: snippet?.text || chunk?.text || ''
        }
      })
      .filter((item) => item.path && item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, Number(limit) || 3)

    return { query, results, status: 'searched' }
  }

  async status({ project, profile, settings }) {
    const snippets = await this.eligibleSnippets(project.id, profile)
    const stats = await this.indexStore.getEmbeddingStats(project.id)
    return {
      projectId: project.id,
      status: settings?.embeddingEnabled ? (stats.embeddingCount > 0 ? 'embedded' : 'pending') : 'disabled',
      eligibleCount: snippets.length,
      allowedTypes: ALLOWED_EMBEDDING_TYPES,
      ...stats
    }
  }
}

module.exports = {
  OptionalEmbeddingService,
  ALLOWED_EMBEDDING_TYPES,
  buildProfileSnippet,
  cosineSimilarity
}
