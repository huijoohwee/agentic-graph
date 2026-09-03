import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createProductionReleaseCandidate,
  validateLocalReviewCandidate,
  verifyAuthorizedProductionCandidate,
} from '../production-release-authorization.mjs'

const sourceRevision = 'a'.repeat(40)
const sourceTree = 'b'.repeat(40)
const docsRevision = 'c'.repeat(40)
const docsTree = 'd'.repeat(40)
const runtimeEvidenceDigest = 'e'.repeat(64)

const localEvidence = {
  schema: 'agentic-local-review-candidate/v1',
  status: 'review-ready',
  source: { repository: 'huijoohwee/agentic-graph', revision: sourceRevision, tree: sourceTree },
  agenticCanvasOs: { repository: 'huijoohwee/agentic-canvas-os', revision: docsRevision, tree: docsTree },
  catalogRevision: docsRevision,
  runtimeEvidenceDigest,
}

const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const digest = async value => {
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

const localReview = {
  ...localEvidence,
  candidateDigest: await digest(localEvidence),
}

const readiness = {
  schema: 'agentic-os-production-runtime-readiness/v2',
  status: 'verified-build',
  source: { repository: 'huijoohwee/agentic-graph', revision: sourceRevision, tree: sourceTree },
  agenticCanvasOs: { repository: 'huijoohwee/agentic-canvas-os', revision: docsRevision },
  catalogRevision: docsRevision,
  artifact: { algorithm: 'sha256', digest: 'f'.repeat(64) },
  immutableManifest: { algorithm: 'sha256', digest: '1'.repeat(64) },
  mirror: { repository: 'huijoohwee/huijoohwee' },
  surfaces: ['/', '/agentic-graph'],
}

const identity = {
  sourceRevision,
  sourceTree,
  agenticCanvasOsRevision: docsRevision,
  agenticCanvasOsTree: docsTree,
}

test('production candidate binds the exact localhost review, artifact, and manifest', async () => {
  assert.equal(validateLocalReviewCandidate(localReview), localReview)
  const candidate = await createProductionReleaseCandidate({ localReview, readiness, ...identity })
  assert.equal(candidate.source.tree, sourceTree)
  assert.equal(candidate.agenticCanvasOs.tree, docsTree)
  assert.equal(candidate.artifact.digest, readiness.artifact.digest)
  assert.equal(candidate.immutableManifest.digest, readiness.immutableManifest.digest)
  assert.equal(await verifyAuthorizedProductionCandidate({
    candidate,
    localReview,
    readiness,
    expectedCandidateDigest: candidate.candidateDigest,
    ...identity,
  }), candidate)
})

for (const [name, mutate] of [
  ['source revision', state => { state.sourceRevision = '2'.repeat(40) }],
  ['source tree', state => { state.sourceTree = '2'.repeat(40) }],
  ['Agentic Canvas OS revision', state => { state.agenticCanvasOsRevision = '2'.repeat(40) }],
  ['Agentic Canvas OS tree', state => { state.agenticCanvasOsTree = '2'.repeat(40) }],
  ['artifact digest', state => { state.readiness = { ...state.readiness, artifact: { algorithm: 'sha256', digest: '2'.repeat(64) } } }],
  ['manifest digest', state => { state.readiness = { ...state.readiness, immutableManifest: { algorithm: 'sha256', digest: '2'.repeat(64) } } }],
]) {
  test(`production authorization fails closed on ${name} drift`, async () => {
    const candidate = await createProductionReleaseCandidate({ localReview, readiness, ...identity })
    const state = { candidate, localReview, readiness, expectedCandidateDigest: candidate.candidateDigest, ...identity }
    mutate(state)
    await assert.rejects(() => verifyAuthorizedProductionCandidate(state), /drift|mismatch/)
  })
}

test('local review rejects unknown fields and digest drift', () => {
  assert.throws(() => validateLocalReviewCandidate({ ...localReview, inferredApproval: true }), /unknown/)
  assert.throws(() => validateLocalReviewCandidate({ ...localReview, candidateDigest: '3'.repeat(64) }), /digest/)
})
