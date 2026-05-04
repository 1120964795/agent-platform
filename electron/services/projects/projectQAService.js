const deepseek = require('../deepseek')
const { store } = require('../../store')
const { FtsSearchService } = require('./ftsSearchService')
const { OptionalEmbeddingService } = require('./optionalEmbeddingService')
const { PatchDraftService } = require('./patchDraftService')

function includesAny(text, words) {
  const value = String(text || '').toLowerCase()
  return words.some((word) => value.includes(word.toLowerCase()))
}

function citationFromCommand(command, chunkType = 'config') {
  return {
    path: command.sourcePath,
    lineStart: command.lineStart,
    lineEnd: command.lineEnd,
    chunkType,
    reason: `Source for ${command.command}`
  }
}

function citationFromSource(source) {
  return {
    path: source.path,
    lineStart: source.lineStart,
    lineEnd: source.lineEnd,
    chunkType: source.chunkType,
    reason: source.reason
  }
}

function citationFromSearch(result) {
  return {
    path: result.path,
    lineStart: result.lineStart,
    lineEnd: result.lineEnd,
    chunkType: result.chunkType,
    reason: result.reason
  }
}

function trimEvidenceText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 800)
}

function buildProfileSummary(profile = {}) {
  return {
    language: profile.language || '',
    frameworks: profile.frameworks || [],
    packageManagers: profile.packageManagers || [],
    dependencyFiles: (profile.dependencyFiles || []).map((item) => item.path),
    entryFiles: (profile.entryFiles || []).map((item) => item.path),
    startCommands: (profile.startCommands || []).map((item) => item.command),
    testCommands: (profile.testCommands || []).map((item) => item.command)
  }
}

function mergeEvidenceResults(primaryResults = [], semanticResults = [], limit = 5) {
  const seen = new Set()
  const merged = []
  const ordered = []
  const maxLength = Math.max(primaryResults.length, semanticResults.length)
  for (let index = 0; index < maxLength; index += 1) {
    if (primaryResults[index]) ordered.push(primaryResults[index])
    if (semanticResults[index]) ordered.push(semanticResults[index])
  }

  for (const result of ordered) {
    const key = `${result.path}:${result.lineStart}:${result.lineEnd}:${result.chunkType}`
    if (!result.path) continue
    if (seen.has(key)) {
      const existing = merged.find((item) => `${item.path}:${item.lineStart}:${item.lineEnd}:${item.chunkType}` === key)
      if (existing && result.reason && !String(existing.reason || '').includes(result.reason)) {
        existing.reason = [existing.reason, result.reason].filter(Boolean).join('; ')
      }
      continue
    }
    seen.add(key)
    merged.push(result)
    if (merged.length >= limit) break
  }
  return merged
}

function createProjectQAModelClient(deepseekClient, storeRef) {
  return {
    async answerProjectQuestion({ username = 'guest', question, profile, sources }) {
      const config = storeRef.getUserConfig(username)
      if (!config.apiKey) {
        const error = new Error('Model is unavailable.')
        error.code = 'MODEL_UNAVAILABLE'
        throw error
      }

      return deepseekClient.chat({
        config,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: [
              'You answer project questions in concise Chinese.',
              'Use only the provided project profile and cited source snippets.',
              'If the sources do not support an answer, say that no reliable evidence was found.',
              'Do not cite files or facts that are not present in the provided sources.'
            ].join(' ')
          },
          {
            role: 'user',
            content: JSON.stringify({
              question,
              profile: buildProfileSummary(profile),
              sources: sources.map((source) => ({
                path: source.path,
                lineStart: source.lineStart,
                lineEnd: source.lineEnd,
                chunkType: source.chunkType,
                reason: source.reason,
                text: trimEvidenceText(source.text || source.textPreview)
              }))
            }, null, 2)
          }
        ]
      })
    }
  }
}

class ProjectQAService {
  constructor(options = {}) {
    this.store = options.storeRef || store
    this.searchService = options.searchService || new FtsSearchService(options)
    this.embeddingService = options.embeddingService || new OptionalEmbeddingService(options)
    this.patchDraftService = options.patchDraftService || new PatchDraftService(options)
    this.modelClient = options.modelClient || createProjectQAModelClient(options.deepseekClient || deepseek, this.store)
  }

  async answer({ username = 'guest', project, profile, settings, question }) {
    const text = String(question || '').trim()
    if (!text) {
      return {
        answer: 'No question was provided.',
        confidence: 'low',
        citations: [],
        suggestedCommands: [],
        patchDrafts: []
      }
    }

    const normalized = text.toLowerCase()
    const profileValue = profile || {}

    if (includesAny(normalized, ['启动', '运行', 'start', 'run', 'dev server', '怎么启动', '如何启动'])) {
      const command = profileValue.startCommands?.[0]
      if (command) {
        return {
          answer: `这个项目最可能用 \`${command.command}\` 启动。`,
          confidence: command.confidence >= 0.75 ? 'high' : 'medium',
          citations: [citationFromCommand(command)],
          suggestedCommands: [{
            command: command.command,
            cwd: project.rootPath,
            sourcePath: command.sourcePath,
            lineStart: command.lineStart,
            riskLevel: 'low'
          }],
          patchDrafts: []
        }
      }
    }

    if (includesAny(normalized, ['测试', 'test', 'pytest', 'vitest', '单测'])) {
      const command = profileValue.testCommands?.[0]
      if (command) {
        return {
          answer: `这个项目的测试命令最可能是 \`${command.command}\`。`,
          confidence: command.confidence >= 0.75 ? 'high' : 'medium',
          citations: [citationFromCommand(command)],
          suggestedCommands: [{
            command: command.command,
            cwd: project.rootPath,
            sourcePath: command.sourcePath,
            lineStart: command.lineStart,
            riskLevel: 'low'
          }],
          patchDrafts: []
        }
      }
    }

    if (includesAny(normalized, ['依赖', '包管理', 'package manager', 'npm', 'pnpm', 'pip', 'maven', 'gradle'])) {
      const source = profileValue.dependencyFiles?.[0] || profileValue.evidence?.[0]
      if (source) {
        const managers = (profileValue.packageManagers || []).join(', ') || '不确定'
        const deps = (profileValue.dependencyFiles || []).map((item) => item.path).join(', ')
        return {
          answer: `这个项目的包管理器线索是：${managers}。依赖文件：${deps || source.path}。`,
          confidence: profileValue.packageManagers?.length ? 'high' : 'medium',
          citations: [citationFromSource(source)],
          suggestedCommands: [],
          patchDrafts: []
        }
      }
    }

    const search = await this.searchService.search(project.id, text, { limit: 5 })
    const semanticSearch = await this.searchWithEmbedding({
      username,
      project,
      profile: profileValue,
      settings,
      question: text
    })
    const evidenceResults = mergeEvidenceResults(search.results, semanticSearch.results, 5)
    if (evidenceResults.length > 0) {
      const citations = evidenceResults.map(citationFromSearch)
      const patchDrafts = this.patchDraftService.draftReplacement({
        project,
        settings,
        question: text,
        searchResults: evidenceResults
      })
      const modelAnswer = await this.answerWithModel({
        username,
        question: text,
        profile: profileValue,
        sources: evidenceResults
      })
      const top = evidenceResults[0]

      return {
        answer: modelAnswer || `索引中最相关的线索在 \`${top.path}:${top.lineStart}-${top.lineEnd}\`。我只根据下面的来源给出判断，请打开对应文件确认上下文。`,
        confidence: top.score >= 8 || modelAnswer ? 'high' : 'medium',
        citations,
        suggestedCommands: [],
        patchDrafts
      }
    }

    return {
      answer: '当前项目索引中没有找到可靠依据。可以重新索引项目，或检查排除规则是否过滤了相关文件。',
      confidence: 'none',
      citations: [],
      suggestedCommands: [],
      patchDrafts: []
    }
  }

  async answerWithModel({ username, question, profile, sources }) {
    if (!sources?.length) return ''
    const config = this.store.getUserConfig(username)
    if (!config.apiKey) return ''

    try {
      const answer = await this.modelClient.answerProjectQuestion({
        username,
        question,
        profile,
        sources
      })
      return String(answer || '').trim()
    } catch {
      return ''
    }
  }

  async searchWithEmbedding({ username, project, profile, settings, question }) {
    try {
      return await this.embeddingService.search({
        username,
        project,
        profile,
        settings,
        query: question,
        limit: 3
      })
    } catch {
      return { query: question, results: [], status: 'error' }
    }
  }
}

module.exports = {
  ProjectQAService,
  citationFromCommand,
  citationFromSearch,
  mergeEvidenceResults,
  createProjectQAModelClient
}
