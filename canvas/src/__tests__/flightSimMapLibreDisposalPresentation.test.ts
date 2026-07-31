import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearFlightGeoPresentationAttemptDebug,
  recordFlightGeoStoppedPresentation,
  writeFlightGeoPresentationDebug,
} from '../../../gympgrph/src/features/geospatial/flightGeoPresentationDebug'
import type {
  FlightGeoOverlaySnapshot,
} from '../../../gympgrph/src/flightGeoOverlay'
import {
  clearFlightGeoOverlayFromMap,
  FLIGHT_GEO_OVERLAY_LAYER_ORDER,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre'
import {
  FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
  FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
} from '../../../gympgrph/src/flightGeoEnvironmentMapLibre'
import {
  isFlightGeoMapLibreDisposalPrepared,
  prepareFlightGeoMapLibreForDisposal,
} from '../../../gympgrph/src/features/geospatial/flightGeoMapLibreDisposal'

test('Flight overlay disposal clear is idempotent and never creates a missing source', () => {
  let sourceData: Readonly<{
    type: 'FeatureCollection'
    features: readonly unknown[]
  }> = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature' }],
  }
  let sourceWrites = 0
  let sourceAdds = 0
  const source = {
    serialize: () => ({ data: sourceData }),
    setData: (data: typeof sourceData) => {
      sourceWrites += 1
      sourceData = data
    },
  }
  const map = {
    style: { _loaded: true },
    addSource: () => {
      sourceAdds += 1
    },
    getSource: () => source,
  }

  assert.equal(clearFlightGeoOverlayFromMap(map), true)
  assert.equal(sourceWrites, 1)
  assert.equal(clearFlightGeoOverlayFromMap(map), true)
  assert.equal(sourceWrites, 1, 'an empty source must not be dirtied again')

  assert.equal(
    clearFlightGeoOverlayFromMap({
      ...map,
      getSource: () => null,
    }),
    true,
  )
  assert.equal(sourceAdds, 0, 'disposal must not create a missing source')
})

test('exclusive disposal waits only for loaded empty Flight sources', () => {
  const sourceIds = [
    FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
    FLIGHT_GEO_OVERLAY_SOURCE_ID,
  ]
  const sourceData = new Map<string, {
    type: string
    features: unknown[]
  }>(sourceIds.map(sourceId => [
    sourceId,
    {
      type: 'FeatureCollection',
      features: [{ id: `${sourceId}:feature` }],
    },
  ]))
  const sourceLoaded = new Map(sourceIds.map(sourceId => [sourceId, true]))
  const sourceWrites = new Map(sourceIds.map(sourceId => [sourceId, 0]))
  const hiddenLayers: string[] = []
  const sources = Object.fromEntries(sourceIds.map(sourceId => [
    sourceId,
    {
      loaded: () => sourceLoaded.get(sourceId),
      serialize: () => ({ data: sourceData.get(sourceId) }),
      setData: (data: { type: string; features: unknown[] }) => {
        sourceData.set(sourceId, data)
        sourceLoaded.set(sourceId, false)
        sourceWrites.set(sourceId, (sourceWrites.get(sourceId) || 0) + 1)
      },
    },
  ]))
  const map = {
    getLayer: (layerId: string) => ({ id: layerId }),
    getSource: (sourceId: string) => sources[sourceId],
    getStyle: () => ({
      sources: Object.fromEntries(sourceIds.map(sourceId => [
        sourceId,
        { type: 'geojson' },
      ])),
    }),
    isStyleLoaded: () => false,
    setLayoutProperty: (layerId: string, property: string, value: string) => {
      assert.equal(property, 'visibility')
      assert.equal(value, 'none')
      hiddenLayers.push(layerId)
    },
  }

  assert.equal(prepareFlightGeoMapLibreForDisposal(map), true)
  assert.equal(isFlightGeoMapLibreDisposalPrepared(map), false)
  assert.deepEqual(
    hiddenLayers,
    [
      ...FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
      ...FLIGHT_GEO_OVERLAY_LAYER_ORDER,
    ],
  )
  for (const sourceId of sourceIds) {
    assert.equal(sourceWrites.get(sourceId), 1)
    sourceLoaded.set(sourceId, true)
  }
  assert.equal(
    isFlightGeoMapLibreDisposalPrepared(map),
    true,
    'global provider style loading must not block settled owned sources',
  )

  sourceData.set(FLIGHT_GEO_OVERLAY_SOURCE_ID, {
    type: 'FeatureCollection',
    features: [{ id: 'late' }],
  })
  assert.equal(isFlightGeoMapLibreDisposalPrepared(map), false)
  assert.equal(prepareFlightGeoMapLibreForDisposal(map), true)
  assert.equal(sourceWrites.get(FLIGHT_GEO_OVERLAY_SOURCE_ID), 2)
  assert.equal(
    isFlightGeoMapLibreDisposalPrepared({
      ...map,
      getSource: () => null,
    }),
    false,
    'a style-owned source that cannot be inspected must fail closed',
  )
  assert.equal(
    isFlightGeoMapLibreDisposalPrepared({
      getSource: () => null,
      getStyle: () => ({ sources: {} }),
    }),
    true,
    'an absent owned source is already disposed',
  )
  assert.equal(
    isFlightGeoMapLibreDisposalPrepared({
      ...map,
      getSource: sourceId => ({
        serialize: () => ({
          data: {
            type: 'FeatureCollection',
            features: [],
          },
        }),
        setData: sources[sourceId].setData,
      }),
    }),
    false,
    'a present source without loaded() must fail closed',
  )
  assert.equal(
    isFlightGeoMapLibreDisposalPrepared({
      getSource: () => null,
      getStyle: () => {
        throw new Error('style unavailable')
      },
    }),
    false,
    'an unreadable style cannot prove that an owned source is absent',
  )
})

test('exclusive disposal retries style-owned sources that are not live yet', () => {
  const sourceIds = [
    FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
    FLIGHT_GEO_OVERLAY_SOURCE_ID,
  ]
  let sourcesLive = false
  let sourcesLoaded = true
  const sourceData = new Map<string, {
    type: string
    features: unknown[]
  }>(sourceIds.map(sourceId => [
    sourceId,
    {
      type: 'FeatureCollection',
      features: [{ id: `${sourceId}:pending-style` }],
    },
  ]))
  const sourceWrites = new Map(sourceIds.map(sourceId => [sourceId, 0]))
  const sources = Object.fromEntries(sourceIds.map(sourceId => [
    sourceId,
    {
      loaded: () => sourcesLoaded,
      serialize: () => ({ data: sourceData.get(sourceId) }),
      setData: (data: { type: string; features: unknown[] }) => {
        sourceData.set(sourceId, data)
        sourceWrites.set(sourceId, (sourceWrites.get(sourceId) || 0) + 1)
        sourcesLoaded = false
      },
    },
  ]))
  const map = {
    getLayer: () => null,
    getSource: (sourceId: string) => (
      sourcesLive ? sources[sourceId] : null
    ),
    getStyle: () => ({
      sources: Object.fromEntries(sourceIds.map(sourceId => [
        sourceId,
        { type: 'geojson' },
      ])),
    }),
  }

  assert.equal(
    prepareFlightGeoMapLibreForDisposal(map),
    true,
    'a setStyle source gap is pending rather than a terminal clear failure',
  )
  assert.equal(isFlightGeoMapLibreDisposalPrepared(map), false)
  assert.deepEqual([...sourceWrites.values()], [0, 0])

  sourcesLive = true
  assert.equal(prepareFlightGeoMapLibreForDisposal(map), true)
  assert.deepEqual([...sourceWrites.values()], [1, 1])
  assert.equal(isFlightGeoMapLibreDisposalPrepared(map), false)

  sourcesLoaded = true
  assert.equal(isFlightGeoMapLibreDisposalPrepared(map), true)
})

test('a provider style attempt reset preserves the exact stopped settlement audit', () => {
  const root = { dataset: {} as DOMStringMap } as HTMLElement
  const stopped = {
    phase: 'stopped',
    presentationOwner: 'flight',
    profileId: 'singapore',
    readyFrameRequestId: null,
    revision: 'stopped:provider-swap',
    runId: 0,
  } as FlightGeoOverlaySnapshot
  writeFlightGeoPresentationDebug(root, stopped, 3, 'stopped-camera')
  recordFlightGeoStoppedPresentation(root, stopped, 'stopped-camera')

  clearFlightGeoPresentationAttemptDebug(root)

  assert.equal(root.dataset.kgFlightGeospatialPresentationRevision, undefined)
  assert.equal(root.dataset.kgFlightGeospatialRenderAttempts, undefined)
  assert.equal(
    root.dataset.kgFlightGeospatialStoppedRevision,
    'stopped:provider-swap',
  )
  assert.equal(
    root.dataset.kgFlightGeospatialStoppedCameraSignature,
    'stopped-camera',
  )
})
