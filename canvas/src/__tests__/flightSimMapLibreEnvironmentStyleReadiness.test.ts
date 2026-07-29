import assert from 'node:assert/strict'
import test from 'node:test'
import type { FlightGeoOverlaySnapshot } from '../../../gympgrph/src/flightGeoOverlay'
import {
  applyFlightGeoEnvironmentToMap,
  clearFlightGeoEnvironmentFromMap,
  FLIGHT_GEO_ENVIRONMENT_LAYER_IDS,
  FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
  mapHasExactFlightGeoEnvironment,
} from '../../../gympgrph/src/flightGeoEnvironmentMapLibre'

type EnvironmentSourceFeature = {
  geometry?: { coordinates?: number[][][] }
  id?: string
  properties?: Record<string, unknown>
}

type EnvironmentSourceData = {
  features?: EnvironmentSourceFeature[]
  type?: string
}

function environmentOverlay(): FlightGeoOverlaySnapshot {
  return {
    active: true,
    aircraft: {
      coordinate: [103.851959, 1.29027],
      altitudeMeters: 120,
      headingDegrees: 0,
    },
    camera: {
      centerCoordinate: [103.851959, 1.29027],
      cockpitClearance: { forwardMeters: 2, verticalMeters: 1 },
      effectiveOwner: 'fixed-follow',
      source: 'fixed-follow',
      timeline: null,
      view: 'chase',
    },
    environment: {
      anchor: [103.851959, 1.29027],
      id: 'singapore',
      label: 'Singapore',
      presentationBounds: [
        [103.605, 1.158],
        [104.09, 1.48],
      ],
      revision: 'singapore:environment:exact',
      stageFootprint: [
        [103.8518, 1.2901],
        [103.8521, 1.2901],
        [103.8521, 1.2904],
        [103.8518, 1.2904],
        [103.8518, 1.2901],
      ],
      surfaces: [
        {
          baseHeightMeters: 0,
          color: '#15803d',
          heightMeters: 0.2,
          id: 'stage',
          kind: 'stage-footprint',
          ring: [
            [103.8518, 1.2901],
            [103.8521, 1.2901],
            [103.8521, 1.2904],
            [103.8518, 1.2904],
            [103.8518, 1.2901],
          ],
        },
        {
          baseHeightMeters: 0.5,
          color: '#f59e0b',
          heightMeters: 12.5,
          id: 'helicopter',
          kind: 'subject',
          ring: [
            [103.85194, 1.29025],
            [103.85198, 1.29025],
            [103.85198, 1.29029],
            [103.85194, 1.29029],
            [103.85194, 1.29025],
          ],
        },
      ],
    },
    night: false,
    objective: null,
    phase: 'ready',
    profileId: 'singapore',
    readyFrameRequestId: 1,
    revision: 'ready:singapore:environment:exact',
    route: [],
    runId: 1,
    tick: 0,
  }
}

function environmentMapHarness() {
  const layers = new Map<string, Record<string, unknown>>()
  const sources = new Map<string, {
    data: unknown
    complete: () => void
    loaded: () => boolean
    serialize: () => { data: unknown }
    setData: (data: unknown) => void
  }>()
  const visibility = new Map<string, unknown>()
  let addSourceCalls = 0
  let setDataCalls = 0
  let setLayoutPropertyCalls = 0
  const style = { _loaded: false }
  const map = {
    style,
    addLayer: (layer: Record<string, unknown>) => {
      if (!style._loaded) throw new Error('Style is not done loading.')
      layers.set(String(layer.id), layer)
    },
    addSource: (sourceId: string, source: { data: unknown }) => {
      addSourceCalls += 1
      if (!style._loaded) throw new Error('Style is not done loading.')
      const stored = {
        data: source.data,
        complete: () => {
          stored.sourceLoaded = true
        },
        loaded: () => stored.sourceLoaded,
        serialize: () => ({ data: stored.data }),
        sourceLoaded: true,
        setData: (data: unknown) => {
          stored.data = data
          stored.sourceLoaded = false
          setDataCalls += 1
        },
      }
      sources.set(sourceId, stored)
    },
    getLayer: (layerId: string) => layers.get(layerId),
    getLayoutProperty: (layerId: string, property: string) => (
      property === 'visibility' ? visibility.get(layerId) : undefined
    ),
    getPaintProperty: (layerId: string, property: string) => {
      const paint = layers.get(layerId)?.paint
      return paint && typeof paint === 'object'
        ? (paint as Record<string, unknown>)[property]
        : undefined
    },
    getSource: (sourceId: string) => sources.get(sourceId),
    removeLayer: (layerId: string) => {
      layers.delete(layerId)
      visibility.delete(layerId)
    },
    setLayoutProperty: (
      layerId: string,
      property: string,
      value: unknown,
    ) => {
      if (property === 'visibility') {
        setLayoutPropertyCalls += 1
        visibility.set(layerId, value)
      }
    },
  }
  return {
    addSourceCalls: () => addSourceCalls,
    completeSourceUpdate: () => {
      const source = sources.get(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID)
      if (!source) return false
      source.complete()
      return true
    },
    layers,
    map,
    resetStyle: (loaded: boolean) => {
      layers.clear()
      sources.clear()
      visibility.clear()
      style._loaded = loaded
    },
    setStyleReady: (ready: boolean) => {
      style._loaded = ready
    },
    setDataCalls: () => setDataCalls,
    setLayoutPropertyCalls: () => setLayoutPropertyCalls,
    sourceData: (): EnvironmentSourceData | undefined => {
      const data = sources.get(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID)?.data
      return data as EnvironmentSourceData | undefined
    },
    visibility,
  }
}

test('XR environment defers until each MapLibre style is ready', () => {
  const overlay = environmentOverlay()
  const harness = environmentMapHarness()
  const diagnostics: unknown[][] = []
  const originalConsoleError = console.error
  console.error = (...args: unknown[]) => diagnostics.push(args)
  try {
    assert.equal(
      applyFlightGeoEnvironmentToMap(harness.map, overlay, '2d-modern'),
      false,
    )
    assert.equal(harness.addSourceCalls(), 0)

    harness.setStyleReady(true)
    assert.equal(
      applyFlightGeoEnvironmentToMap(harness.map, overlay, '2d-modern'),
      true,
    )
    assert.equal(
      mapHasExactFlightGeoEnvironment(harness.map, overlay),
      false,
      'setData schedules a source update; the render gate owns completion',
    )
    assert.equal(harness.setDataCalls(), 1)
    const layoutWritesAfterFirstApply = harness.setLayoutPropertyCalls()
    assert.equal(
      applyFlightGeoEnvironmentToMap(harness.map, overlay, '2d-modern'),
      true,
    )
    assert.equal(
      harness.setDataCalls(),
      1,
      'an unchanged serialized payload must not reset a pending source load',
    )
    assert.equal(
      harness.setLayoutPropertyCalls(),
      layoutWritesAfterFirstApply,
      'an unchanged view must not dirty the MapLibre painter with visibility rewrites',
    )
    assert.equal(harness.completeSourceUpdate(), true)
    assert.equal(mapHasExactFlightGeoEnvironment(harness.map, overlay), true)
    assert.equal(harness.addSourceCalls(), 1)
    assert.equal(harness.layers.size, 3)
    assert.equal(
      harness.visibility.get(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d) ?? 'visible',
      'visible',
    )
    assert.equal(
      harness.visibility.get(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d),
      'none',
    )
    assert.equal(
      harness.visibility.get(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.outline) ?? 'visible',
      'visible',
    )
    assert.equal(
      harness.sourceData()?.features?.every(feature => (
        feature.properties?.kgEnvironmentRevision
          === overlay.environment?.revision
      )),
      true,
    )
    const projectedStage = harness.sourceData()?.features?.find(
      feature => feature.properties?.kgSurfaceId === 'stage',
    )
    assert.equal(projectedStage?.properties?.kgBaseHeightMeters, 0)
    assert.equal(projectedStage?.properties?.kgHeightMeters, 0.2)
    assert.equal(projectedStage?.properties?.kgRenderBaseHeightMeters, 0.15)
    assert.equal(projectedStage?.properties?.kgRenderHeightMeters, 0.35)
    const projectedSubject = harness.sourceData()?.features?.find(
      feature => feature.properties?.kgSurfaceId === 'helicopter',
    )
    assert.equal(projectedSubject?.properties?.kgRenderBaseHeightMeters, 0.5)
    assert.equal(projectedSubject?.properties?.kgRenderHeightMeters, 12.5)
    const planarPayload = JSON.parse(JSON.stringify(harness.sourceData()))
    const extrusionLayer = harness.layers.get(
      FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d,
    ) as { paint?: Record<string, unknown> }
    assert.deepEqual(
      extrusionLayer.paint?.['fill-extrusion-base'],
      ['get', 'kgRenderBaseHeightMeters'],
    )
    assert.deepEqual(
      extrusionLayer.paint?.['fill-extrusion-height'],
      ['get', 'kgRenderHeightMeters'],
    )

    harness.resetStyle(false)
    assert.equal(
      applyFlightGeoEnvironmentToMap(harness.map, overlay, '3d-modern'),
      false,
    )
    assert.equal(harness.addSourceCalls(), 1)

    harness.setStyleReady(true)
    assert.equal(
      applyFlightGeoEnvironmentToMap(harness.map, overlay, '3d-modern'),
      true,
    )
    assert.equal(mapHasExactFlightGeoEnvironment(harness.map, overlay), false)
    assert.equal(harness.completeSourceUpdate(), true)
    assert.equal(mapHasExactFlightGeoEnvironment(harness.map, overlay), true)
    assert.deepEqual(
      harness.sourceData(),
      planarPayload,
      'changing only between 2D and 3D must preserve the GeoJSON payload',
    )
    assert.equal(harness.addSourceCalls(), 2)
    assert.equal(
      harness.visibility.get(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d),
      'none',
    )
    assert.equal(
      harness.visibility.get(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d) ?? 'visible',
      'visible',
    )
    assert.equal(
      harness.visibility.get(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.outline) ?? 'visible',
      'visible',
    )
  } finally {
    console.error = originalConsoleError
  }
  assert.deepEqual(diagnostics, [])
})

test('XR environment rebuilds retained layers with mutated extrusion contracts', () => {
  const overlay = environmentOverlay()
  const harness = environmentMapHarness()
  harness.setStyleReady(true)
  assert.equal(
    applyFlightGeoEnvironmentToMap(harness.map, overlay, '3d'),
    true,
  )
  assert.equal(harness.completeSourceUpdate(), true)
  assert.equal(mapHasExactFlightGeoEnvironment(harness.map, overlay), true)

  const replaceLayer = (
    layerId: string,
    change: (layer: Record<string, unknown>) => Record<string, unknown>,
    label: string,
  ) => {
    const current = harness.layers.get(layerId)
    assert.ok(current)
    harness.layers.set(layerId, change(current))
    assert.equal(
      mapHasExactFlightGeoEnvironment(harness.map, overlay),
      false,
      `${label} must fail exact presentation`,
    )
    assert.equal(
      applyFlightGeoEnvironmentToMap(harness.map, overlay, '3d'),
      true,
      `${label} must be rebuilt from the source-owned definition`,
    )
    assert.equal(mapHasExactFlightGeoEnvironment(harness.map, overlay), true)
  }

  replaceLayer(
    FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d,
    layer => ({ ...layer, source: 'mutated-source' }),
    'a retained foreign source',
  )
  replaceLayer(
    FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.outline,
    layer => ({ ...layer, type: 'fill-extrusion' }),
    'a retained foreign layer type',
  )
  replaceLayer(
    FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d,
    layer => ({
      ...layer,
      paint: {
        ...(layer.paint as Record<string, unknown>),
        'fill-extrusion-base': ['get', 'kgBaseHeightMeters'],
      },
    }),
    'a mutated extrusion base expression',
  )
  replaceLayer(
    FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d,
    layer => ({
      ...layer,
      paint: {
        ...(layer.paint as Record<string, unknown>),
        'fill-extrusion-height': ['get', 'kgHeightMeters'],
      },
    }),
    'a mutated extrusion height expression',
  )

  assert.equal(
    mapHasExactFlightGeoEnvironment(
      {
        ...harness.map,
        getLayer: (layerId: string) => {
          const layer = harness.layers.get(layerId)
          return layer
            ? { id: layer.id, source: layer.source, type: layer.type }
            : undefined
        },
      },
      overlay,
    ),
    false,
    'a map without serializable paint cannot claim exact extrusion readiness',
  )
})

test('XR environment clear never probes MapLibre before its style attaches', () => {
  const visibility = new Map<string, unknown>()
  const map = {
    getSource: () => {
      throw new TypeError("Cannot read properties of undefined (reading 'getSource')")
    },
    setLayoutProperty: (
      layerId: string,
      property: string,
      value: unknown,
    ) => {
      if (property === 'visibility') visibility.set(layerId, value)
    },
  }
  assert.doesNotThrow(() => clearFlightGeoEnvironmentFromMap(map))
  assert.equal(clearFlightGeoEnvironmentFromMap(map), true)
  for (const layerId of Object.values(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS)) {
    assert.equal(visibility.get(layerId), 'none')
  }
})

test('XR environment exactness rejects mutated or retained MapLibre source payloads', () => {
  const overlay = environmentOverlay()
  const harness = environmentMapHarness()
  const withoutEnvironment: FlightGeoOverlaySnapshot = {
    ...overlay,
    environment: null,
  }
  assert.equal(
    mapHasExactFlightGeoEnvironment(harness.map, withoutEnvironment),
    true,
    'an absent environment is exact when the MapLibre source is absent',
  )
  harness.setStyleReady(true)

  assert.equal(
    applyFlightGeoEnvironmentToMap(harness.map, overlay, '2d'),
    true,
  )
  assert.equal(mapHasExactFlightGeoEnvironment(harness.map, overlay), false)
  assert.equal(harness.completeSourceUpdate(), true)
  assert.equal(mapHasExactFlightGeoEnvironment(harness.map, overlay), true)
  const projectedStage = harness.sourceData()?.features?.find(
    feature => feature.properties?.kgSurfaceId === 'stage',
  )
  const firstCoordinate = projectedStage?.geometry?.coordinates?.[0]?.[0]
  assert.ok(firstCoordinate)
  firstCoordinate[0] += 0.000001
  assert.equal(
    mapHasExactFlightGeoEnvironment(harness.map, overlay),
    false,
    'a stale coordinate must not pass environment identity checks',
  )

  assert.equal(
    applyFlightGeoEnvironmentToMap(harness.map, overlay, '2d'),
    true,
  )
  assert.equal(mapHasExactFlightGeoEnvironment(harness.map, overlay), false)
  assert.equal(harness.completeSourceUpdate(), true)
  assert.equal(mapHasExactFlightGeoEnvironment(harness.map, overlay), true)
  const reprojectedStage = harness.sourceData()?.features?.find(
    feature => feature.properties?.kgSurfaceId === 'stage',
  )
  assert.ok(reprojectedStage?.properties)
  reprojectedStage.properties.kgHeightMeters = 99
  assert.equal(
    mapHasExactFlightGeoEnvironment(harness.map, overlay),
    false,
    'a stale extrusion height must not pass environment identity checks',
  )

  assert.equal(
    mapHasExactFlightGeoEnvironment(harness.map, withoutEnvironment),
    false,
    'an absent environment is not exact while its prior source features remain',
  )

  const clearSetDataCalls = harness.setDataCalls()
  assert.equal(clearFlightGeoEnvironmentFromMap(harness.map), true)
  assert.equal(
    harness.visibility.get(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d),
    'none',
  )
  assert.equal(
    harness.visibility.get(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d),
    'none',
  )
  assert.equal(
    harness.visibility.get(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.outline),
    'none',
  )
  assert.equal(harness.sourceData()?.features?.length, 0)
  assert.equal(
    mapHasExactFlightGeoEnvironment(harness.map, withoutEnvironment),
    false,
    'a scheduled clear is not exact until MapLibre reports the source loaded',
  )
  assert.equal(clearFlightGeoEnvironmentFromMap(harness.map), true)
  assert.equal(
    harness.setDataCalls(),
    clearSetDataCalls + 1,
    'an already empty serialized payload must not reset the pending clear',
  )
  assert.equal(harness.completeSourceUpdate(), true)
  assert.equal(
    mapHasExactFlightGeoEnvironment(harness.map, withoutEnvironment),
    true,
  )

  assert.equal(
    applyFlightGeoEnvironmentToMap(harness.map, overlay, '3d'),
    true,
  )
  assert.equal(
    harness.visibility.get(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.outline),
    'visible',
    'the next environment must restore its outline after an immediate clear hide',
  )
  assert.equal(harness.completeSourceUpdate(), true)
  assert.equal(mapHasExactFlightGeoEnvironment(harness.map, overlay), true)
})
