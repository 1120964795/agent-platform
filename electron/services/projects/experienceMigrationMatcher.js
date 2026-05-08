const path = require('path')
const { store } = require('../../store')
const { normalizeRootPath } = require('./pathUtils')

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizePathKey(value) {
  return normalizeRootPath(value).replace(/[\\/]+$/, '').toLowerCase()
}

function stackTokens(profile = {}) {
  return [
    profile.language,
    ...(profile.languages || []),
    ...(profile.frameworks || []),
    ...(profile.packageManagers || [])
  ].map(normalizeText).filter(Boolean)
}

function keywordScore(experience, query = '') {
  const needle = normalizeText(query)
  if (!needle) return 1
  const haystack = [
    experience.title,
    experience.errorSignature,
    experience.originalError,
    experience.cause,
    ...(experience.errorKeywords || [])
  ].join('\n').toLowerCase()
  if (haystack.includes(needle)) return 3

  const terms = needle.match(/[a-z0-9_.:-]+|[\u4e00-\u9fff]{2,}/g) || []
  const uniqueTerms = [...new Set(terms.filter((term) => term.length > 1))]
  if (uniqueTerms.length === 0) return 0
  const matched = uniqueTerms.filter((term) => haystack.includes(term))
  if (matched.length === uniqueTerms.length) return 2
  return matched.length > 0 ? 1 : 0
}

class ExperienceMigrationMatcher {
  constructor(options = {}) {
    this.store = options.storeRef || store
  }

  match({ username, project, profile, query = '', errorSignature = '' } = {}) {
    const currentStack = stackTokens(profile)
    const currentRootKey = normalizePathKey(project?.rootPath)
    const experiences = this.store.listExperiences(username)
    const projects = this.store.listProjects(username)

    return experiences
      .map((experience) => {
        const score = keywordScore(experience, query)
        if (score <= 0) return null

        const sourceRoot = (experience.projectDirs || []).find(Boolean) || ''
        const sourceProject = projects.find((item) => normalizePathKey(item.rootPath) === normalizePathKey(sourceRoot)) || null
        const sourceProfile = sourceProject ? this.store.getProjectProfile(sourceProject.id) : null
        const sourceStack = stackTokens(sourceProfile)
        const sameProject = (experience.projectDirs || []).some((dir) => normalizePathKey(dir) === currentRootKey)
        const sameStackTokens = sourceStack.filter((item) => currentStack.includes(item))
        const sameSignature = errorSignature && experience.errorSignature === errorSignature

        let reuseLevel = 'different_stack'
        if (sameProject) reuseLevel = 'same_project'
        else if (sameStackTokens.length > 0) reuseLevel = 'same_stack'

        const activeRecommendation = reuseLevel !== 'different_stack'
        return {
          experienceId: experience.id,
          title: experience.title,
          reuseLevel,
          similarity: sameSignature || sameProject ? 'high' : sameStackTokens.length >= 2 ? 'high' : sameStackTokens.length === 1 ? 'medium' : 'low',
          activeRecommendation,
          sourceProject: sourceRoot || sourceProject?.rootPath || '',
          currentProject: project?.rootPath || '',
          samePoints: sameProject ? ['same project'] : sameStackTokens,
          differences: [
            ...(sameProject ? [] : [`source: ${sourceProject?.name || path.basename(sourceRoot) || 'unknown'}`]),
            ...(sourceStack.length && currentStack.length ? [] : ['missing stack profile on one side'])
          ],
          recommendation: activeRecommendation
            ? 'This experience can be reused, but confirm commands and paths against the current project evidence.'
            : 'Different stack: keep it searchable, but do not apply it as an active recommendation.',
          commands: experience.commands || []
        }
      })
      .filter(Boolean)
      .sort((left, right) => {
        const levelScore = { same_project: 3, same_stack: 2, different_stack: 1 }
        const diff = levelScore[right.reuseLevel] - levelScore[left.reuseLevel]
        if (diff !== 0) return diff
        const similarityScore = { high: 3, medium: 2, low: 1 }
        return similarityScore[right.similarity] - similarityScore[left.similarity]
      })
      .slice(0, 8)
  }
}

module.exports = {
  ExperienceMigrationMatcher,
  stackTokens,
  normalizePathKey
}
