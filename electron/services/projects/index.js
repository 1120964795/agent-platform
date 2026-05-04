const { ProjectRegistry } = require('./projectRegistry')
const { ProjectSettingsService } = require('./projectSettingsService')
const { ProjectIgnorePolicy } = require('./projectIgnorePolicy')
const { ProjectProfileService } = require('./projectProfileService')
const { ProjectIndexer } = require('./projectIndexer')
const { ProjectIndexQueue } = require('./projectIndexQueue')
const { FtsSearchService } = require('./ftsSearchService')
const { ProjectQAService } = require('./projectQAService')
const { ProjectWatcher } = require('./projectWatcher')
const { PatchApplyService } = require('./patchApplyService')
const { PatchDraftService } = require('./patchDraftService')
const { ExperienceMigrationMatcher } = require('./experienceMigrationMatcher')
const { SQLiteIndexStore } = require('./sqliteIndexStore')
const { OptionalEmbeddingService } = require('./optionalEmbeddingService')
const { PROJECT_INDEX_SCHEMA, getProjectIndexSchemaSql } = require('./sqliteSchema')

function createProjectServices(options = {}) {
  const indexStore = options.indexStore || new SQLiteIndexStore(options)
  const sharedOptions = { ...options, indexStore }
  const registry = new ProjectRegistry(sharedOptions)
  const settings = new ProjectSettingsService(sharedOptions)
  const ignorePolicy = new ProjectIgnorePolicy(sharedOptions)
  const profiles = new ProjectProfileService(sharedOptions)
  const indexer = new ProjectIndexer({ ...sharedOptions, ignorePolicy })
  const search = new FtsSearchService(sharedOptions)
  const embedding = new OptionalEmbeddingService(sharedOptions)
  const patchDraft = options.patchDraftService || new PatchDraftService(sharedOptions)
  const indexQueue = options.indexQueue || new ProjectIndexQueue({
    ...sharedOptions,
    indexer,
    profileService: profiles
  })
  return {
    registry,
    settings,
    ignorePolicy,
    profiles,
    indexer,
    indexQueue,
    search,
    qa: new ProjectQAService({
      ...sharedOptions,
      searchService: search,
      embeddingService: embedding,
      patchDraftService: patchDraft
    }),
    watcher: new ProjectWatcher(sharedOptions),
    patch: new PatchApplyService(sharedOptions),
    patchDraft,
    migration: new ExperienceMigrationMatcher(sharedOptions),
    embedding,
    indexStore
  }
}

module.exports = {
  createProjectServices,
  ProjectRegistry,
  ProjectSettingsService,
  ProjectIgnorePolicy,
  ProjectProfileService,
  ProjectIndexer,
  ProjectIndexQueue,
  FtsSearchService,
  ProjectQAService,
  ProjectWatcher,
  PatchApplyService,
  PatchDraftService,
  ExperienceMigrationMatcher,
  SQLiteIndexStore,
  OptionalEmbeddingService,
  PROJECT_INDEX_SCHEMA,
  getProjectIndexSchemaSql
}
