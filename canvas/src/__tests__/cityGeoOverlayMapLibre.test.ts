import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  SINGAPORE_MAJOR_POI_GEO_PROFILE,
} from 'grph-shared/geospatial/singaporeMajorPoiGeo'
import {
  CITY_GEO_ZONES,
  clearCityGeoOverlay,
  createCityGeoOverlaySnapshot,
  setCityGeoOverlay,
  type CityGeoOverlayListener,
  type CityGeoOverlaySnapshot,
  type CityGeoZone,
  type CityGeoZoneStyle,
  type CityGeographicProfile,
} from '../../../gympgrph/src/cityGeoOverlay.js'
import {
  cityGeoOverlayFeatureCollection,
  hasExactCityGeoOverlayFeatureCollection,
} from '../../../gympgrph/src/cityGeoOverlayProjection.js'
import {
  CITY_GEO_OVERLAY_LAYER_IDS,
  CITY_GEO_OVERLAY_LAYER_ORDER,
  CITY_GEO_OVERLAY_SOURCE_ID,
  applyCityGeoOverlayToMap,
  clearCityGeoOverlayFromMap,
  mapHasExactCityGeoOverlay,
} from '../../../gympgrph/src/cityGeoOverlayMapLibre.js'
import {
  createCityGeoOverlayMapLibreController,
  fitMapToCityGeoOverlay,
} from '../../../gympgrph/src/cityGeoOverlayMapLibreController.js'
import {
  REGIONAL_POI_LAYER_ORDER,
  REGIONAL_POI_SOURCE_ID,
  mapHasExactRegionalPoiProfile,
} from '../../../gympgrph/src/regionalPoiMapLibre.js'
import { useCityGeoOverlayMapLibrePresentation } from '../../../gympgrph/src/features/geospatial/useCityGeoOverlayMapLibrePresentation.js'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  TEST_LAYER_ANCHOR,
  TestMapLibreMap,
} from './helpers/cityGeoOverlayMapLibreHarness.js'

const zoneStyle = (
  fillColor: string,
  baseHeightMeters: number,
): CityGeoZoneStyle => ({
  baseHeightMeters,
  fillColor,
  landValueCentsPerHeightMeter: baseHeightMeters === 0 ? null : 1_000,
  maxHeightMeters: baseHeightMeters + 40,
  outlineColor: '#172033',
  populationPerHeightMeter: baseHeightMeters === 0 ? null : 10,
})

function createSyntheticGeographicProfile(): CityGeographicProfile {
  return {
    bearingDegrees: 0,
    center: [103.851959, 1.29027],
    columnGapMeters: 4,
    framing: {
      '2d': {
        bearingDegrees: 0,
        maxZoom: 18,
        paddingPixels: 28,
        pitchDegrees: 0,
      },
      '3d': {
        bearingDegrees: 24,
        maxZoom: 17,
        paddingPixels: 36,
        pitchDegrees: 52,
      },
    },
    id: 'synthetic-city-profile',
    parcelDepthMeters: 30,
    parcelWidthMeters: 20,
    regionalPoiProfile: SINGAPORE_MAJOR_POI_GEO_PROFILE,
    revision: 'profile-revision-a',
    rowGapMeters: 6,
    selectedOutlineColor: '#f8fafc',
    zoneStyles: {
      unzoned: zoneStyle('#d1d5db', 0),
      residential: zoneStyle('#34d399', 1),
      commercial: zoneStyle('#60a5fa', 2),
      industrial: zoneStyle('#f59e0b', 3),
    },
  }
}

function createSyntheticSnapshot(options: Readonly<{
  landValueOffset?: number
  revision?: string
  selectedParcelId?: string | null
}> = {}): CityGeoOverlaySnapshot {
  const rows = 2
  const columns = 2
  const parcels = Array.from({ length: rows * columns }, (_, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    return {
      column,
      id: `parcel-${row}-${column}`,
      landValueCents: 10_000 + index * 1_000
        + (options.landValueOffset || 0),
      pollution: index,
      population: index * 10,
      row,
      zone: CITY_GEO_ZONES[index] as CityGeoZone,
    }
  })
  return createCityGeoOverlaySnapshot({
    active: true,
    columns,
    parcels,
    profile: createSyntheticGeographicProfile(),
    revision: options.revision || 'city-revision-a',
    rows,
    selectedParcelId: options.selectedParcelId === undefined
      ? 'parcel-0-1'
      : options.selectedParcelId,
  })
}

function polygonCenter(
  ring: readonly (readonly number[])[],
): readonly [number, number] {
  const openRing = ring.slice(0, -1)
  return [
    openRing.reduce((sum, coordinate) => sum + coordinate[0], 0)
      / openRing.length,
    openRing.reduce((sum, coordinate) => sum + coordinate[1], 0)
      / openRing.length,
  ]
}

function testProjectionUsesAuthoredGeographyAndLiveParcels(): void {
  const snapshot = createSyntheticSnapshot()
  const collection = cityGeoOverlayFeatureCollection(snapshot)
  assert.equal(collection.features.length, 4)
  assert.equal(Object.isFrozen(snapshot), true)
  assert.equal(Object.isFrozen(snapshot.profile), true)
  for (const feature of collection.features) {
    const ring = feature.geometry.coordinates[0]
    assert.equal(ring.length, 5)
    assert.deepEqual(ring[0], ring[ring.length - 1])
    assert.equal(feature.properties.kgCityProfileId, snapshot.profile?.id)
    assert.equal(feature.properties.kgCityOverlayKind, 'parcel')
  }
  const northwest = polygonCenter(
    collection.features[0].geometry.coordinates[0],
  )
  const northeast = polygonCenter(
    collection.features[1].geometry.coordinates[0],
  )
  const southwest = polygonCenter(
    collection.features[2].geometry.coordinates[0],
  )
  assert.ok(northeast[0] > northwest[0])
  assert.ok(northwest[1] > southwest[1])
  const selected = collection.features.filter(
    feature => feature.properties.kgCitySelected,
  )
  assert.deepEqual(selected.map(feature => feature.properties.parcelId), [
    'parcel-0-1',
  ])
  assert.equal(selected[0].properties.kgCityHeightMeters, 13)
  assert.equal(
    hasExactCityGeoOverlayFeatureCollection(collection, structuredClone(collection)),
    true,
  )
  assert.throws(() => createCityGeoOverlaySnapshot({
    active: false,
    columns: snapshot.columns,
    parcels: snapshot.parcels,
    profile: snapshot.profile,
    revision: 'stale-inactive-state',
    rows: snapshot.rows,
    selectedParcelId: snapshot.selectedParcelId,
  }), /must not retain profile or parcel data/)
}

function testMapLibreApplyRepairAndClearOwnOnlyCityState(): void {
  const map = new TestMapLibreMap()
  const initial = createSyntheticSnapshot()
  assert.equal(applyCityGeoOverlayToMap(map, initial, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '3d',
  }), true)
  assert.equal(map.setStyleCount, 0)
  assert.equal(map.sourceAddCount, 1)
  assert.equal(mapHasExactCityGeoOverlay(map, initial, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '3d',
  }), true)
  assert.deepEqual(
    map.getStyle().layers.map(layer => layer.id),
    [...CITY_GEO_OVERLAY_LAYER_ORDER, TEST_LAYER_ANCHOR],
  )

  const updated = createSyntheticSnapshot({
    landValueOffset: 2_000,
    revision: 'city-revision-b',
    selectedParcelId: 'parcel-1-0',
  })
  const source = map.getSource(CITY_GEO_OVERLAY_SOURCE_ID)
  assert.ok(source)
  assert.equal(applyCityGeoOverlayToMap(map, updated, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '2d',
  }), true)
  assert.equal(source.setDataCount, 1)
  assert.equal(map.sourceAddCount, 1)
  assert.equal(
    map.getLayoutProperty(CITY_GEO_OVERLAY_LAYER_IDS.extrusion, 'visibility'),
    'none',
  )

  map.moveCityLayerAboveAnchor(CITY_GEO_OVERLAY_LAYER_IDS.outline)
  assert.equal(mapHasExactCityGeoOverlay(map, updated, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '2d',
  }), false)
  assert.equal(applyCityGeoOverlayToMap(map, updated, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '2d',
  }), true)
  assert.deepEqual(
    map.getStyle().layers.map(layer => layer.id),
    [...CITY_GEO_OVERLAY_LAYER_ORDER, TEST_LAYER_ANCHOR],
  )

  const outline = map.getLayer(CITY_GEO_OVERLAY_LAYER_IDS.outline)
  assert.ok(outline)
  outline.paint['line-width'] = 99
  assert.equal(applyCityGeoOverlayToMap(map, updated, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '2d',
  }), true)
  assert.equal(mapHasExactCityGeoOverlay(map, updated, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '2d',
  }), true)
  map.corruptCitySourceShape()
  assert.equal(applyCityGeoOverlayToMap(map, updated, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '2d',
  }), true)
  assert.equal(map.sourceRemoveCount, 1)
  assert.equal(map.sourceAddCount, 2)
  assert.equal(mapHasExactCityGeoOverlay(map, updated, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '2d',
  }), true)
  assert.equal(map.getLayer(TEST_LAYER_ANCHOR)?.type, 'background')
  assert.equal(clearCityGeoOverlayFromMap(map), true)
  assert.equal(map.getSource(CITY_GEO_OVERLAY_SOURCE_ID), undefined)
  assert.equal(map.getSource(REGIONAL_POI_SOURCE_ID), undefined)
  assert.equal(
    CITY_GEO_OVERLAY_LAYER_ORDER.every(id => !map.getLayer(id)),
    true,
  )
  assert.equal(map.getLayer(TEST_LAYER_ANCHOR)?.type, 'background')
}

function testControllerReplaysStyleAndFramesRegionalCityGeometry(): void {
  const map = new TestMapLibreMap()
  let current = createSyntheticSnapshot()
  let selectedParcelId: string | null = null
  const listeners = new Set<CityGeoOverlayListener>()
  const controller = createCityGeoOverlayMapLibreController({
    beforeLayerId: TEST_LAYER_ANCHOR,
    map,
    onParcelSelect: parcelId => {
      selectedParcelId = parcelId
    },
    readSnapshot: () => current,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    viewMode: '3d',
  })
  assert.equal(map.fitBoundsCalls.length, 1)
  assert.deepEqual(
    map.getStyle().layers.map(layer => layer.id),
    [
      ...REGIONAL_POI_LAYER_ORDER,
      ...CITY_GEO_OVERLAY_LAYER_ORDER,
      TEST_LAYER_ANCHOR,
    ],
  )
  assert.deepEqual(map.fitBoundsCalls[0].options, {
    bearing: 24,
    duration: 0,
    maxZoom: 17,
    padding: {
      bottom: 52,
      left: 52,
      right: 52,
      top: 52,
    },
    pitch: 52,
  })
  assert.deepEqual(map.setPaddingCalls[0], {
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
  })

  current = createSyntheticSnapshot({
    landValueOffset: 3_000,
    revision: 'city-revision-live-update',
    selectedParcelId: 'parcel-1-1',
  })
  for (const listener of [...listeners]) listener(current)
  assert.equal(map.fitBoundsCalls.length, 1)
  assert.equal(controller.setViewMode('2d'), true)
  assert.equal(map.fitBoundsCalls.length, 2)
  assert.equal(map.fitBoundsCalls[1].options.pitch, 0)

  map.dropCityStyleOwnership()
  map.emit('style.load')
  assert.equal(map.fitBoundsCalls.length, 2)
  assert.equal(mapHasExactCityGeoOverlay(map, current, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '2d',
  }), true)
  assert.equal(mapHasExactRegionalPoiProfile(
    map,
    current.profile!.regionalPoiProfile,
    {
      beforeLayerId: CITY_GEO_OVERLAY_LAYER_IDS.fill,
      viewMode: '2d',
    },
  ), true)
  assert.equal(map.setStyleCount, 0)
  map.queryFeatures = [{
    properties: {
      kgCityOverlayKind: 'parcel',
      parcelId: 'parcel-1-0',
    },
  }]
  map.emit('click', { point: { x: 12, y: 18 } })
  assert.equal(selectedParcelId, 'parcel-1-0')
  map.queryFeatures = [{
    properties: {
      kgCityOverlayKind: 'parcel',
      parcelId: 'stale-parcel',
    },
  }]
  map.emit('click', { point: { x: 12, y: 18 } })
  assert.equal(selectedParcelId, 'parcel-1-0')
  controller.dispose()
  assert.equal(listeners.size, 0)
  assert.equal(map.styleListeners.get('load')?.size, 0)
  assert.equal(map.styleListeners.get('style.load')?.size, 0)
  assert.equal(map.styleListeners.get('resize')?.size, 0)
  assert.equal(map.styleListeners.get('click')?.size, 0)
  assert.equal(map.styleListeners.get('sourcedataloading')?.size, 0)
  assert.equal(map.styleListeners.get('sourcedata')?.size, 0)
  assert.equal(map.getSource(CITY_GEO_OVERLAY_SOURCE_ID), undefined)
  assert.equal(map.getSource(REGIONAL_POI_SOURCE_ID), undefined)
  assert.equal(map.getLayer(TEST_LAYER_ANCHOR)?.type, 'background')
  assert.deepEqual(map.setPaddingCalls.at(-1), {
    bottom: 6,
    left: 3,
    right: 4,
    top: 5,
  })
}

function testFramingRestoresPaddingAfterFitFailure(): void {
  const map = new TestMapLibreMap()
  map.fitBoundsError = new Error('test fit failure')
  const originalConsoleError = console.error
  console.error = () => void 0
  try {
    assert.equal(
      fitMapToCityGeoOverlay(map, createSyntheticSnapshot(), '3d'),
      false,
    )
  } finally {
    console.error = originalConsoleError
  }
  assert.deepEqual(map.setPaddingCalls, [
    { bottom: 0, left: 0, right: 0, top: 0 },
    { bottom: 6, left: 3, right: 4, top: 5 },
  ])
}

function defineViewportSize(
  viewport: HTMLElement,
  size: { height: number; width: number },
): void {
  Object.defineProperties(viewport, {
    clientHeight: { configurable: true, get: () => size.height },
    clientWidth: { configurable: true, get: () => size.width },
  })
}

function testControllerWaitsForOwnedSourceSettlementAndRefitsOnResize(): void {
  const { dom, restore } = initJsdomHarness()
  const viewport = dom.window.document.createElement('section') as unknown as HTMLElement
  const size = { height: 1_000, width: 1_000 }
  defineViewportSize(viewport, size)
  dom.window.document.body.appendChild(viewport)
  const map = new TestMapLibreMap({
    asynchronousSourceLoading: true,
    container: viewport,
  })
  const snapshot = createSyntheticSnapshot()
  const controller = createCityGeoOverlayMapLibreController({
    beforeLayerId: TEST_LAYER_ANCHOR,
    map,
    readSnapshot: () => snapshot,
    subscribe: () => () => void 0,
    viewMode: '3d',
  })
  try {
    assert.equal(viewport.dataset.kgCityGeospatialOverlay, undefined)
    map.emit('sourcedata', { sourceId: 'unrelated-source' })
    assert.equal(viewport.dataset.kgCityGeospatialOverlay, undefined)
    map.markCitySourceLoaded()
    map.emit('sourcedata', { sourceId: CITY_GEO_OVERLAY_SOURCE_ID })
    assert.equal(
      viewport.dataset.kgCityGeospatialOverlay,
      undefined,
      'a generic City-source event must not settle the GeoJSON payload',
    )
    map.emit('sourcedata', {
      coord: { canonical: { x: 1, y: 1, z: 1 } },
      sourceDataType: 'content',
      sourceId: CITY_GEO_OVERLAY_SOURCE_ID,
    })
    assert.equal(
      viewport.dataset.kgCityGeospatialOverlay,
      undefined,
      'a City-source tile event must not settle the GeoJSON payload',
    )
    map.emit('sourcedata', {
      sourceDataType: 'content',
      sourceId: CITY_GEO_OVERLAY_SOURCE_ID,
    })
    assert.equal(
      viewport.dataset.kgCityGeospatialOverlay,
      undefined,
      'regional and City GeoJSON payloads must both settle',
    )
    map.markRegionalPoiSourceLoaded()
    map.emit('sourcedata', {
      sourceDataType: 'content',
      sourceId: REGIONAL_POI_SOURCE_ID,
    })
    assert.equal(viewport.dataset.kgCityGeospatialOverlay, 'active')
    assert.equal(
      viewport.dataset.kgCityGeospatialFeatureCount,
      String(snapshot.parcels.length),
    )
    assert.equal(
      viewport.dataset.kgCityGeospatialPoiFeatureCount,
      String(snapshot.profile?.regionalPoiProfile.surfaces.length),
    )
    assert.equal(
      viewport.dataset.kgCityGeospatialPoiProfileId,
      snapshot.profile?.regionalPoiProfile.id,
    )
    map.emit('load')
    assert.equal(
      viewport.dataset.kgCityGeospatialOverlay,
      'active',
      'the final map load must not discard an already settled owned source',
    )
    assert.equal(map.fitBoundsCalls.length, 1)
    assert.deepEqual(map.fitBoundsCalls[0].options.padding, {
      bottom: 148,
      left: 108,
      right: 108,
      top: 124,
    })
    size.width = 1_200
    map.emit('resize')
    assert.equal(
      map.fitBoundsCalls.length,
      2,
      'a changed viewport must refit even when capped padding is unchanged',
    )
    map.emit('sourcedataloading', {
      coord: { canonical: { x: 1, y: 1, z: 1 } },
      sourceId: CITY_GEO_OVERLAY_SOURCE_ID,
    })
    assert.equal(
      viewport.dataset.kgCityGeospatialOverlay,
      'active',
      'a City-source tile load must not invalidate settled payload evidence',
    )
    map.emit('sourcedataloading', {
      sourceDataType: 'content',
      sourceId: CITY_GEO_OVERLAY_SOURCE_ID,
    })
    assert.equal(viewport.dataset.kgCityGeospatialOverlay, undefined)
  } finally {
    controller.dispose()
    restore()
  }
}

async function testPresentationHookKeepsControllerAcrossCallbackAndViewChanges(): Promise<void> {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const map = new TestMapLibreMap()
  const snapshot = createSyntheticSnapshot()
  let firstSelectionCount = 0
  let secondSelectionCount = 0

  function Harness(props: Readonly<{
    onParcelSelect: (parcelId: string) => void
    viewMode: '2d' | '3d'
  }>): null {
    useCityGeoOverlayMapLibrePresentation({
      active: true,
      map,
      mapLibreRuntimeEnabled: true,
      onParcelSelect: props.onParcelSelect,
      viewMode: props.viewMode,
    })
    return null
  }

  try {
    setCityGeoOverlay(snapshot)
    await act(async () => {
      root.render(React.createElement(Harness, {
        onParcelSelect: () => {
          firstSelectionCount += 1
        },
        viewMode: '3d',
      }))
      await Promise.resolve()
    })
    assert.equal(map.sourceAddCount, 2)
    assert.equal(map.sourceRemoveCount, 0)
    assert.equal(map.fitBoundsCalls.length, 1)

    await act(async () => {
      root.render(React.createElement(Harness, {
        onParcelSelect: () => {
          secondSelectionCount += 1
        },
        viewMode: '3d',
      }))
      await Promise.resolve()
    })
    assert.equal(map.sourceAddCount, 2)
    assert.equal(map.sourceRemoveCount, 0)
    assert.equal(map.fitBoundsCalls.length, 1)
    map.queryFeatures = [{
      properties: {
        kgCityOverlayKind: 'parcel',
        parcelId: 'parcel-0-0',
      },
    }]
    map.emit('click', { point: { x: 4, y: 8 } })
    assert.equal(firstSelectionCount, 0)
    assert.equal(secondSelectionCount, 1)

    await act(async () => {
      root.render(React.createElement(Harness, {
        onParcelSelect: () => {
          secondSelectionCount += 1
        },
        viewMode: '2d',
      }))
      await Promise.resolve()
    })
    assert.equal(map.sourceAddCount, 2)
    assert.equal(map.sourceRemoveCount, 0)
    assert.equal(map.fitBoundsCalls.length, 2)
    assert.equal(
      map.getLayoutProperty(CITY_GEO_OVERLAY_LAYER_IDS.extrusion, 'visibility'),
      'none',
    )
  } finally {
    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
    clearCityGeoOverlay()
    restore()
  }
}

export async function testCityGeoOverlayMapLibreRuntime(): Promise<void> {
  testProjectionUsesAuthoredGeographyAndLiveParcels()
  testMapLibreApplyRepairAndClearOwnOnlyCityState()
  testControllerReplaysStyleAndFramesRegionalCityGeometry()
  testFramingRestoresPaddingAfterFitFailure()
  testControllerWaitsForOwnedSourceSettlementAndRefitsOnResize()
  await testPresentationHookKeepsControllerAcrossCallbackAndViewChanges()
}
