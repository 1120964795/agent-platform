import { expect, test } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const {
  inferDocumentType,
  normalizeArtifactTitle,
  planDocumentArtifact,
  planPresentationArtifact
} = require('../services/officeArtifactPlanner')

test('normalizes artifact titles into safe display and filename stems', () => {
  expect(normalizeArtifactTitle('  Quarterly / Review: Q1?  ')).toEqual({
    title: 'Quarterly Review Q1',
    filenameStem: 'Quarterly-Review-Q1'
  })
})

test('infers common document types from prompts', () => {
  expect(inferDocumentType('write a research report about automation')).toBe('report')
  expect(inferDocumentType('prepare study notes for the exam')).toBe('study-notes')
  expect(inferDocumentType('draft a project proposal')).toBe('proposal')
})

test('plans Word artifact with style guidance and QA checks', () => {
  const plan = planDocumentArtifact({
    prompt: 'write a research report about Browser Use',
    title: 'Browser Use Report'
  })

  expect(plan.kind).toBe('word')
  expect(plan.title).toBe('Browser Use Report')
  expect(plan.sections.length).toBeGreaterThan(0)
  expect(plan.qualityChecks).toEqual(expect.arrayContaining([
    'heading-hierarchy',
    'table-spacing',
    'artifact-registration'
  ]))
})

test('plans PPT artifact with narrative slide jobs and editable evidence guidance', () => {
  const plan = planPresentationArtifact({
    prompt: 'make a PPT about desktop automation',
    title: 'Automation Pitch'
  })

  expect(plan.kind).toBe('ppt')
  expect(plan.slideJobs.length).toBeGreaterThan(0)
  expect(plan.qualityChecks).toEqual(expect.arrayContaining([
    'one-job-per-slide',
    'editable-tables-or-charts',
    'artifact-registration'
  ]))
})
