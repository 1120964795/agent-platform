function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function uniqueStrings(items = []) {
  return [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))]
}

function normalizeKeywords(errorEvent = {}, experience = {}) {
  const eventKeywords = uniqueStrings(errorEvent.keywords || []).map((item) => item.toLowerCase())
  const experienceKeywords = uniqueStrings(experience.errorKeywords || []).map((item) => item.toLowerCase())
  return experienceKeywords.filter((item) => eventKeywords.includes(item))
}

function classifySimilarity(errorEvent, experience) {
  if (!experience) return 'none'
  const eventSignature = normalizeText(errorEvent.signature)
  const expSignature = normalizeText(experience.errorSignature)
  if (eventSignature && expSignature && eventSignature === expSignature) return 'high'

  const matchedKeywords = normalizeKeywords(errorEvent, experience)
    .filter((item) => (errorEvent.keywords || []).some((keyword) => normalizeText(keyword) === item))

  if (normalizeText(errorEvent.type) && normalizeText(experience.errorSignature).includes(normalizeText(errorEvent.type))) {
    return matchedKeywords.length >= 1 ? 'high' : 'medium'
  }

  if (matchedKeywords.length >= 2) return 'medium'
  if (matchedKeywords.length >= 1) return 'low'
  return 'none'
}

function scoreSimilarity(label) {
  if (label === 'high') return 3
  if (label === 'medium') return 2
  if (label === 'low') return 1
  return 0
}

function matchExperiences(errorEvent, experiences = []) {
  return experiences
    .map((experience) => {
      const similarity = classifySimilarity(errorEvent, experience)
      const matchedKeywords = uniqueStrings((experience.errorKeywords || []).filter((keyword) => (
        (errorEvent.keywords || []).some((item) => normalizeText(item) === normalizeText(keyword))
      )))

      return {
        experienceId: experience.id,
        title: experience.title,
        similarity,
        matchedKeywords,
        experience
      }
    })
    .filter((item) => item.similarity !== 'none')
    .sort((left, right) => {
      const scoreDiff = scoreSimilarity(right.similarity) - scoreSimilarity(left.similarity)
      if (scoreDiff !== 0) return scoreDiff
      const rightTime = new Date(right.experience?.updatedAt || right.experience?.createdAt || 0).getTime()
      const leftTime = new Date(left.experience?.updatedAt || left.experience?.createdAt || 0).getTime()
      return rightTime - leftTime
    })
}

module.exports = { matchExperiences, classifySimilarity, scoreSimilarity }
