import assert from 'node:assert/strict'
import test from 'node:test'
import { SINGAPORE_MAJOR_POI_GEO_PROFILE } from 'grph-shared/geospatial/singaporeMajorPoiGeo'
import {
  applyFlightGeoEnvironmentToMap,
  clearFlightGeoEnvironmentFromMap,
  FLIGHT_GEO_ENVIRONMENT_LAYER_IDS,
  FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
  FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
  mapHasExactFlightGeoEnvironment,
  removeFlightGeoEnvironmentFromMap,
} from '../../../gympgrph/src/flightGeoEnvironmentMapLibre'
import type {
  FlightGeoOverlaySnapshot,
} from '../../../gympgrph/src/flightGeoOverlay'
import { environmentOverlay } from './helpers/flightSimMapLibreEnvironmentFixture'

type EnvironmentSourceFeature = {
  geometry?: { coordinates?: number[][][] }
  id?: string
  properties?: Record<string, unknown>
}

type EnvironmentSourceData = {
  features?: EnvironmentSourceFeature[]
  type?: string
}

function environmentMapHarness() {
  const layers = new Map<string, Record<string, unknown>>()
  const layerOrder: string[] = []
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
  const removalOrder: string[] = []
  const style = { _loaded: false }
  const map = {
    style,
    addLayer: (
      layer: Record<string, unknown>,
      beforeLayerId?: string,
    ) => {
      if (!style._loaded) throw new Error('Style is not done loading.')
      const layerId = String(layer.id)
      layers.set(layerId, layer)
      const beforeIndex = beforeLayerId
        ? layerOrder.indexOf(beforeLayerId)
        : -1
      if (beforeIndex >= 0) layerOrder.splice(beforeIndex, 0, layerId)
      else layerOrder.push(layerId)
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
    getStyle: () => ({
      layers: layerOrder.map(layerId => layers.get(layerId)),
    }),
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
    moveLayer: (layerId: string, beforeLayerId?: string) => {
      const currentIndex = layerOrder.indexOf(layerId)
      if (currentIndex >= 0) layerOrder.splice(currentIndex, 1)
      const beforeIndex = beforeLayerId
        ? layerOrder.indexOf(beforeLayerId)
        : -1
      if (beforeIndex >= 0) layerOrder.splice(beforeIndex, 0, layerId)
      else layerOrder.push(layerId)
    },
    removeLayer: (layerId: string) => {
      layers.delete(layerId)
      const index = layerOrder.indexOf(layerId)
      if (index >= 0) layerOrder.splice(index, 1)
      visibility.delete(layerId)
      removalOrder.push(layerId)
    },
    removeSource: (sourceId: string) => {
      const retainedLayer = [...layers.values()].find(layer => (
        layer.source === sourceId
      ))
      if (retainedLayer) {
        throw new Error(
          `Source "${sourceId}" is still owned by layer "${retainedLayer.id}".`,
        )
      }
      sources.delete(sourceId)
      removalOrder.push(sourceId)
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
    layerOrder,
    removalOrder,
    map,
    resetStyle: (loaded: boolean) => {
      layers.clear()
      layerOrder.splice(0)
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
    assert.equal(projectedStage?.geometry?.coordinates?.length, 2)
    assert.deepEqual(
      projectedStage?.geometry?.coordinates,
      overlay.environment?.surfaces[0]?.rings,
      'the complete authored Polygon, including interior rings, reaches MapLibre',
    )
    const projectedSubject = harness.sourceData()?.features?.find(
      feature => feature.properties?.kgSurfaceId === 'helicopter',
    )
    assert.equal(projectedSubject?.properties?.kgRenderBaseHeightMeters, 0.5)
    assert.equal(projectedSubject?.properties?.kgRenderHeightMeters, 12.5)
    const canonicalSkypark = SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.find(
      surface => surface.id === 'marina-bay-sands:skypark',
    )
    assert.ok(canonicalSkypark)
    const projectedSkypark = harness.sourceData()?.features?.find(
      feature => feature.properties?.kgSurfaceId === canonicalSkypark.id,
    )
    assert.deepEqual(
      projectedSkypark?.geometry?.coordinates,
      canonicalSkypark.geometry.coordinates,
    )
    assert.equal(
      projectedSkypark?.properties?.kgRegionalPoiAccuracyStatement,
      canonicalSkypark.accuracy.statement,
    )
    assert.equal(
      projectedSkypark?.properties?.kgRegionalPoiGeometrySourceId,
      canonicalSkypark.provenance.geometry.sourceId,
    )
    assert.equal(
      projectedSkypark?.properties?.kgRegionalPoiHeightSourceUrl,
      canonicalSkypark.provenance.height.sourceUrl,
    )
    assert.deepEqual(
      JSON.parse(String(
        projectedSkypark?.properties?.kgRegionalPoiContextProvenance,
      )),
      canonicalSkypark.provenance.context,
    )
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
        getStyle: undefined,
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

test('XR environment removal waits for a ready style and accepts owned-resource absence', () => {
  const preparingMap = {
    style: { _loaded: false },
    getLayer: () => {
      throw new Error('getLayer must remain fenced until style readiness')
    },
    getSource: () => {
      throw new Error('getSource must remain fenced until style readiness')
    },
  }
  assert.doesNotThrow(() => removeFlightGeoEnvironmentFromMap(preparingMap))
  assert.equal(removeFlightGeoEnvironmentFromMap(preparingMap), false)

  const harness = environmentMapHarness()
  harness.setStyleReady(true)
  assert.equal(removeFlightGeoEnvironmentFromMap(harness.map), true)
  assert.deepEqual(harness.removalOrder, [])
})

test('XR environment removal clears serialized resources before live handles settle', () => {
  const serializedLayers = FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER.map(layerId => ({
    id: layerId,
    source: FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
  }))
  let serializedSourcePresent = true
  const removalOrder: string[] = []
  const map = {
    style: { _loaded: true },
    getLayer: () => undefined,
    getSource: () => undefined,
    getStyle: () => ({
      layers: serializedLayers,
      sources: serializedSourcePresent
        ? {
            [FLIGHT_GEO_ENVIRONMENT_SOURCE_ID]: {
              type: 'geojson',
              data: { type: 'FeatureCollection', features: [] },
            },
          }
        : {},
    }),
    removeLayer: (layerId: string) => {
      const index = serializedLayers.findIndex(layer => layer.id === layerId)
      if (index >= 0) serializedLayers.splice(index, 1)
      removalOrder.push(layerId)
    },
    removeSource: (sourceId: string) => {
      assert.equal(serializedLayers.length, 0)
      serializedSourcePresent = false
      removalOrder.push(sourceId)
    },
  }

  assert.equal(removeFlightGeoEnvironmentFromMap(map), true)
  assert.deepEqual(removalOrder, [
    ...[...FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER].reverse(),
    FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
  ])
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
  const firstCoordinate = projectedStage?.geometry?.coordinates?.[1]?.[0]
  assert.ok(firstCoordinate)
  firstCoordinate[0] += 0.000001
  assert.equal(
    mapHasExactFlightGeoEnvironment(harness.map, overlay),
    false,
    'a stale interior-ring coordinate must not pass environment identity checks',
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
    applyFlightGeoEnvironmentToMap(harness.map, overlay, '2d'),
    true,
  )
  assert.equal(harness.completeSourceUpdate(), true)
  assert.equal(mapHasExactFlightGeoEnvironment(harness.map, overlay), true)
  const reprojectedSkypark = harness.sourceData()?.features?.find(
    feature => feature.properties?.kgSurfaceId
      === 'marina-bay-sands:skypark',
  )
  assert.ok(reprojectedSkypark?.properties)
  reprojectedSkypark.properties.kgRegionalPoiGeometrySourceId = 'stale-source'
  assert.equal(
    mapHasExactFlightGeoEnvironment(harness.map, overlay),
    false,
    'mutated regional POI provenance must not pass exact presentation',
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
