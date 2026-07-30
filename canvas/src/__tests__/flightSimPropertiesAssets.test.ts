import assert from 'node:assert/strict'
import test from 'node:test'
import fc from 'fast-check'
import { flightSimPropertyParameters } from './helpers/flightSimPropertyHarness'
import {
  FLIGHT_SIM_AIRCRAFT_ASSET_SPEC,
  readFlightSimAircraftAssetSpec,
} from '@/features/game-flight-sim/assetSpec/flightSimAssetSpec'
import {
  FLIGHT_SIM_FALLBACK_DIRECTORY,
  FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK,
  FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID,
  FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
  loadFlightSimAssets,
  readBundledFlightSimCommittedLocalAsset,
  type FlightSimAssetCandidate,
  type FlightSimGlbFallbackReference,
} from '@/features/game-flight-sim/assetSpec/flightSimAssetLoader'

const identifierArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/)
const labelArbitrary = fc.stringMatching(/^[A-Z][A-Za-z0-9_-]{0,20}$/)
const positiveDimensionArbitrary = fc.integer({ min: 1, max: 100_000 })
  .map(value => value / 1_000)
const vectorArbitrary = fc.tuple(
  positiveDimensionArbitrary,
  positiveDimensionArbitrary,
  positiveDimensionArbitrary,
)
const colorArbitrary = fc.integer({ min: 0, max: 0xffffff })
  .map(value => `#${value.toString(16).padStart(6, '0')}`)

const validAssetSpecArbitrary = fc.record({
  label: labelArbitrary,
  dimensionsMeters: vectorArbitrary,
  collisionHalfSizeMeters: vectorArbitrary,
  defaultColor: colorArbitrary,
}).map(fields => ({
  ...FLIGHT_SIM_AIRCRAFT_ASSET_SPEC,
  ...fields,
}))

const localFallbackPathArbitrary = identifierArbitrary.map(
  identifier => `${FLIGHT_SIM_FALLBACK_DIRECTORY}property-${identifier}.glb`,
)

const aircraftFallbackArbitrary = localFallbackPathArbitrary.map(path => ({
  ...FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK,
  subjectId: FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
  path,
}))

type InvalidAssetSpecCase = Readonly<{
  assetSpecPresent: boolean
  assetSpec?: unknown
}>

const missingFieldArbitrary = fc.tuple(
  validAssetSpecArbitrary,
  fc.constantFrom(
    'schema',
    'id',
    'label',
    'representation',
    'renderer',
    'shape',
    'dimensionsMeters',
    'collisionHalfSizeMeters',
    'defaultColor',
    'opaqueBinaryFallback',
    'runtimeModelCalls',
    'runtimeNetworkCalls',
  ),
).map(([assetSpec, field]) => {
  const invalid = { ...assetSpec } as Record<string, unknown>
  delete invalid[field]
  return { assetSpecPresent: true, assetSpec: invalid } as InvalidAssetSpecCase
})

const nonPositiveSizeArbitrary = fc.tuple(
  validAssetSpecArbitrary,
  fc.constantFrom('dimensionsMeters', 'collisionHalfSizeMeters'),
  fc.integer({ min: 0, max: 2 }),
  fc.constantFrom(0, -1, -0.001),
).map(([assetSpec, field, axis, value]) => {
  const invalidVector = [...assetSpec[field]]
  invalidVector[axis] = value
  return {
    assetSpecPresent: true,
    assetSpec: { ...assetSpec, [field]: invalidVector },
  } as InvalidAssetSpecCase
})

const nonNullOpaqueFallbackArbitrary = validAssetSpecArbitrary.map(assetSpec => ({
  assetSpecPresent: true,
  assetSpec: { ...assetSpec, opaqueBinaryFallback: { opaque: true } },
}) as InvalidAssetSpecCase)

const unknownFieldArbitrary = fc.tuple(
  validAssetSpecArbitrary,
  identifierArbitrary,
).map(([assetSpec, value]) => ({
  assetSpecPresent: true,
  assetSpec: { ...assetSpec, unexpectedProperty: value },
}) as InvalidAssetSpecCase)

const mismatchedIdentityArbitrary = fc.tuple(
  validAssetSpecArbitrary,
  fc.constantFrom('id', 'shape', 'renderer'),
).map(([assetSpec, field]) => ({
  assetSpecPresent: true,
  assetSpec: {
    ...assetSpec,
    [field]: field === 'id'
      ? 'vehicle-helicopter'
      : field === 'shape'
        ? 'helicopter'
        : 'external-renderer',
  },
}) as InvalidAssetSpecCase)

const invalidAssetSpecCaseArbitrary = fc.oneof(
  missingFieldArbitrary,
  nonPositiveSizeArbitrary,
  nonNullOpaqueFallbackArbitrary,
  unknownFieldArbitrary,
  mismatchedIdentityArbitrary,
  fc.constant({ assetSpecPresent: false } as InvalidAssetSpecCase),
)

const localFallbackOutcomeArbitrary = fc.constantFrom(
  'loaded',
  'missing',
  'unreadable',
)

const remoteFallbackPathArbitrary = fc.oneof(
  fc.webUrl(),
  fc.domain().map(domain => `//${domain}/flight-property.glb`),
)

const bundledGlb = readBundledFlightSimCommittedLocalAsset(
  FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK.path,
)
if (!bundledGlb) throw new Error('Flight Sim property suite requires the bundled optional GLB')
const validGlbBytes = Uint8Array.from(bundledGlb)

function installFetchProbe() {
  const previousFetch = globalThis.fetch
  let callCount = 0
  globalThis.fetch = (() => {
    callCount += 1
    throw new Error('Flight Sim property attempted a network fetch')
  }) as typeof globalThis.fetch
  return Object.freeze({
    calls: () => callCount,
    restore: () => {
      globalThis.fetch = previousFetch
    },
  })
}

function fallbackForSubject(
  subjectId: string,
  sourcePath: string,
): FlightSimGlbFallbackReference {
  return Object.freeze({
    ...FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK,
    subjectId,
    path: sourcePath,
  })
}

// Feature: knowgrph-game-flight-sim, Property 18 - Asset_Spec preference over GLB fallback
test('Feature: knowgrph-game-flight-sim, Property 18 - Asset_Spec preference over GLB fallback', () => {
  const fetchProbe = installFetchProbe()
  try {
    fc.assert(
      fc.property(
        validAssetSpecArbitrary,
        aircraftFallbackArbitrary,
        (assetSpec, glbFallback) => {
          let localReadCount = 0
          const report = loadFlightSimAssets([{
            subjectId: FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
            assetSpec,
            glbFallback,
          }], {
            readCommittedLocalAsset: () => {
              localReadCount += 1
              return validGlbBytes
            },
          })
          assert.equal(localReadCount, 0)
          assert.equal(fetchProbe.calls(), 0)
          assert.deepEqual(report.errors, [])
          assert.equal(report.loaded.length, 1)
          assert.equal(report.loaded[0]?.kind, 'asset-spec')
          assert.equal(report.loaded[0]?.subjectId, FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID)
          assert.equal(report.glbFallbackCount, 0)
          assert.equal(report.requiredAircraftGlbFallbackCount, 0)
        },
      ),
      flightSimPropertyParameters(18),
    )
  } finally {
    fetchProbe.restore()
  }
})

// Feature: knowgrph-game-flight-sim, Property 19 - Valid Asset_Spec resolves offline from in-repo data
test('Feature: knowgrph-game-flight-sim, Property 19 - Valid Asset_Spec resolves offline from in-repo data', () => {
  const fetchProbe = installFetchProbe()
  try {
    fc.assert(
      fc.property(validAssetSpecArbitrary, assetSpec => {
        let localReadCount = 0
        const validated = readFlightSimAircraftAssetSpec(assetSpec)
        const report = loadFlightSimAssets([{
          subjectId: FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
          assetSpec,
        }], {
          readCommittedLocalAsset: () => {
            localReadCount += 1
            return validGlbBytes
          },
        })
        assert.equal(localReadCount, 0)
        assert.equal(fetchProbe.calls(), 0)
        assert.equal(validated.id, FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID)
        assert.equal(validated.renderer, 'xr-procedural-vehicle')
        assert.equal(validated.shape, 'airplane')
        assert.ok(validated.label.length > 0)
        assert.ok(validated.defaultColor.length > 0)
        assert.ok(validated.dimensionsMeters.every(value => value > 0))
        assert.ok(validated.collisionHalfSizeMeters.every(value => value > 0))
        assert.equal(validated.runtimeModelCalls, 0)
        assert.equal(validated.runtimeNetworkCalls, 0)
        assert.deepEqual(report.errors, [])
        assert.equal(report.loaded[0]?.kind, 'asset-spec')
        assert.equal(report.glbFallbackCount, 0)
      }),
      flightSimPropertyParameters(19),
    )
  } finally {
    fetchProbe.restore()
  }
})

// Feature: knowgrph-game-flight-sim, Property 20 - Asset_Spec validation fails closed
test('Feature: knowgrph-game-flight-sim, Property 20 - Asset_Spec validation fails closed', () => {
  const fetchProbe = installFetchProbe()
  try {
    fc.assert(
      fc.property(invalidAssetSpecCaseArbitrary, invalidCase => {
        let localReadCount = 0
        const candidate: FlightSimAssetCandidate = {
          subjectId: FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
          ...(invalidCase.assetSpecPresent ? { assetSpec: invalidCase.assetSpec } : {}),
          glbFallback: {
            ...FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK,
            subjectId: FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
          },
        }
        if (invalidCase.assetSpecPresent) {
          assert.throws(() => readFlightSimAircraftAssetSpec(invalidCase.assetSpec))
        }
        const report = loadFlightSimAssets([candidate], {
          readCommittedLocalAsset: () => {
            localReadCount += 1
            return validGlbBytes
          },
        })
        assert.equal(localReadCount, 0)
        assert.equal(fetchProbe.calls(), 0)
        assert.equal(report.loaded.length, 0)
        assert.equal(report.glbFallbackCount, 0)
        assert.equal(report.requiredAircraftGlbFallbackCount, 0)
        assert.equal(
          report.errors[0]?.code,
          invalidCase.assetSpecPresent
            ? 'invalid-asset-spec'
            : 'missing-required-asset-spec',
        )
        assert.match(
          report.errors[0]?.message || '',
          new RegExp(FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID),
        )
      }),
      flightSimPropertyParameters(20),
    )
  } finally {
    fetchProbe.restore()
  }
})

// Feature: knowgrph-game-flight-sim, Property 21 - GLB fallback is opaque, local, and correctly counted
test('Feature: knowgrph-game-flight-sim, Property 21 - GLB fallback is opaque, local, and correctly counted', () => {
  const fetchProbe = installFetchProbe()
  try {
    fc.assert(
      fc.property(localFallbackOutcomeArbitrary, outcome => {
        let localReadCount = 0
        const report = loadFlightSimAssets([{
          subjectId: FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID,
          glbFallback: FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK,
        }], {
          readCommittedLocalAsset: sourcePath => {
            assert.equal(
              sourcePath,
              FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK.path,
            )
            localReadCount += 1
            if (outcome === 'loaded') return validGlbBytes
            if (outcome === 'unreadable') throw new Error('property unreadable local file')
            return null
          },
        })
        const loadedCount = outcome === 'loaded' ? 1 : 0
        assert.equal(fetchProbe.calls(), 0)
        assert.equal(report.subjects.length, 1)
        assert.equal(report.glbFallbackCount, loadedCount)
        assert.equal(report.loaded.length, loadedCount)
        assert.equal(report.errors.length, 1 - loadedCount)
        assert.ok(Number.isInteger(report.glbFallbackCount))
        assert.ok(report.glbFallbackCount >= 0)
        assert.ok(report.glbFallbackCount <= report.subjects.length)
        assert.ok(report.loaded.every(asset => (
          asset.kind === 'glb-fallback'
          && asset.opaque === true
          && asset.source === 'committed-local-file'
        )))
        assert.equal(localReadCount, 1)
        for (const error of report.errors) {
          assert.equal(error.code, 'unavailable-glb-fallback')
        }
      }),
      flightSimPropertyParameters(21),
    )
  } finally {
    fetchProbe.restore()
  }
})

// Feature: knowgrph-game-flight-sim, Property 22 - Remote GLB references are rejected without fetch
test('Feature: knowgrph-game-flight-sim, Property 22 - Remote GLB references are rejected without fetch', () => {
  const fetchProbe = installFetchProbe()
  try {
    fc.assert(
      fc.property(
        identifierArbitrary,
        remoteFallbackPathArbitrary,
        (identifier, remotePath) => {
          let localReadCount = 0
          const subjectId = `${FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID}-${identifier}`
          const report = loadFlightSimAssets([{
            subjectId,
            glbFallback: fallbackForSubject(subjectId, remotePath),
          }], {
            readCommittedLocalAsset: () => {
              localReadCount += 1
              return validGlbBytes
            },
          })
          assert.equal(localReadCount, 0)
          assert.equal(fetchProbe.calls(), 0)
          assert.equal(report.loaded.length, 0)
          assert.equal(report.glbFallbackCount, 0)
          assert.equal(report.errors.length, 1)
          assert.equal(report.errors[0]?.subjectId, subjectId)
          assert.equal(report.errors[0]?.code, 'remote-glb-fallback')
          assert.match(
            report.errors[0]?.message || '',
            /remote GLB fallback is not permitted/,
          )
        },
      ),
      flightSimPropertyParameters(22),
    )
  } finally {
    fetchProbe.restore()
  }
})
