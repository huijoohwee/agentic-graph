import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import fc from 'fast-check'

import { SURFACE_TIER_RESTRICTIVENESS } from '../constants.mjs'
import { evaluatePublicationGate } from '../publication-gate.mjs'
import { validateRegistry } from '../registry-validate.mjs'
import { classifyPath } from '../route-classify.mjs'

const PROPERTY_RUNS = 100
const repositoryRoot = path.resolve(import.meta.dirname, '../../..')
const seededRegistry = JSON.parse(await readFile(
  path.join(repositoryRoot, 'config/surface-registry.json'),
  'utf8',
))

const entriesMatching = predicate => seededRegistry.entries.filter(predicate)

const mutationCases = {
  'unknown-tier': {
    candidates: entriesMatching(() => true),
    apply: entry => {
      entry.surfaceTier = 'world-readable'
    },
    code: 'UNKNOWN_TIER',
    field: 'surfaceTier',
  },
  'multi-tier': {
    candidates: entriesMatching(() => true),
    apply: entry => {
      entry.surfaceTier = ['private', 'public-discoverable']
    },
    code: 'MULTI_TIER',
    field: 'surfaceTier',
  },
  'missing-policy': {
    candidates: entriesMatching(() => true),
    apply: entry => {
      entry.publishPolicy = ''
    },
    code: 'MISSING_FIELD',
    field: 'publishPolicy',
  },
  'private-class-public': {
    candidates: entriesMatching(entry => entry.artifactClass === 'application-source'),
    apply: entry => {
      entry.surfaceTier = 'public-discoverable'
    },
    code: 'CLASS_TIER_VIOLATION',
    field: 'surfaceTier',
  },
  'private-repository-public': {
    candidates: entriesMatching(entry => ['dev', 'worker'].includes(entry.owningRepository)),
    apply: entry => {
      entry.repositoryVisibility = 'public'
    },
    code: 'REPO_VISIBILITY',
    field: 'repositoryVisibility',
  },
  'public-without-license': {
    candidates: entriesMatching(entry => entry.surfaceTier.startsWith('public-')),
    apply: entry => {
      entry.licenseId = ''
    },
    code: 'MISSING_FIELD',
    field: 'licenseId',
  },
}

// Feature: discoverability-ip-protection, Property 1: Registry legality is total and fail-closed.
test('Property 1: every randomized illegal registry mutation is located and blocks publication', () => {
  fc.assert(fc.property(
    fc.constantFrom(...Object.keys(mutationCases)),
    fc.nat(),
    (caseName, seed) => {
      const mutation = mutationCases[caseName]
      assert.ok(mutation.candidates.length > 0, `seed registry has no ${caseName} candidate`)
      const source = mutation.candidates[seed % mutation.candidates.length]
      const registry = structuredClone(seededRegistry)
      const entry = registry.entries.find(candidate => candidate.artifactId === source.artifactId)
      mutation.apply(entry)

      const validation = validateRegistry(registry)
      const located = validation.violations.filter(violation => (
        violation.artifactId === entry.artifactId
        && violation.code === mutation.code
        && violation.field === mutation.field
      ))
      assert.equal(validation.ok, false)
      assert.equal(located.length, 1)

      const gate = evaluatePublicationGate({ registry, registryValidation: validation })
      assert.equal(gate.decision, 'block')
      assert.equal(
        gate.blocks.some(block => (
          block.code === 'FC-REGISTRY-ILLEGAL'
          && block.subject === entry.artifactId
          && block.field === mutation.field
        )),
        true,
      )
    },
  ), { numRuns: PROPERTY_RUNS })
})

const routeSegment = fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/u)
const nearMissKind = fc.constantFrom(
  'trailing-slash',
  'suffix',
  'case',
  'dot-segment',
  'glob-literal',
  'unicode-homoglyph',
)

const nearMissFor = (registeredPath, kind) => {
  if (kind === 'trailing-slash') return `${registeredPath}/`
  if (kind === 'suffix') return `${registeredPath}-other`
  if (kind === 'case') return registeredPath.toUpperCase()
  if (kind === 'dot-segment') return `${registeredPath}/../escape`
  if (kind === 'glob-literal') return `${registeredPath}/*`
  return `${registeredPath}\u2044other`
}

// Feature: discoverability-ip-protection, Property 2: Unclassified input resolves to private and blocks.
test('Property 2: randomized path near-misses resolve private and are named by the gate', () => {
  fc.assert(fc.property(routeSegment, nearMissKind, (segment, kind) => {
    const registeredPath = `/registered/${segment}`
    const candidatePath = nearMissFor(registeredPath, kind)
    assert.notEqual(candidatePath, registeredPath)
    const registry = {
      entries: [{
        artifactId: `private-${segment}`,
        path: registeredPath,
        pathKind: 'exact',
        surfaceTier: 'private',
      }],
    }

    const classification = classifyPath(registry, candidatePath)
    assert.deepEqual(classification, {
      path: candidatePath,
      tier: 'private',
      executionRoute: 'none',
      classified: false,
      artifactId: null,
    })

    const gate = evaluatePublicationGate({
      registry,
      candidatePaths: [candidatePath],
      classification: { resolved: [], unclassified: [candidatePath] },
      scanResult: { complete: true, scannedCount: 1, matches: [] },
    })
    assert.equal(gate.decision, 'block')
    assert.equal(
      gate.blocks.some(block => block.code === 'FC-UNCLASSIFIED' && block.subject === candidatePath),
      true,
    )
  }), { numRuns: PROPERTY_RUNS })
})

const tierArbitrary = fc.uniqueArray(
  fc.constantFrom('private', 'gated', 'public-artifact', 'public-discoverable'),
  { minLength: 1, maxLength: 4 },
)

const shuffledBy = (values, scores) => values
  .map((value, index) => ({ value, score: scores[index] ?? 0, index }))
  .sort((left, right) => left.score - right.score || left.index - right.index)
  .map(item => item.value)

const entry = (artifactId, pathValue, surfaceTier, pathKind = 'exact') => ({
  artifactId,
  path: pathValue,
  pathKind,
  surfaceTier,
})

// Feature: discoverability-ip-protection, Property 3: Multi-class resolution returns the lattice minimum.
test('Property 3: matching-tier order is irrelevant and exact artifacts outrank containing patterns', () => {
  fc.assert(fc.property(
    tierArbitrary,
    fc.array(fc.integer(), { minLength: 4, maxLength: 4 }),
    fc.integer({ min: 1, max: 6 }),
    fc.constantFrom('private', 'gated', 'public-artifact', 'public-discoverable'),
    fc.constantFrom('private', 'gated', 'public-artifact', 'public-discoverable'),
    (tiers, scores, depth, directoryTier, artifactTier) => {
      const pathValue = `/${Array.from({ length: depth }, (_, index) => `level-${index}`).join('/')}/item`
      const expected = [...tiers].sort((left, right) => (
        SURFACE_TIER_RESTRICTIVENESS[right] - SURFACE_TIER_RESTRICTIVENESS[left]
      ))[0]
      const makeRegistry = ordered => ({
        entries: ordered.map((surfaceTier, index) => (
          entry(`match-${index}-${surfaceTier}`, pathValue, surfaceTier)
        )),
      })

      assert.equal(classifyPath(makeRegistry(tiers), pathValue).tier, expected)
      assert.equal(
        classifyPath(makeRegistry(shuffledBy(tiers, scores)), pathValue).tier,
        expected,
      )

      const directoryPattern = `/${Array.from({ length: depth }, (_, index) => `level-${index}`).join('/')}/**`
      const nested = {
        entries: [
          entry('directory', directoryPattern, directoryTier, 'glob'),
          entry('artifact', pathValue, artifactTier),
        ],
      }
      assert.equal(classifyPath(nested, pathValue).tier, artifactTier)
      assert.equal(classifyPath({ entries: [...nested.entries].reverse() }, pathValue).tier, artifactTier)
    },
  ), { numRuns: PROPERTY_RUNS })
})
