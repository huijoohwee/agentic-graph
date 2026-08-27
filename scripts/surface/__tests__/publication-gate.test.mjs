import assert from 'node:assert/strict'
import test from 'node:test'

import {
  evaluatePublicationGate,
  PUBLICATION_GATE_STAGES,
} from '../publication-gate.mjs'

const fixedNow = () => '2026-07-27T00:00:02.000Z'

test('invalid registry blocks and dependency-skips every consumer of valid registry data', () => {
  const calls = {
    resolve: 0,
    scan: 0,
    parse: 0,
    license: 0,
    catalog: 0,
  }
  const result = evaluatePublicationGate({
    registry: { entries: [{ artifactId: 'invalid', surfaceTier: 'unknown' }] },
    candidatePaths: ['public/candidate.txt'],
  }, {
    now: fixedNow,
    resolveCandidateTiers: () => { calls.resolve += 1 },
    scanCandidate: () => { calls.scan += 1 },
    parseDiscoveryFiles: () => { calls.parse += 1 },
    validateLicenseRegistry: () => { calls.license += 1 },
    assembleCatalog: () => { calls.catalog += 1 },
  })

  assert.equal(result.decision, 'block')
  assert.deepEqual(calls, { resolve: 0, scan: 0, parse: 0, license: 0, catalog: 0 })
  assert.equal(result.blocks.every(block => block.code === 'FC-REGISTRY-ILLEGAL'), true)
  assert.deepEqual(
    result.dependencySkipped.map(item => item.stage),
    [...PUBLICATION_GATE_STAGES],
  )
  assert.equal(result.dependencySkipped.every(item => item.reason === 'invalid-registry'), true)
})

test('gate accumulates every safe-to-evaluate blocker and does not mutate input', () => {
  const input = {
    registry: {
      entries: [
        {
          artifactId: 'gated-capability',
          path: 'internal/gated.md',
          surfaceTier: 'gated',
          licenseId: 'LicenseRef-Proprietary',
        },
        {
          artifactId: 'public-capability',
          path: 'public/capability.md',
          surfaceTier: 'public-artifact',
        },
      ],
    },
    candidatePaths: ['internal/gated.md', 'unclassified.txt'],
    classification: {
      resolved: [{ path: 'internal/gated.md', tier: 'private' }],
      unclassified: ['unclassified.txt'],
      allowlistDisagreements: ['module-x'],
    },
    scanResult: {
      complete: false,
      scannedCount: 0,
      cause: 'scanner stopped',
      matches: [{ path: 'unclassified.txt', category: 'token', line: 7 }],
    },
    parsedFiles: [
      { name: 'broken.txt', error: { line: 3, detail: 'bad syntax' } },
      {
        name: 'llms.txt',
        entries: [{ entryId: 'gated-capability' }, { entryId: 'extra-entry' }],
        expectedEntryIds: ['expected-entry'],
      },
    ],
    routes: {
      unclassified: ['/unknown'],
      missingRateLimit: ['/fetch-on-behalf'],
      omittedGatedRoutes: ['/gated'],
    },
    licenseResult: {
      ok: false,
      violations: [{ artifactId: 'public-capability', detail: 'missing declaration' }],
    },
    catalog: {
      digest: 'actual',
      entries: [{
        token: '/hosted',
        prefixRole: 'action',
        executionRoute: 'direct',
        summary: 'https://private.example',
      }],
      validationFailures: [{ code: 'MCP_SPEND', token: 'spend-tool' }],
    },
    expectedCatalogDigest: 'expected',
    attempt: {
      destination: 'prod',
      artifactIds: ['public-capability'],
      timestamp: '2026-07-27T00:00:02.000Z',
    },
  }
  const before = structuredClone(input)
  const result = evaluatePublicationGate(input, { now: fixedNow })
  const codes = new Set(result.blocks.map(block => block.code))

  assert.equal(result.decision, 'block')
  for (const code of [
    'FC-UNCLASSIFIED',
    'FC-SOURCE-LEAK',
    'FC-ALLOWLIST',
    'FC-SCAN-INCOMPLETE',
    'FC-SECRET',
    'FC-PARSE',
    'FC-GATED-LISTED',
    'FC-DRIFT',
    'FC-RATELIMIT',
    'FC-ROBOTS-OMISSION',
    'FC-LICENSE',
    'FC-MCP-ROUTE',
    'FC-TOKEN-ROUTE',
    'FC-DIGEST',
    'FC-NO-APPROVAL',
  ]) {
    assert.equal(codes.has(code), true, `expected ${code}`)
  }
  assert.deepEqual(input, before)
  assert.equal(result.statePreserved, true)
})

test('gate permits a clean public candidate without mutating public state', () => {
  const result = evaluatePublicationGate({
    registry: {
      entries: [{
        artifactId: 'public-capability',
        path: 'public/capability.md',
        surfaceTier: 'public-artifact',
        licenseId: 'Apache-2.0',
        representingPage: '/capability',
      }],
    },
    candidatePaths: ['public/capability.md'],
    scanResult: { complete: true, scannedCount: 1, matches: [] },
    parsedFiles: [],
    licenseResult: { ok: true, violations: [] },
    catalog: { entries: [], validationFailures: [] },
    publishedPaths: ['/capability'],
  }, { now: fixedNow })

  assert.equal(result.decision, 'permit')
  assert.deepEqual(result.blocks, [])
  assert.equal(result.statePreserved, true)
})

test('representing pages require exact file-backed evidence and reject route-only wildcards', () => {
  const input = {
    registry: {
      entries: [{
        artifactId: 'public-bundle',
        surfaceTier: 'public-artifact',
        licenseId: 'LicenseRef-airvio-no-reuse-1.0',
        representingPage: '/agenticgraph/',
      }],
    },
  }
  const withoutEvidence = evaluatePublicationGate(input, { now: fixedNow })
  assert.equal(withoutEvidence.decision, 'block')
  assert.equal(
    withoutEvidence.blocks.some(block => (
      block.code === 'FC-REPRESENTING-PAGE'
      && block.detail === 'trusted published-path evidence is required'
    )),
    true,
  )

  const routeOnly = evaluatePublicationGate({
    ...input,
    publishedPaths: ['/agenticgraph/*'],
  }, { now: fixedNow })
  assert.equal(routeOnly.decision, 'block')

  const withTrackedIndex = evaluatePublicationGate({
    ...input,
    publishedPaths: ['/agenticgraph/'],
  }, { now: fixedNow })
  assert.equal(withTrackedIndex.decision, 'permit')

  const discoverableWithMissingPage = evaluatePublicationGate({
    registry: {
      entries: [{
        artifactId: 'public-api',
        surfaceTier: 'public-discoverable',
        canonicalUrl: 'https://airvio.co/api',
        licenseId: 'Apache-2.0',
        representingPage: '/ghost/',
      }],
    },
    publishedPaths: ['/agenticgraph/'],
  }, { now: fixedNow })
  assert.equal(discoverableWithMissingPage.decision, 'block')
  assert.equal(
    discoverableWithMissingPage.blocks.some(block => (
      block.code === 'FC-REPRESENTING-PAGE'
      && block.subject === 'public-api'
    )),
    true,
  )
})

test('canonical and representing-page invariants fail closed', () => {
  const result = evaluatePublicationGate({
    registry: {
      entries: [
        {
          artifactId: 'missing-canonical',
          surfaceTier: 'public-discoverable',
          licenseId: 'Apache-2.0',
        },
        {
          artifactId: 'canonical-owner',
          surfaceTier: 'public-discoverable',
          canonicalUrl: 'https://example.test/shared',
          licenseId: 'Apache-2.0',
        },
        {
          artifactId: 'canonical-collision',
          surfaceTier: 'public-discoverable',
          canonicalUrl: 'https://example.test/shared',
          licenseId: 'Apache-2.0',
        },
        {
          artifactId: 'unrepresented-artifact',
          surfaceTier: 'public-artifact',
          licenseId: 'LicenseRef-NoReuse',
          representingPage: '/missing-page',
        },
      ],
    },
    publishedPaths: ['/other-page'],
  }, { now: fixedNow })

  const codes = result.blocks.map(block => block.code)
  assert.equal(codes.filter(code => code === 'FC-CANONICAL').length, 2)
  assert.equal(codes.filter(code => code === 'FC-REPRESENTING-PAGE').length, 1)
})

test('secret evidence and conflict handling remain metadata-only', () => {
  const secretValue = 'do-not-echo-this-secret'
  const result = evaluatePublicationGate({
    registry: { entries: [] },
    candidatePaths: ['candidate.txt'],
    classification: { resolved: [], unclassified: [] },
    scanResult: {
      complete: true,
      scannedCount: 1,
      matches: [{ path: 'candidate.txt', category: 'credential', line: 1, secret: secretValue }],
    },
    conflicts: [{
      conflictId: 'conflict-1',
      artifactId: 'artifact-1',
      capabilityName: 'Safe metadata',
      summary: 'Metadata-only discovery record.',
      surfaceTier: 'public-artifact',
      authorisationUrl: 'https://example.test/authorise',
    }],
  }, { now: fixedNow })

  assert.equal(result.decision, 'block')
  assert.equal(JSON.stringify(result).includes(secretValue), false)
  assert.equal(result.stubs.length, 1)
  assert.equal(result.conflictRecords[0].outcome, 'blocked-with-stub')
})

test('private conflict overrides are always rejected', () => {
  const result = evaluatePublicationGate({
    registry: { entries: [] },
    conflicts: [{
      conflictId: 'private-conflict',
      artifactId: 'private-artifact',
      surfaceTier: 'private',
    }],
    overrides: [{
      conflictId: 'private-conflict',
      author: 'operator',
      scope: 'private-artifact',
      justification: 'Requested exception.',
    }],
  }, { now: fixedNow })

  assert.equal(result.decision, 'block')
  assert.equal(result.blocks.some(block => block.code === 'FC-OVERRIDE'), true)
})
