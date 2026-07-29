import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import fc from 'fast-check'

import {
  assembleCatalog,
  calculateCatalogDigest,
} from '../invocation-assemble.mjs'
import {
  renderDeclaration,
  resolveLicense,
  validateLicenseRegistry,
} from '../license-registry.mjs'

const PROPERTY_RUNS = 100
const repositoryRoot = path.resolve(import.meta.dirname, '../../..')
const seededLicenseRegistry = JSON.parse(await readFile(
  path.join(repositoryRoot, 'config/license-registry.json'),
  'utf8',
))

const tokenArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{2,18}$/u)
const sourceArbitrary = fc.record({
  name: fc.stringMatching(/^[a-z][a-z0-9-]{2,12}$/u),
  devOnly: fc.boolean(),
  approved: fc.boolean(),
  unreachable: fc.boolean(),
  tokens: fc.uniqueArray(tokenArbitrary, { maxLength: 8 }),
})

const sourceFor = (candidate, index) => ({
  catalogId: `${candidate.name}-${index}`,
  ...(candidate.devOnly ? { publishPolicy: 'dev-only' } : {}),
  ...(candidate.unreachable ? { unreachable: true } : {}),
  entries: candidate.tokens.map(token => ({
    token: `/${token}`,
    prefixRole: 'action',
    label: `Action ${token}`,
    intentSummary: `Execute the ${token} action through the control plane.`,
    executionRouteTier: 'gated',
    ingressRoute: 'invocation-forwarder',
    targetExecutionRoute: 'control-plane-mcp',
    spendBearing: false,
  })),
})

// Feature: discoverability-ip-protection, Property 13: Catalog digest is order-independent.
test('Property 13: source and entry permutations preserve policy-filtered catalog content and digest', () => {
  fc.assert(fc.property(
    fc.array(sourceArbitrary, { minLength: 1, maxLength: 8 }),
    candidates => {
      const sources = candidates.map(sourceFor)
      const approvedCatalogIds = candidates
        .map((candidate, index) => ({ candidate, catalogId: sources[index].catalogId }))
        .filter(({ candidate }) => candidate.approved)
        .map(({ catalogId }) => catalogId)
      const reversed = sources
        .map(source => ({ ...source, entries: [...source.entries].reverse() }))
        .reverse()
      const forward = assembleCatalog(sources, { approvedCatalogIds })
      const backward = assembleCatalog(reversed, { approvedCatalogIds })

      assert.deepEqual(forward.entries, backward.entries)
      assert.equal(forward.digest, backward.digest)
      assert.equal(forward.digest, calculateCatalogDigest(forward.entries))
      assert.deepEqual(forward.validationFailures, backward.validationFailures)
      assert.deepEqual(
        forward.unreachableSources,
        sources.filter(source => source.unreachable).map(source => source.catalogId).sort(),
      )

      const excludedCatalogs = new Set(sources
        .filter(source => (
          source.publishPolicy === 'dev-only'
          && !approvedCatalogIds.includes(source.catalogId)
        ))
        .map(source => source.catalogId))
      for (const entry of forward.entries) {
        assert.equal(entry.token, entry.token.trim())
        assert.equal(entry.sourceCatalogs.some(name => excludedCatalogs.has(name)), false)
      }
      const withoutExcluded = assembleCatalog(
        sources.filter(source => !excludedCatalogs.has(source.catalogId)),
        { approvedCatalogIds },
      )
      assert.equal(forward.digest, withoutExcluded.digest)
    },
  ), { numRuns: PROPERTY_RUNS })
})

const mandatoryMutationClasses = [
  'published-document',
  'machine-readable-metadata',
  'bundled-build-output',
]
const licenseMutation = fc.constantFrom(
  'remove-mapping',
  'duplicate-mapping',
  'wrong-mandatory-license',
  'wrong-category',
)

const declarationClasses = declaration => (
  declaration
    .split('\n')
    .map(line => line.match(/^\| ([^|]+) \| [^|]+ \| [^|]+ \|$/u)?.[1]?.trim())
    .filter(Boolean)
    .filter(value => value !== 'Artifact class' && value !== '---')
)

// Feature: discoverability-ip-protection, Property 14: License assignment is total and single-valued.
test('Property 14: randomized license mutations break exactly the required total/single-category invariants', () => {
  fc.assert(fc.property(licenseMutation, fc.nat(), (mutation, seed) => {
    const base = structuredClone(seededLicenseRegistry)
    const surfaceRegistry = {
      entries: base.classMappings.map(mapping => ({ artifactClass: mapping.artifactClass })),
    }
    assert.deepEqual(validateLicenseRegistry(base, surfaceRegistry), {
      ok: true,
      violations: [],
    })
    for (const mapping of base.classMappings) {
      assert.deepEqual(resolveLicense(mapping.artifactClass, base), {
        licenseId: mapping.licenseId,
        category: mapping.category,
      })
    }
    assert.deepEqual(
      declarationClasses(renderDeclaration(base)).sort(),
      base.classMappings.map(mapping => mapping.artifactClass).sort(),
    )

    const mutated = structuredClone(base)
    let artifactClass
    let expectedCode
    if (mutation === 'wrong-mandatory-license') {
      artifactClass = mandatoryMutationClasses[seed % mandatoryMutationClasses.length]
      const mapping = mutated.classMappings.find(candidate => candidate.artifactClass === artifactClass)
      mapping.licenseId = mapping.licenseId === 'Apache-2.0' ? 'CC-BY-4.0' : 'Apache-2.0'
      mapping.category = 'permissive'
      expectedCode = 'MANDATORY_LICENSE'
    } else {
      const index = seed % mutated.classMappings.length
      artifactClass = mutated.classMappings[index].artifactClass
      if (mutation === 'remove-mapping') {
        mutated.classMappings.splice(index, 1)
        expectedCode = 'UNCATEGORIZED_CLASS'
      } else if (mutation === 'duplicate-mapping') {
        mutated.classMappings.push({ ...mutated.classMappings[index] })
        expectedCode = 'DOUBLE_CATEGORIZED_CLASS'
      } else {
        const license = mutated.licenses[seed % mutated.licenses.length]
        artifactClass = license.licenseId
        license.category = license.category === 'permissive' ? 'no-reuse' : 'permissive'
        expectedCode = 'LICENSE_CATEGORY'
      }
    }

    const result = validateLicenseRegistry(mutated, surfaceRegistry)
    assert.equal(result.ok, false)
    assert.equal(
      result.violations.some(violation => (
        violation.code === expectedCode
        && violation.artifactClass === artifactClass
      )),
      true,
    )
    if (mutation === 'remove-mapping' || mutation === 'duplicate-mapping') {
      assert.deepEqual(resolveLicense(artifactClass, mutated), {
        licenseId: null,
        category: null,
      })
    }
  }), { numRuns: PROPERTY_RUNS })
})
