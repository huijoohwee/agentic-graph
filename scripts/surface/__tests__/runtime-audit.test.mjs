import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import test from 'node:test'

import { evaluateRuntimeReadiness } from '../runtime-audit.mjs'

const entry = artifactId => ({
  artifactId,
  surfaceTier: 'public-artifact',
  owningRepository: 'knowgrph',
  licenseId: 'Apache-2.0',
})

const makeInput = (entryCount = 2) => ({
  authority: {
    ok: true,
    generationReady: true,
    paths: { publicOriginRoot: '/fixture/public-origin' },
    registry: {
      entries: Array.from({ length: entryCount }, (_, index) => entry(`artifact-${index}`)),
    },
  },
  candidate: {
    candidateFiles: [{ path: 'robots.txt', bytes: Buffer.from('User-agent: *\n') }],
    gate: { decision: 'permit' },
  },
})

const evidence = readAfterAuthorityDigests => ({
  beforeAuthorityDigests: [{ path: 'authority', digest: 'stable' }],
  digestEntry: () => [],
  inspectEntry: currentEntry => ({
    containingRepository: currentEntry.owningRepository,
    derivedTier: currentEntry.surfaceTier,
  }),
  resolvePermittedRepository: currentEntry => currentEntry.owningRepository,
  readAfterAuthorityDigests,
})

const emptyDiff = () => ({ added: [], removed: [], changed: [], identical: ['robots.txt'] })
const successfulAudit = () => ({
  ok: true,
  report: {
    failures: [],
    exitStatus: 0,
  },
})

test('runtime deadline bounds a hung evidence-preparation stage', async () => {
  const startedAt = performance.now()
  const result = await evaluateRuntimeReadiness(makeInput(3), {
    deadlineMs: 20,
    dependencies: {
      prepareAuditEvidence: () => new Promise(() => {}),
    },
  })

  assert.ok(performance.now() - startedAt < 500)
  assert.equal(result.status, 'blocked')
  assert.equal(result.exitStatus, 1)
  assert.equal(result.audit, null)
  assert.equal(result.readinessFailures.length, 1)
  assert.equal(result.readinessFailures[0].code, 'FC-AUDIT-DEADLINE')
  assert.equal(result.readinessFailures[0].stage, 'prepare-audit-evidence')
  assert.equal(result.readinessFailures[0].unevaluatedCount, 3)
})

test('runtime deadline bounds a hung public-origin diff before registry audit', async () => {
  let auditCalls = 0
  const result = await evaluateRuntimeReadiness(makeInput(), {
    deadlineMs: 20,
    dependencies: {
      prepareAuditEvidence: () => evidence(() => []),
      diffGeneratedAgainstTracked: () => new Promise(() => {}),
      auditRegistry: () => {
        auditCalls += 1
        return successfulAudit()
      },
    },
  })

  assert.equal(auditCalls, 0)
  assert.equal(result.readinessFailures[0].stage, 'public-origin-diff')
  assert.equal(result.readinessFailures[0].unevaluatedCount, 2)
  assert.equal(result.publicOriginDiff.evaluated, false)
})

test('runtime passes only the remaining wall budget into registry audit', async () => {
  let auditDeadlineMs = null
  const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
  const result = await evaluateRuntimeReadiness(makeInput(1), {
    deadlineMs: 150,
    dependencies: {
      prepareAuditEvidence: async () => {
        await delay(15)
        return evidence(() => [{ path: 'authority', digest: 'stable' }])
      },
      diffGeneratedAgainstTracked: async () => {
        await delay(15)
        return emptyDiff()
      },
      auditRegistry: (_registry, options) => {
        auditDeadlineMs = options.deadlineMs
        return successfulAudit()
      },
    },
  })

  assert.equal(result.status, 'ready')
  assert.ok(auditDeadlineMs > 0)
  assert.ok(auditDeadlineMs < 140)
  assert.equal(result.authorityDigestPair.evaluated, true)
  assert.equal(result.publicOriginDiff.evaluated, true)
})

test('post-audit digest work shares the invocation deadline and abort signal', async () => {
  let postDigestAborted = false
  let auditDeadlineMs = null
  const startedAt = performance.now()
  const result = await evaluateRuntimeReadiness(makeInput(2), {
    deadlineMs: 35,
    dependencies: {
      prepareAuditEvidence: () => evidence(({ signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          postDigestAborted = true
          reject(signal.reason)
        }, { once: true })
      })),
      diffGeneratedAgainstTracked: () => emptyDiff(),
      auditRegistry: (_registry, options) => {
        auditDeadlineMs = options.deadlineMs
        return successfulAudit()
      },
    },
  })

  assert.ok(performance.now() - startedAt < 500)
  assert.ok(auditDeadlineMs > 0 && auditDeadlineMs <= 35)
  assert.equal(postDigestAborted, true)
  assert.equal(result.status, 'blocked')
  assert.equal(result.readinessFailures[0].stage, 'post-authority-digest')
  assert.equal(result.readinessFailures[0].unevaluatedCount, 0)
  assert.equal(result.authorityDigestPair.evaluated, false)
})

test('a nested registry deadline is promoted to the runtime readiness failure', async () => {
  const result = await evaluateRuntimeReadiness(makeInput(4), {
    deadlineMs: 100,
    dependencies: {
      prepareAuditEvidence: () => evidence(() => []),
      diffGeneratedAgainstTracked: () => emptyDiff(),
      auditRegistry: () => ({
        ok: false,
        report: {
          failures: [{
            code: 'FC-AUDIT-DEADLINE',
            stage: 'inspection',
            unevaluatedCount: 2,
          }],
          exitStatus: 1,
        },
      }),
    },
  })

  assert.equal(result.status, 'blocked')
  assert.equal(result.readinessFailures[0].code, 'FC-AUDIT-DEADLINE')
  assert.equal(result.readinessFailures[0].stage, 'registry-audit:inspection')
  assert.equal(result.readinessFailures[0].unevaluatedCount, 2)
  assert.equal(result.audit.failures[0].code, 'FC-AUDIT-DEADLINE')
})

test('runtime observation blocks egress attempted before registry audit', async () => {
  const result = await evaluateRuntimeReadiness(makeInput(), {
    deadlineMs: 100,
    dependencies: {
      prepareAuditEvidence: () => globalThis.fetch('https://example.invalid/forbidden'),
    },
  })

  assert.equal(result.status, 'blocked')
  assert.equal(result.readinessFailures[0].code, 'FC-AUDIT-EGRESS')
  assert.equal(result.readinessFailures[0].observedCalls, 1)
})

test('runtime surfaces egress attempted inside the injected registry audit', async () => {
  const result = await evaluateRuntimeReadiness(makeInput(), {
    deadlineMs: 100,
    dependencies: {
      prepareAuditEvidence: () => evidence(() => []),
      diffGeneratedAgainstTracked: () => emptyDiff(),
      auditRegistry: () => globalThis.fetch('https://example.invalid/forbidden'),
    },
  })

  assert.equal(result.status, 'blocked')
  assert.equal(result.readinessFailures[0].code, 'FC-AUDIT-EGRESS')
  assert.equal(result.readinessFailures[0].observedCalls, 1)
})
