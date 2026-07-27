import assert from 'node:assert/strict'
import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import test from 'node:test'
import fc from 'fast-check'

import { auditRegistry } from '../audit-report.mjs'
import { generateDiscoverySurfaces } from '../discovery-generate.mjs'
import { evaluatePublicationGate } from '../publication-gate.mjs'
import { classifyRoutes } from '../route-classify.mjs'
import { scanCandidate } from '../secret-scan.mjs'

const PROPERTY_RUNS = 100
const TIERS = [
  'public-discoverable',
  'public-artifact',
  'gated',
  'private',
]
const EMPTY_CATALOG_DIGEST = '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570'

const makeEntry = (surfaceTier, index) => ({
  artifactId: `artifact-${index}`,
  path: `/artifact/${index}`,
  surfaceTier,
  owningRepository: `repository-${surfaceTier}`,
  licenseId: surfaceTier.startsWith('public-') ? 'Apache-2.0' : 'NONE-private',
})

// Feature: discoverability-ip-protection, Property 17: Audit shape and failure dominance.
test('Property 17: randomized estate placement yields exact rows/counts and location-failure biconditional', async () => {
  await fc.assert(fc.asyncProperty(
    fc.array(fc.record({
      surfaceTier: fc.constantFrom(...TIERS),
      misplaced: fc.boolean(),
      tierWarning: fc.boolean(),
    }), { maxLength: 100 }),
    async cases => {
      const entries = cases.map((item, index) => makeEntry(item.surfaceTier, index))
      const result = await auditRegistry({ entries }, {
        now: () => 0,
        inspectEntry: (entry, index) => ({
          containingRepository: cases[index].misplaced
            ? `wrong-${entry.owningRepository}`
            : entry.owningRepository,
          derivedTier: cases[index].tierWarning
            ? TIERS[(TIERS.indexOf(entry.surfaceTier) + 1) % TIERS.length]
            : entry.surfaceTier,
        }),
      })
      const expectedCounts = Object.fromEntries(TIERS.map(tier => [
        tier,
        cases.filter(item => item.surfaceTier === tier).length,
      ]))
      const misplacedIds = cases
        .map((item, index) => item.misplaced ? `artifact-${index}` : null)
        .filter(Boolean)
      const warningIds = cases
        .map((item, index) => !item.misplaced && item.tierWarning ? `artifact-${index}` : null)
        .filter(Boolean)

      assert.equal(result.entries.length, entries.length)
      assert.deepEqual(result.tierCounts, expectedCounts)
      assert.equal(
        result.blockedCandidateCount,
        cases.filter(item => ['gated', 'private'].includes(item.surfaceTier)).length,
      )
      assert.deepEqual(
        result.failures
          .filter(failure => failure.code === 'FC-AUDIT-LOCATION')
          .map(failure => failure.artifactId),
        misplacedIds,
      )
      assert.deepEqual(result.warnings.map(warning => warning.artifactId), warningIds)
      assert.equal(result.exitStatus === 1, misplacedIds.length > 0)
      assert.equal(result.ok, misplacedIds.length === 0)
    },
  ), { numRuns: PROPERTY_RUNS })
})

// Feature: discoverability-ip-protection, Property 18: Audit mutation detection.
test('Property 18: randomized digest mutations are all named while stable audit inputs remain untouched', async () => {
  await fc.assert(fc.asyncProperty(
    fc.array(fc.record({
      bytes: fc.uint8Array({ maxLength: 80 }),
      mutate: fc.boolean(),
    }), { minLength: 1, maxLength: 80 }),
    async files => {
      const entries = files.map((_, index) => makeEntry('public-artifact', index))
      const input = { entries }
      const beforeInput = structuredClone(input)
      const result = await auditRegistry(input, {
        now: () => 0,
        digestEntry: (_entry, phase, index) => ({
          path: `fixture/file-${index}.bin`,
          digest: Buffer.from(
            phase === 'after' && files[index].mutate
              ? Uint8Array.from([...files[index].bytes, 255])
              : files[index].bytes,
          ).toString('hex'),
        }),
      })
      const expectedMutations = files
        .map((file, index) => file.mutate ? `fixture/file-${index}.bin` : null)
        .filter(Boolean)
      const reportedMutations = result.failures
        .filter(failure => failure.code === 'FC-AUDIT-MUTATION')
        .map(failure => failure.path)

      assert.deepEqual(reportedMutations, expectedMutations)
      assert.equal(result.exitStatus === 1, expectedMutations.length > 0)
      assert.deepEqual(input, beforeInput)
      assert.equal(
        result.digestPairs.every((pair, index) => pair.equal === !files[index].mutate),
        true,
      )
    },
  ), { numRuns: PROPERTY_RUNS })
})

const installNetworkPrimitiveSpies = calls => {
  const originals = {
    fetch: globalThis.fetch,
    httpRequest: http.request,
    httpsRequest: https.request,
    socket: net.Socket,
    dnsLookup: dns.lookup,
  }
  const forbid = primitive => () => {
    calls.push(primitive)
    throw new Error(`${primitive} is forbidden in the local policy path`)
  }
  globalThis.fetch = forbid('fetch')
  http.request = forbid('http.request')
  https.request = forbid('https.request')
  net.Socket = forbid('net.Socket')
  dns.lookup = forbid('dns.lookup')
  return () => {
    globalThis.fetch = originals.fetch
    http.request = originals.httpRequest
    https.request = originals.httpsRequest
    net.Socket = originals.socket
    dns.lookup = originals.dnsLookup
  }
}

const publicEntry = index => ({
  ...makeEntry('public-discoverable', index),
  artifactClass: 'capability-description',
  canonicalUrl: `https://airvio.co/artifact/${index}`,
  title: `Public artifact ${index}`,
  summary: `Public metadata number ${index}.`,
  readOnly: true,
  ingressRoute: 'static-edge',
  targetExecutionRoute: 'none',
  spendBearing: false,
  lastModified: '2026-07-27',
  service: { method: 'GET', transport: 'http', trustBoundary: 'public' },
})

// Feature: discoverability-ip-protection, Property 19: Decision path has zero network egress.
test('Property 19: randomized classify/scan/generate/gate/audit runs invoke no network primitive', async () => {
  const networkCalls = []
  const restore = installNetworkPrimitiveSpies(networkCalls)
  try {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.constantFrom(...TIERS), { maxLength: 40 }),
      async tiers => {
        const entries = tiers.map((tier, index) => (
          tier === 'public-discoverable' ? publicEntry(index) : makeEntry(tier, index)
        ))
        const registry = {
          publicOrigin: 'https://airvio.co',
          version: '1.0.0',
          policy: { contentSignals: 'ai-train=no, search=yes, ai-input=yes' },
          catalogDigest: EMPTY_CATALOG_DIGEST,
          invocationRegistry: { catalogId: 'empty', entries: [] },
          entries,
        }
        const candidateFiles = entries.map(entry => ({
          path: `${entry.artifactId}.json`,
          content: JSON.stringify({ artifactId: entry.artifactId }),
        }))
        const routes = classifyRoutes(registry, {
          include: entries.map(entry => entry.path),
        })
        const scanResult = scanCandidate(candidateFiles, {
          now: () => '2026-07-27T00:00:00.000Z',
          monotonicNow: () => 0,
        })
        const generated = generateDiscoverySurfaces(registry)
        const gate = evaluatePublicationGate({
          registry,
          candidateFiles,
          candidatePaths: candidateFiles.map(file => file.path),
          classification: {
            resolved: candidateFiles.map((file, index) => ({
              path: file.path,
              tier: tiers[index],
            })),
            unclassified: [],
          },
          scanResult,
          routes,
        })
        const audit = await auditRegistry({ entries }, { now: () => 0 })

        assert.equal(scanResult.complete, true)
        assert.equal(generated.files.size >= 7, true)
        assert.equal(['permit', 'block'].includes(gate.decision), true)
        assert.equal(audit.executionEvidence.networkCalls, 0)
        assert.equal(audit.executionEvidence.modelInvocations, 0)
        assert.deepEqual(networkCalls, [])
      },
    ), { numRuns: PROPERTY_RUNS })
  } finally {
    restore()
  }
})
