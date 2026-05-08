const { store } = require('../../store')
const { SQLiteIndexStore } = require('./sqliteIndexStore')

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'do',
  'does',
  'for',
  'how',
  'in',
  'is',
  'of',
  'on',
  'or',
  'project',
  'that',
  'the',
  'this',
  'to',
  'was',
  'were',
  'what',
  'where',
  'which',
  'why',
  'with'
])

function tokenize(value) {
  const text = String(value || '').toLowerCase()
  const latin = text.match(/[a-z0-9_./:-]+/g) || []
  const chinese = text.match(/[\u4e00-\u9fff]{2,}/g) || []
  return [...new Set([...latin, ...chinese].filter((item) => item.length > 1 && !STOPWORDS.has(item)))]
}

function scoreChunk(chunk, terms) {
  const text = String(chunk.text || '').toLowerCase()
  const path = String(chunk.relativePath || '').toLowerCase()
  let score = 0
  const matched = []

  for (const term of terms) {
    if (path.includes(term)) {
      score += 4
      matched.push(term)
    }
    if (text.includes(term)) {
      score += 2
      matched.push(term)
    }
  }

  if (terms.length > 0 && matched.length === terms.length) score += 3
  return { score, matched: [...new Set(matched)] }
}

class FtsSearchService {
  constructor(options = {}) {
    this.store = options.storeRef || store
    this.indexStore = options.indexStore || new SQLiteIndexStore(options)
  }

  async search(projectId, query, filters = {}) {
    const terms = tokenize(query)
    if (terms.length === 0) return { query, results: [] }

    try {
      const sqliteResults = await this.indexStore.search(projectId, query, filters)
      if (sqliteResults.length > 0) return { query, results: sqliteResults }
    } catch {
      // Fall back to JSON-backed scoring below.
    }

    let chunks = this.store.listProjectChunks(projectId)
    if (filters.path) chunks = chunks.filter((chunk) => String(chunk.relativePath || '').includes(filters.path))
    if (filters.chunkType) chunks = chunks.filter((chunk) => chunk.chunkType === filters.chunkType)
    if (filters.language) chunks = chunks.filter((chunk) => chunk.language === filters.language)

    const results = chunks
      .map((chunk) => {
        const { score, matched } = scoreChunk(chunk, terms)
        return {
          path: chunk.relativePath,
          lineStart: chunk.lineStart,
          lineEnd: chunk.lineEnd,
          chunkType: chunk.chunkType,
          language: chunk.language,
          score,
          reason: matched.length ? `Matched ${matched.join(', ')}` : '',
          textPreview: chunk.textPreview || String(chunk.text || '').slice(0, 240),
          text: chunk.text
        }
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
      .slice(0, Number(filters.limit) || 8)

    return { query, results }
  }
}

module.exports = {
  FtsSearchService,
  STOPWORDS,
  tokenize,
  scoreChunk
}
