import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import test from 'node:test'

import {
  AUDIT_REPORT_SCHEMA,
  auditRegistry,
  createExecutionEvidenceRecorder,
} from '../audit-report.mjs'

const makeEntry = (artifactId, surfaceTier, owningRepository = 'agenticgraph') => ({
  artifactId,
  surfaceTier,
  owningRepository,
  licenseId: surfaceTier.startsWith('public-') ? 'Apache-2.0' : 'LicenseRef-Proprietary',
})

test('audit emits one row per entry and all four tier counts including zero', async () => {
  const entries = [
    makeEntry('discoverable', 'public-discoverable'),
    makeEntry('artifact', 'public-artifact'),
    makeEntry('gated', 'gated'),
    makeEntry('private', 'private'),
  ]
  const result = await auditRegistry({ entries }, {
    now: () => 0,
    inspectEntry: entry => ({
      containingRepository: entry.owningRepository,
      derivedTier: entry.artifactId === 'artifact' ? 'public-discoverable' : entry.surfaceTier,
    }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.schema, AUDIT_REPORT_SCHEMA)
  assert.equal(result.entries.length, entries.length)
  assert.deepEqual(result.tierCounts, {
    'public-discoverable': 1,
    'public-artifact': 1,
    gated: 1,
    private: 1,
  })
  assert.equal(result.blockedCandidateCount, 2)
  assert.deepEqual(result.warnings.map(warning => warning.artifactId), ['artifact'])
  assert.deepEqual(result.executionEvidence, {
    source: 'audit-execution-recorder',
    observed: true,
    modelInvocations: 0,
    networkCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    estimatedCostUsd: 0,
  })
})

test('wrong repository is a failure and suppresses derived-tier warnings', async () => {
  const result = await auditRegistry({
    entries: [makeEntry('misplaced', 'public-artifact', 'agenticgraph')],
  }, {
    now: () => 0,
    inspectEntry: () => ({
      containingRepository: 'published-mirror',
      derivedTier: 'public-discoverable',
    }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.exitStatus, 1)
  assert.equal(result.failures.some(failure => failure.code === 'FC-AUDIT-LOCATION'), true)
  assert.deepEqual(result.warnings, [])
})

test('digest comparison detects audit-time mutation', async () => {
  const result = await auditRegistry({
    entries: [makeEntry('stable-artifact', 'public-artifact')],
  }, {
    now: () => 0,
    digestEntry: (_entry, phase) => ({
      path: 'public/artifact.json',
      digest: phase === 'before' ? 'sha256-before' : 'sha256-after',
    }),
  })

  assert.equal(result.ok, false)
  const mutation = result.failures.find(failure => failure.code === 'FC-AUDIT-MUTATION')
  assert.equal(mutation.path, 'public/artifact.json')
  assert.equal(result.digestPairs[0].equal, false)
})

test('unreadable registries have no partial report and a non-zero status', async () => {
  const result = await auditRegistry({ notEntries: [] })
  assert.equal(result.ok, false)
  assert.equal(result.report, null)
  assert.equal(result.error.code, 'FC-REGISTRY-UNREADABLE')
  assert.equal(result.exitStatus, 1)
})

test('deadline interrupts a hung inspection and reports the unevaluated entries', async () => {
  const startedAt = performance.now()
  const result = await auditRegistry({
    entries: [
      makeEntry('first', 'public-artifact'),
      makeEntry('second', 'public-artifact'),
    ],
  }, {
    deadlineMs: 20,
    inspectEntry: entry => (
      entry.artifactId === 'first'
        ? {
            containingRepository: entry.owningRepository,
            derivedTier: entry.surfaceTier,
          }
        : new Promise(() => {})
    ),
  })

  assert.ok(performance.now() - startedAt < 500)
  assert.equal(result.ok, false)
  assert.equal(result.entries.length, 1)
  assert.equal(result.unevaluatedCount, 1)
  const failure = result.failures.find(candidate => candidate.code === 'FC-AUDIT-DEADLINE')
  assert.equal(failure.artifactId, 'second')
  assert.equal(failure.stage, 'inspection')
})

test('deadline interrupts a hung digest and marks its partially evaluated entry unevaluated', async () => {
  const startedAt = performance.now()
  const result = await auditRegistry({
    entries: [makeEntry('hung-digest', 'public-artifact')],
  }, {
    deadlineMs: 20,
    digestEntry: () => new Promise(() => {}),
  })

  assert.ok(performance.now() - startedAt < 500)
  assert.equal(result.ok, false)
  assert.equal(result.entries.length, 0)
  assert.equal(result.unevaluatedCount, 1)
  const failure = result.failures.find(candidate => candidate.code === 'FC-AUDIT-DEADLINE')
  assert.equal(failure.artifactId, 'hung-digest')
  assert.equal(failure.stage, 'before-digest')
})

test('execution evidence is observed through the injected recorder', async () => {
  const executionRecorder = createExecutionEvidenceRecorder()
  const result = await auditRegistry({
    entries: [makeEntry('metered', 'public-artifact')],
  }, {
    now: () => 0,
    executionRecorder,
    inspectEntry: (entry, _index, context) => {
      context.executionRecorder.recordNetworkCall()
      context.executionRecorder.recordModelInvocation({
        promptTokens: 7,
        completionTokens: 3,
        estimatedCostUsd: 0.02,
      })
      return {
        containingRepository: entry.owningRepository,
        derivedTier: entry.surfaceTier,
      }
    },
  })

  assert.deepEqual(result.executionEvidence, {
    source: 'audit-execution-recorder',
    observed: true,
    modelInvocations: 1,
    networkCalls: 1,
    promptTokens: 7,
    completionTokens: 3,
    estimatedCostUsd: 0.02,
  })
  assert.equal(result.ok, false)
  assert.deepEqual(
    result.failures
      .filter(failure => failure.code.startsWith('FC-AUDIT-'))
      .map(failure => failure.code),
    ['FC-AUDIT-EGRESS', 'FC-AUDIT-MODEL'],
  )
})

test('default execution observation blocks and records a real network primitive', async () => {
  const result = await auditRegistry({
    entries: [makeEntry('egress-attempt', 'public-artifact')],
  }, {
    inspectEntry: () => globalThis.fetch('https://example.invalid/forbidden'),
  })

  assert.equal(result.ok, false)
  assert.equal(result.executionEvidence.observed, true)
  assert.equal(result.executionEvidence.networkCalls, 1)
  assert.equal(
    result.failures.some(failure => failure.code === 'FC-AUDIT-EGRESS'),
    true,
  )
})

test('standalone audit surfaces egress before entry evaluation as typed evidence', async () => {
  const result = await auditRegistry({
    entries: [makeEntry('not-evaluated', 'public-artifact')],
  }, {
    now: () => globalThis.fetch('https://example.invalid/forbidden'),
  })

  assert.equal(result.ok, false)
  assert.notEqual(result.report, null)
  assert.equal(result.failures[0].code, 'FC-AUDIT-EGRESS')
  assert.equal(result.executionEvidence.networkCalls, 1)
  assert.equal(result.unevaluatedCount, 1)
})

test('audit handles the required 5000-entry registry within a supplied deadline clock', async () => {
  const entries = Array.from({ length: 5_000 }, (_, index) => (
    makeEntry(`artifact-${index}`, index % 2 ? 'public-artifact' : 'private')
  ))
  const result = await auditRegistry({ entries }, { now: () => 0 })

  assert.equal(result.ok, true)
  assert.equal(result.entries.length, 5_000)
  assert.equal(result.tierCounts['public-artifact'], 2_500)
  assert.equal(result.tierCounts.private, 2_500)
  assert.equal(result.tierCounts.gated, 0)
  assert.equal(result.tierCounts['public-discoverable'], 0)
})

test('injected dependency failures return typed outcomes instead of rejecting', async () => {
  const result = await auditRegistry({
    entries: [makeEntry('artifact', 'public-artifact')],
  }, {
    now: () => {
      throw new Error('clock unavailable')
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.report, null)
  assert.equal(result.error.code, 'FC-REGISTRY-UNREADABLE')
})

test('an incomplete execution observation fails closed instead of reporting synthetic zeros', async () => {
  const result = await auditRegistry({
    entries: [makeEntry('unobserved', 'public-artifact')],
  }, {
    now: () => 0,
    executionRecorder: {
      recordNetworkCall: () => {},
      snapshot: () => ({}),
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.executionEvidence.observed, false)
  assert.equal(
    result.failures.some(failure => failure.code === 'FC-AUDIT-EVIDENCE'),
    true,
  )
})
