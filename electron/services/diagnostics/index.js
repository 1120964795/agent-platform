const deepseek = require('../deepseek')
const { detectError } = require('./errorDetector')
const { matchExperiences } = require('./experienceMatcher')
const { buildExecutionPlan } = require('./executionPlanService')
const {
  createDiagnosisFromError,
  upsertExperienceFromDiagnosis,
  recordFixExecution,
  createModelClient,
  buildTemplate
} = require('./diagnosisService')
const { ObserverSessionManager } = require('./observerSessionManager')

module.exports = {
  detectError,
  matchExperiences,
  buildExecutionPlan,
  createDiagnosisFromError,
  upsertExperienceFromDiagnosis,
  recordFixExecution,
  createModelClient: (storeRef) => createModelClient(deepseek, storeRef),
  buildTemplate,
  ObserverSessionManager
}
