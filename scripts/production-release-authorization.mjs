import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { validateProductionRuntimeReadiness } from './production-runtime-readiness.mjs'

export const LOCAL_REVIEW_CANDIDATE_SCHEMA = 'agentic-local-review-candidate/v1'
export const PRODUCTION_RELEASE_CANDIDATE_SCHEMA = 'agentic-production-release-candidate/v1'

const shaPattern = /^[0-9a-f]{40}$/
const digestPattern = /^[0-9a-f]{64}$/

export const validateLocalReviewCandidate = value => {
  assertExactObject(value, [
    'schema',
    'status',
    'source',
    'agenticCanvasOs',
    'catalogRevision',
    'runtimeEvidenceDigest',
    'candidateDigest',
  ], 'local review candidate')
  if (value.schema !== LOCAL_REVIEW_CANDIDATE_SCHEMA || value.status !== 'review-ready') {
    throw new Error('local review candidate schema or status is invalid')
  }
  assertShaTree(value.source, 'local review source')
  assertShaTree(value.agenticCanvasOs, 'local review Agentic Canvas OS')
  if (value.catalogRevision !== value.agenticCanvasOs.revision) {
    throw new Error('local review catalog revision must equal Agentic Canvas OS revision')
  }
  assertDigest(value.runtimeEvidenceDigest, 'local review runtime evidence')
  const { candidateDigest, ...evidence } = value
  if (candidateDigest !== digest(evidence)) {
    throw new Error('local review candidate digest does not match its evidence')
  }
  return value
}

export const verifyLocalReviewIdentity = ({
  localReview,
  sourceRevision,
  sourceTree,
  agenticCanvasOsRevision,
  agenticCanvasOsTree,
}) => {
  validateLocalReviewCandidate(localReview)
  const expected = {
    sourceRevision,
    sourceTree,
    agenticCanvasOsRevision,
    agenticCanvasOsTree,
  }
  for (const [label, actual, wanted] of [
    ['source revision', localReview.source.revision, expected.sourceRevision],
    ['source tree', localReview.source.tree, expected.sourceTree],
    ['Agentic Canvas OS revision', localReview.agenticCanvasOs.revision, expected.agenticCanvasOsRevision],
    ['Agentic Canvas OS tree', localReview.agenticCanvasOs.tree, expected.agenticCanvasOsTree],
  ]) {
    if (actual !== wanted) throw new Error(`local review ${label} drift: expected ${wanted}, received ${actual}`)
  }
  return localReview
}

export const createProductionReleaseCandidate = async ({
  localReview,
  readiness,
  sourceRevision,
  sourceTree,
  agenticCanvasOsRevision,
  agenticCanvasOsTree,
}) => {
  verifyLocalReviewIdentity({
    localReview,
    sourceRevision,
    sourceTree,
    agenticCanvasOsRevision,
    agenticCanvasOsTree,
  })
  await validateProductionRuntimeReadiness(readiness, {
    sourceRevision,
    sourceTree,
    agenticCanvasOsRevision,
  })
  const evidence = {
    schema: PRODUCTION_RELEASE_CANDIDATE_SCHEMA,
    status: 'awaiting-human-authorization',
    source: localReview.source,
    agenticCanvasOs: localReview.agenticCanvasOs,
    catalogRevision: localReview.catalogRevision,
    artifact: readiness.artifact,
    immutableManifest: readiness.immutableManifest,
    localReviewCandidateDigest: localReview.candidateDigest,
  }
  return Object.freeze({ ...evidence, candidateDigest: digest(evidence) })
}

export const validateProductionReleaseCandidate = value => {
  assertExactObject(value, [
    'schema',
    'status',
    'source',
    'agenticCanvasOs',
    'catalogRevision',
    'artifact',
    'immutableManifest',
    'localReviewCandidateDigest',
    'candidateDigest',
  ], 'production release candidate')
  if (value.schema !== PRODUCTION_RELEASE_CANDIDATE_SCHEMA ||
      value.status !== 'awaiting-human-authorization') {
    throw new Error('production release candidate schema or status is invalid')
  }
  assertShaTree(value.source, 'production source')
  assertShaTree(value.agenticCanvasOs, 'production Agentic Canvas OS')
  if (value.catalogRevision !== value.agenticCanvasOs.revision) {
    throw new Error('production catalog revision must equal Agentic Canvas OS revision')
  }
  assertDigestObject(value.artifact, 'production artifact')
  assertDigestObject(value.immutableManifest, 'production immutable manifest')
  assertDigest(value.localReviewCandidateDigest, 'local review candidate')
  const { candidateDigest, ...evidence } = value
  if (candidateDigest !== digest(evidence)) {
    throw new Error('production release candidate digest does not match its evidence')
  }
  return value
}

export const verifyAuthorizedProductionCandidate = async ({
  candidate,
  localReview,
  readiness,
  sourceRevision,
  sourceTree,
  agenticCanvasOsRevision,
  agenticCanvasOsTree,
  expectedCandidateDigest,
}) => {
  validateProductionReleaseCandidate(candidate)
  const rebuilt = await createProductionReleaseCandidate({
    localReview,
    readiness,
    sourceRevision,
    sourceTree,
    agenticCanvasOsRevision,
    agenticCanvasOsTree,
  })
  if (candidate.candidateDigest !== expectedCandidateDigest ||
      rebuilt.candidateDigest !== candidate.candidateDigest) {
    throw new Error('production authorization invalidated by candidate, source, artifact, or manifest drift')
  }
  return candidate
}

const readJson = filePath => JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'))
const writeJson = (filePath, value) => fs.writeFileSync(path.resolve(filePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
const readTree = cwd => execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd, encoding: 'utf8' }).trim()

const main = async () => {
  const [command, ...argumentsList] = process.argv.slice(2)
  const { values } = parseArgs({
    args: argumentsList,
    options: {
      'local-review': { type: 'string' },
      readiness: { type: 'string' },
      candidate: { type: 'string' },
      output: { type: 'string' },
      'source-sha': { type: 'string' },
      'source-tree': { type: 'string' },
      'docs-sha': { type: 'string' },
      'docs-tree': { type: 'string' },
      'docs-root': { type: 'string' },
      'candidate-digest': { type: 'string' },
      'github-output': { type: 'boolean' },
    },
    strict: true,
  })

  if (command === 'materialize-local-review') {
    const value = validateLocalReviewCandidate(JSON.parse(process.env.LOCAL_REVIEW_CANDIDATE_JSON || ''))
    if (!values.output) throw new Error('--output is required')
    writeJson(values.output, value)
    return
  }

  const sourceRevision = required(values['source-sha'], '--source-sha')
  const sourceTree = values['source-tree'] || readTree(process.cwd())
  const agenticCanvasOsRevision = required(values['docs-sha'], '--docs-sha')
  const docsRoot = values['docs-root'] ? path.resolve(values['docs-root']) : ''
  const agenticCanvasOsTree = values['docs-tree'] || (docsRoot ? readTree(docsRoot) : '')
  const localReview = readJson(required(values['local-review'], '--local-review'))

  if (command === 'verify-local-review') {
    verifyLocalReviewIdentity({
      localReview,
      sourceRevision,
      sourceTree,
      agenticCanvasOsRevision,
      agenticCanvasOsTree,
    })
    return
  }

  const readiness = readJson(required(values.readiness, '--readiness'))
  if (command === 'create') {
    const candidate = await createProductionReleaseCandidate({
      localReview,
      readiness,
      sourceRevision,
      sourceTree,
      agenticCanvasOsRevision,
      agenticCanvasOsTree,
    })
    writeJson(required(values.output, '--output'), candidate)
    if (values['github-output']) process.stdout.write(`candidate_digest=${candidate.candidateDigest}\n`)
    return
  }
  if (command === 'verify') {
    await verifyAuthorizedProductionCandidate({
      candidate: readJson(required(values.candidate, '--candidate')),
      localReview,
      readiness,
      sourceRevision,
      sourceTree,
      agenticCanvasOsRevision,
      agenticCanvasOsTree,
      expectedCandidateDigest: required(values['candidate-digest'], '--candidate-digest'),
    })
    return
  }
  throw new Error('command must be materialize-local-review, verify-local-review, create, or verify')
}

const required = (value, label) => {
  if (!String(value || '').trim()) throw new Error(`${label} is required`)
  return String(value).trim()
}

const assertExactObject = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error(`${label} contains missing or unknown fields`)
  }
}

const assertShaTree = (value, label) => {
  assertExactObject(value, ['repository', 'revision', 'tree'], label)
  if (!String(value.repository).includes('/') ||
      !shaPattern.test(value.revision) ||
      !shaPattern.test(value.tree)) {
    throw new Error(`${label} requires exact repository, commit, and tree identities`)
  }
}

const assertDigestObject = (value, label) => {
  assertExactObject(value, ['algorithm', 'digest'], label)
  if (value.algorithm !== 'sha256') throw new Error(`${label} must use sha256`)
  assertDigest(value.digest, label)
}

const assertDigest = (value, label) => {
  if (!digestPattern.test(String(value || ''))) throw new Error(`${label} must be an exact SHA-256 digest`)
}

const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const digest = value => createHash('sha256').update(canonicalJson(value)).digest('hex')

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await main()
}
