import assert from 'node:assert/strict'
import test from 'node:test'
import fc from 'fast-check'

import {
  DISCOVERY_SURFACE_FILES,
  generateDiscoverySurfaces,
} from '../discovery-generate.mjs'
import { parseDiscoveryFile } from '../discovery-parse.mjs'
import { evaluatePublicationGate } from '../publication-gate.mjs'

const PROPERTY_RUNS = 100
const ROUND_TRIP_RUNS = 200
const EMPTY_CATALOG_DIGEST = '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570'
const TIERS = ['private', 'gated', 'public-artifact', 'public-discoverable']

const entryFor = (surfaceTier, index, overrides = {}) => {
  if (surfaceTier === 'public-discoverable') {
    return {
      artifactId: `public.${index}`,
      path: `/public/${index}`,
      artifactClass: 'capability-description',
      surfaceTier,
      licenseId: 'Apache-2.0',
      canonicalUrl: `https://airvio.co/public/${index}`,
      representingPage: null,
      title: `Public surface ${index}`,
      summary: `Public deterministic surface number ${index}.`,
      readOnly: true,
      ingressRoute: 'static-edge',
      targetExecutionRoute: 'none',
      spendBearing: false,
      lastModified: '2026-07-27',
      service: { method: 'GET', transport: 'http', trustBoundary: 'public' },
      notes: 'Public metadata.',
      ...overrides,
    }
  }
  if (surfaceTier === 'public-artifact') {
    return {
      artifactId: `artifact.${index}`,
      path: `assets/${index}.js`,
      artifactClass: 'bundled-build-output',
      surfaceTier,
      licenseId: 'LicenseRef-airvio-no-reuse-1.0',
      representingPage: `/artifact-page/${index}/`,
      lastModified: '2026-07-27',
      notes: 'Viewable output without a reuse grant.',
      ...overrides,
    }
  }
  if (surfaceTier === 'gated') {
    return {
      artifactId: `gated.${index}`,
      path: `/gated-route/${index}`,
      artifactClass: 'routed-path',
      surfaceTier,
      licenseId: 'NONE-private',
      notes: `Protected gated metadata ${index}.`,
      ...overrides,
    }
  }
  return {
    artifactId: `private.${index}`,
    path: `src/private-${index}.mjs`,
    artifactClass: 'application-source',
    surfaceTier: 'private',
    licenseId: 'NONE-private',
    notes: `Protected private metadata ${index}.`,
    ...overrides,
  }
}

const registryFor = entries => ({
  schema: 'knowgrph-surface-registry/v1',
  version: '1.0.0',
  publicOrigin: 'https://airvio.co',
  policy: { contentSignals: 'ai-train=no, search=yes, ai-input=yes' },
  catalogDigest: EMPTY_CATALOG_DIGEST,
  invocationRegistry: { catalogId: 'mcp', entries: [] },
  entries,
})

const parsedIds = (name, bytes) => {
  const parsed = parseDiscoveryFile(name, bytes)
  assert.equal(parsed.error, undefined, `${name}: ${JSON.stringify(parsed.error)}`)
  return parsed.entries.map(entry => entry.entryId).sort()
}

const publicIds = registry => registry.entries
  .filter(entry => entry.surfaceTier === 'public-discoverable')
  .map(entry => entry.artifactId)
  .sort()

const tiersFromCount = (count, offset) => (
  Array.from({ length: count }, (_, index) => TIERS[(index + offset) % TIERS.length])
)

// Feature: discoverability-ip-protection, Property 4: Generator/parser round-trip.
test('Property 4: randomized 0..1000 registries round-trip the exact public identifier set', () => {
  fc.assert(fc.property(
    fc.integer({ min: 0, max: 1_000 }),
    fc.integer({ min: 0, max: TIERS.length - 1 }),
    (count, offset) => {
      const registry = registryFor(
        tiersFromCount(count, offset).map((tier, index) => entryFor(tier, index)),
      )
      const generated = generateDiscoverySurfaces(registry)
      assert.deepEqual(generated.generationErrors, [])
      const expected = publicIds(registry)
      for (const name of DISCOVERY_SURFACE_FILES) {
        assert.deepEqual(parsedIds(name, generated.files.get(name)), expected, name)
      }
      for (const name of ['robots.txt', 'sitemap.xml']) {
        const parsed = parseDiscoveryFile(name, generated.files.get(name))
        assert.equal(parsed.entries.every(entry => entry.summary === ''), true)
      }
    },
  ), { numRuns: ROUND_TRIP_RUNS })
})

// Feature: discoverability-ip-protection, Property 5: Generation is idempotent.
test('Property 5: insertion order and repeated execution cannot change generated names or bytes', () => {
  fc.assert(fc.property(
    fc.array(fc.constantFrom(...TIERS), { maxLength: 80 }),
    tiers => {
      const entries = tiers.map((tier, index) => entryFor(tier, index))
      const registry = registryFor(entries)
      const before = structuredClone(registry)
      const first = generateDiscoverySurfaces(registry)
      const repeated = generateDiscoverySurfaces(registry)
      const reordered = generateDiscoverySurfaces(registryFor([...entries].reverse()))

      assert.deepEqual([...first.files.keys()], [...repeated.files.keys()])
      assert.deepEqual([...first.files.keys()], [...reordered.files.keys()])
      for (const [name, bytes] of first.files) {
        assert.equal(bytes.equals(repeated.files.get(name)), true, name)
        assert.equal(bytes.equals(reordered.files.get(name)), true, name)
      }
      assert.deepEqual(registry, before)
    },
  ), { numRuns: PROPERTY_RUNS })
})

// Feature: discoverability-ip-protection, Property 6: Counts are bounded and monotonic.
test('Property 6: adding one valid public entry never lowers or overflows a surface count', () => {
  fc.assert(fc.property(
    fc.integer({ min: 0, max: 1_000 }),
    fc.integer({ min: 0, max: TIERS.length - 1 }),
    (count, offset) => {
      const entries = tiersFromCount(count, offset).map((tier, index) => entryFor(tier, index))
      const before = generateDiscoverySurfaces(registryFor(entries))
      const after = generateDiscoverySurfaces(registryFor([
        ...entries,
        entryFor('public-discoverable', 10_000),
      ]))
      for (const name of DISCOVERY_SURFACE_FILES) {
        const beforeCount = parsedIds(name, before.files.get(name)).length
        const afterCount = parsedIds(name, after.files.get(name)).length
        assert.equal(beforeCount <= entries.length, true, name)
        assert.equal(afterCount >= beforeCount, true, name)
        assert.equal(afterCount <= entries.length + 1, true, name)
      }
    },
  ), { numRuns: PROPERTY_RUNS })
})

const protectedValue = fc.stringMatching(/^[A-Za-z0-9_-]{16,48}$/u)

// Feature: discoverability-ip-protection, Property 7: Protected material is absent and injected leaks block.
test('Property 7: protected values stay out of every output and leaked ids block every discovery file', () => {
  fc.assert(fc.property(
    protectedValue,
    fc.constantFrom('private', 'gated'),
    (secret, protectedTier) => {
      const protectedEntry = entryFor(protectedTier, 1, {
        notes: `prompt=${secret}`,
        title: secret,
        summary: secret,
        provenanceRef: secret,
      })
      const registry = registryFor([
        entryFor('public-discoverable', 0),
        protectedEntry,
      ])
      const generated = generateDiscoverySurfaces(registry)
      for (const bytes of generated.files.values()) {
        assert.equal(bytes.includes(Buffer.from(secret)), false)
      }

      const parsedFiles = DISCOVERY_SURFACE_FILES.map(name => ({
        name,
        entries: [{ entryId: protectedEntry.artifactId }],
      }))
      const gate = evaluatePublicationGate({ registry, parsedFiles })
      const leakedBlocks = gate.blocks.filter(block => (
        block.code === 'FC-GATED-LISTED'
        && block.subject === protectedEntry.artifactId
        && block.recordedTier === protectedTier
      ))
      assert.equal(gate.decision, 'block')
      assert.equal(leakedBlocks.length, DISCOVERY_SURFACE_FILES.length)
    },
  ), { numRuns: PROPERTY_RUNS })
})

const gatedPath = fc.stringMatching(/^\/api\/[a-z][a-z0-9/-]{2,24}$/u)

// Feature: discoverability-ip-protection, Property 8: Every gated route has a disallow directive.
test('Property 8: removed randomized gated disallows are detected as the exact omitted set', () => {
  fc.assert(fc.property(
    fc.uniqueArray(gatedPath, { minLength: 1, maxLength: 30 }),
    fc.nat(),
    (paths, seed) => {
      const registry = registryFor(paths.map((routePath, index) => (
        entryFor('gated', index, { path: routePath })
      )))
      const generated = generateDiscoverySurfaces(registry)
      const robots = generated.files.get('robots.txt').toString('utf8')
      const ordered = [...paths].sort()
      const removalCount = 1 + (seed % ordered.length)
      const removed = ordered.slice(0, removalCount)
      const candidate = robots
        .split('\n')
        .filter(line => !removed.includes(line.slice('Disallow: '.length)))
        .join('\n')
      const parsed = parseDiscoveryFile('robots.txt', candidate)
      assert.equal(parsed.error, undefined)
      const actual = new Set(parsed.crawlControls.disallowedPaths)
      const omitted = ordered.filter(routePath => !actual.has(routePath))
      assert.deepEqual(omitted, removed)

      const gate = evaluatePublicationGate({
        registry,
        routes: { omittedGatedRoutes: omitted },
      })
      assert.deepEqual(
        new Set(gate.blocks
          .filter(block => block.code === 'FC-ROBOTS-OMISSION')
          .map(block => block.subject)),
        new Set(removed),
      )
    },
  ), { numRuns: PROPERTY_RUNS })
})

const invalidMetadataCases = {
  'empty-title': { field: 'title', value: '' },
  'long-title': { field: 'title', value: 't'.repeat(81) },
  'empty-summary': { field: 'summary', value: '' },
  'long-summary': { field: 'summary', value: 's'.repeat(201) },
  'multiline-summary': { field: 'summary', value: 'first\nsecond' },
  'invalid-canonical': { field: 'canonicalUrl', value: 'https://wrong-origin.example/artifact' },
  'missing-license': { field: 'licenseId', value: '' },
  'invalid-date': { field: 'lastModified', value: 'not-a-date' },
}

// Feature: discoverability-ip-protection, Property 9: Metadata is complete or omitted with an error.
test('Property 9: each randomized invalid metadata boundary is omitted without suppressing valid peers', () => {
  fc.assert(fc.property(
    fc.constantFrom(...Object.keys(invalidMetadataCases)),
    fc.nat({ max: 1_000_000 }),
    (caseName, seed) => {
      const mutation = invalidMetadataCases[caseName]
      const invalid = entryFor('public-discoverable', seed + 1)
      invalid[mutation.field] = mutation.value
      const valid = entryFor('public-discoverable', 0)
      const generated = generateDiscoverySurfaces(registryFor([valid, invalid]))
      const llmsIds = parsedIds('llms.txt', generated.files.get('llms.txt'))
      assert.deepEqual(llmsIds, [valid.artifactId])
      assert.equal(
        generated.generationErrors.some(error => (
          error.artifactId === invalid.artifactId
          && error.field === mutation.field
        )),
        true,
      )

      const openApi = JSON.parse(generated.files.get('openapi.json'))
      const operation = openApi.paths[valid.path].get
      assert.match(operation['x-request-schema'], /^https:\/\/airvio\.co\//u)
      assert.match(operation['x-response-schema'], /^https:\/\/airvio\.co\//u)
    },
  ), { numRuns: PROPERTY_RUNS })
})

// Feature: discoverability-ip-protection, Property 20: Parse errors locate the first bad line.
test('Property 20: randomized NUL corruption is located, non-mutating, and gate-blocking', () => {
  const generated = generateDiscoverySurfaces(registryFor([
    entryFor('public-discoverable', 0),
  ]))
  fc.assert(fc.property(
    fc.constantFrom(...DISCOVERY_SURFACE_FILES),
    fc.nat(),
    (name, seed) => {
      const original = generated.files.get(name)
      const lines = original.toString('utf8').split('\n')
      const lineIndex = seed % lines.length
      const corruptedLines = [...lines]
      corruptedLines[lineIndex] = `${corruptedLines[lineIndex]}\u0000`
      const corrupted = Buffer.from(corruptedLines.join('\n'))
      const before = Buffer.from(corrupted)
      const parsed = parseDiscoveryFile(name, corrupted)

      assert.deepEqual(parsed.entries, [])
      assert.equal(parsed.error.file, name)
      assert.equal(parsed.error.line, lineIndex + 1)
      assert.equal(corrupted.equals(before), true)
      const gate = evaluatePublicationGate({
        registry: { entries: [] },
        parsedFiles: [{ name, ...parsed }],
      })
      const block = gate.blocks.find(candidate => candidate.code === 'FC-PARSE')
      assert.equal(gate.decision, 'block')
      assert.equal(block.subject, name)
      assert.match(block.detail, new RegExp(`\\b${lineIndex + 1}$`, 'u'))
    },
  ), { numRuns: PROPERTY_RUNS })
})
