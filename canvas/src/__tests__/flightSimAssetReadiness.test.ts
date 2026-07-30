import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectGlbBytes } from '../lib/assets/gltfFormat'
import {
  FLIGHT_SIM_AIRCRAFT_ASSET_SPEC,
  FLIGHT_SIM_REQUIRED_AIRCRAFT_GLB_FALLBACK_COUNT,
} from '../features/game-flight-sim/assetSpec/flightSimAssetSpec'
import {
  FLIGHT_SIM_DEFAULT_ASSET_CANDIDATES,
  FLIGHT_SIM_FALLBACK_DIRECTORY,
  FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK,
  FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID,
  FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
  loadFlightSimAssets,
  readBundledFlightSimCommittedLocalAsset,
  type FlightSimGlbFallbackReference,
} from '../features/game-flight-sim/assetSpec/flightSimAssetLoader'
import {
  readFlightSimDefaultAssetLoadReport,
} from '../features/game-flight-sim/assetSpec/flightSimDefaultAssets'

function fallback(path: string): FlightSimGlbFallbackReference {
  return Object.freeze({
    ...FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK,
    path,
  })
}

test('Flight asset loading keeps the aircraft spec primary and loads one opaque optional prop', () => {
  const { report, aircraft, optionalBeacon } =
    readFlightSimDefaultAssetLoadReport()
  assert.deepEqual(report.errors, [])
  assert.equal(report.glbFallbackCount, 1)
  assert.equal(report.requiredAircraftGlbFallbackCount, 0)
  assert.equal(FLIGHT_SIM_REQUIRED_AIRCRAFT_GLB_FALLBACK_COUNT, 0)
  assert.deepEqual(
    report.loaded.map(asset => [asset.subjectId, asset.kind, asset.opaque]),
    [
      [FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID, 'asset-spec', false],
      [FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID, 'glb-fallback', true],
    ],
  )
  const optional = report.loaded[1]
  assert.equal(optional.kind, 'glb-fallback')
  if (optional.kind !== 'glb-fallback') return
  const inspection = inspectGlbBytes(Uint8Array.from(optional.bytes))
  assert.equal(inspection.validContainer, true)
  assert.equal(inspection.externalResourceUris.length, 0)
  assert.equal(optional.source, 'committed-local-file')
  assert.equal(optional.license, 'CC0-1.0')
  assert.equal(aircraft.assetSpec.id, FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID)
  assert.equal(optionalBeacon.path, optional.path)
})

test('a valid aircraft spec wins without reading an available fallback', () => {
  let localReads = 0
  const report = loadFlightSimAssets([{
    subjectId: FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
    assetSpec: FLIGHT_SIM_AIRCRAFT_ASSET_SPEC,
    glbFallback: {
      ...FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK,
      subjectId: FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
    },
  }], {
    readCommittedLocalAsset: () => {
      localReads += 1
      throw new Error('the aircraft fallback must not be read')
    },
  })
  assert.equal(localReads, 0)
  assert.deepEqual(report.errors, [])
  assert.equal(report.loaded[0]?.kind, 'asset-spec')
  assert.equal(report.glbFallbackCount, 0)
})

test('an invalid aircraft spec fails closed without falling through to GLB', () => {
  let localReads = 0
  const report = loadFlightSimAssets([{
    subjectId: FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
    assetSpec: {
      ...FLIGHT_SIM_AIRCRAFT_ASSET_SPEC,
      unexpected: true,
    },
    glbFallback: {
      ...FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK,
      subjectId: FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
    },
  }], {
    readCommittedLocalAsset: () => {
      localReads += 1
      return new Uint8Array()
    },
  })
  assert.equal(localReads, 0)
  assert.equal(report.loaded.length, 0)
  assert.equal(report.glbFallbackCount, 0)
  assert.equal(report.errors[0]?.code, 'invalid-asset-spec')
  assert.match(report.errors[0]?.message || '', /vehicle-airplane/)
})

test('the required aircraft cannot substitute a GLB when its spec is absent', () => {
  let localReads = 0
  const report = loadFlightSimAssets([{
    subjectId: FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
    glbFallback: {
      ...FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK,
      subjectId: FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
    },
  }], {
    readCommittedLocalAsset: () => {
      localReads += 1
      return new Uint8Array()
    },
  })
  assert.equal(localReads, 0)
  assert.equal(report.errors[0]?.code, 'missing-required-asset-spec')
  assert.equal(report.requiredAircraftGlbFallbackCount, 0)
})

test('remote, absolute, traversal, and backslash GLB references are rejected without a read', () => {
  const paths = [
    'https://example.test/optional.glb',
    'file:///tmp/optional.glb',
    '//example.test/optional.glb',
    '/tmp/optional.glb',
    `${FLIGHT_SIM_FALLBACK_DIRECTORY}../optional.glb`,
    `${FLIGHT_SIM_FALLBACK_DIRECTORY}nested\\optional.glb`,
  ]
  for (const path of paths) {
    let localReads = 0
    const report = loadFlightSimAssets([{
      subjectId: FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID,
      glbFallback: fallback(path),
    }], {
      readCommittedLocalAsset: () => {
        localReads += 1
        return new Uint8Array()
      },
    })
    assert.equal(localReads, 0, path)
    assert.equal(report.loaded.length, 0, path)
    assert.equal(report.glbFallbackCount, 0, path)
    assert.ok(
      ['invalid-glb-fallback', 'remote-glb-fallback'].includes(report.errors[0]?.code || ''),
      path,
    )
  }
})

test('missing, unreadable, and invalid local GLBs stay unloaded and uncounted', () => {
  const cases = [
    {
      expected: 'unavailable-glb-fallback',
      read: () => null,
    },
    {
      expected: 'unavailable-glb-fallback',
      read: () => {
        throw new Error('permission denied')
      },
    },
    {
      expected: 'invalid-glb-bytes',
      read: () => Uint8Array.from([0, 1, 2, 3]),
    },
  ] as const
  for (const item of cases) {
    const report = loadFlightSimAssets([{
      subjectId: FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID,
      glbFallback: FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK,
    }], {
      readCommittedLocalAsset: item.read,
    })
    assert.equal(report.loaded.length, 0)
    assert.equal(report.glbFallbackCount, 0)
    assert.equal(report.errors[0]?.code, item.expected)
    assert.equal(report.errors[0]?.path, FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK.path)
  }
})

test('hash-drifted fallback metadata or bytes fail closed and remain uncounted', () => {
  let localReads = 0
  const metadataDrift = loadFlightSimAssets([{
    subjectId: FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID,
    glbFallback: {
      ...FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK,
      sha256: '0'.repeat(64),
    },
  }], {
    readCommittedLocalAsset: () => {
      localReads += 1
      return new Uint8Array()
    },
  })
  assert.equal(localReads, 0)
  assert.equal(metadataDrift.glbFallbackCount, 0)
  assert.equal(metadataDrift.errors[0]?.code, 'invalid-glb-fallback')

  const admitted = readBundledFlightSimCommittedLocalAsset(
    FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK.path,
  )
  assert.ok(admitted)
  const driftedBytes = Uint8Array.from(admitted)
  driftedBytes[driftedBytes.length - 1] ^= 1
  const byteDrift = loadFlightSimAssets([{
    subjectId: FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID,
    glbFallback: FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK,
  }], {
    readCommittedLocalAsset: () => driftedBytes,
  })
  assert.equal(byteDrift.loaded.length, 0)
  assert.equal(byteDrift.glbFallbackCount, 0)
  assert.equal(byteDrift.errors[0]?.code, 'invalid-glb-bytes')
  assert.match(byteDrift.errors[0]?.message || '', /SHA-256/)
})

test('an alternate local fallback path or subject is never admitted', () => {
  for (const candidate of [
    {
      subjectId: FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID,
      glbFallback: fallback(`${FLIGHT_SIM_FALLBACK_DIRECTORY}lookalike.glb`),
    },
    {
      subjectId: 'optional-beacon-lookalike',
      glbFallback: {
        ...FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK,
        subjectId: 'optional-beacon-lookalike',
      },
    },
  ]) {
    let localReads = 0
    const report = loadFlightSimAssets([candidate], {
      readCommittedLocalAsset: () => {
        localReads += 1
        return new Uint8Array()
      },
    })
    assert.equal(localReads, 0)
    assert.equal(report.loaded.length, 0)
    assert.equal(report.glbFallbackCount, 0)
    assert.equal(report.errors[0]?.code, 'invalid-glb-fallback')
  }
})

test('an unadmitted local GLB license fails before any file read', () => {
  let localReads = 0
  const report = loadFlightSimAssets([{
    subjectId: FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID,
    glbFallback: {
      ...FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK,
      license: 'LicenseRef-Unknown',
    },
  }], {
    readCommittedLocalAsset: () => {
      localReads += 1
      return new Uint8Array()
    },
  })
  assert.equal(localReads, 0)
  assert.equal(report.loaded.length, 0)
  assert.equal(report.glbFallbackCount, 0)
  assert.equal(report.errors[0]?.code, 'invalid-glb-fallback')
})
