import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  clearCityGeoOverlay,
  setCityGeoOverlay,
  type CityGeoOverlayListener,
} from '../../../gympgrph/src/cityGeoOverlay.js'
import {
  applyCityGeoPresentationToMap,
  cityGeoPresentationStateEntries,
  clearCityGeoPresentationFromMap,
  mapHasExactCityGeoPresentation,
} from '../../../gympgrph/src/cityGeoPresentationMapLibre.js'
import {
  createCityGeoOverlayMapLibreController,
  fitMapToCityPresentation,
} from '../../../gympgrph/src/cityGeoOverlayMapLibreController.js'
import {
  REGIONAL_POI_LAYER_IDS,
  REGIONAL_POI_LAYER_ORDER,
  REGIONAL_POI_PRESENTATION_STATE_KEYS,
  REGIONAL_POI_SOURCE_ID,
  applyRegionalPoiProfileToMap,
  mapHasExactRegionalPoiProfile,
  regionalPoiFeatureCollection,
  regionalPoiProfileBounds,
} from '../../../gympgrph/src/regionalPoiMapLibre.js'
import { useCityGeoOverlayMapLibrePresentation } from '../../../gympgrph/src/features/geospatial/useCityGeoOverlayMapLibrePresentation.js'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  createSyntheticCityGeoOverlaySnapshot,
  TEST_LAYER_ANCHOR,
  TestMapLibreMap,
} from './helpers/cityGeoOverlayMapLibreHarness.js'

const createSyntheticSnapshot = createSyntheticCityGeoOverlaySnapshot

function testStateProjectionFansPoiParcelsAcrossExactAuthoredSurfaces(): void {
  const snapshot = createSyntheticSnapshot()
  const entries = cityGeoPresentationStateEntries(snapshot)
  const regionalProfile = snapshot.profile!.regionalPoiProfile
  assert.equal(entries.length, regionalProfile.surfaces.length)
  assert.deepEqual(
    entries.map(entry => entry.featureId),
    regionalProfile.surfaces.map(surface => `${regionalProfile.id}:${surface.id}`),
  )
  for (const surface of regionalProfile.surfaces) {
    const parcel = snapshot.parcels.find(candidate => candidate.id === surface.poiId)
    const entry = entries.find(candidate => (
      candidate.featureId === `${regionalProfile.id}:${surface.id}`
    ))
    assert.ok(parcel)
    assert.equal(entry?.poiId, parcel.id)
    assert.equal(
      entry?.state.kgRegionalPoiPresentationVariant,
      parcel.zone,
    )
    assert.equal(
      entry?.state.kgRegionalPoiPresentationSelected,
      parcel.id === snapshot.selectedParcelId,
    )
    assert.equal(
      Object.keys(entry?.state || {}).some(key => /height|base/i.test(key)),
      false,
      'City state must not replace companion-authored base or top heights',
    )
  }
  assert.throws(() => cityGeoPresentationStateEntries({
    ...snapshot,
    parcels: snapshot.parcels.map((parcel, index) => index === 0
      ? { ...parcel, id: 'legacy-grid-parcel' }
      : parcel),
    selectedParcelId: null,
  }), /directly keyed parcel per regional POI/)
}

function testMapLibreUsesOneRegionalSourceAndCityOwnedFeatureState(): void {
  const map = new TestMapLibreMap()
  const initial = createSyntheticSnapshot()
  const regionalProfile = initial.profile!.regionalPoiProfile
  assert.equal(applyRegionalPoiProfileToMap(map, regionalProfile, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '3d',
  }), true)
  const authoredSourceBefore = structuredClone(
    map.getSource(REGIONAL_POI_SOURCE_ID)?.data,
  )
  assert.equal(applyCityGeoPresentationToMap(map, initial), true)
  assert.equal(map.sourceAddCount, 1)
  assert.deepEqual(
    map.getStyle().layers.map(layer => layer.id),
    [...REGIONAL_POI_LAYER_ORDER, TEST_LAYER_ANCHOR],
  )
  assert.deepEqual(
    map.getSource(REGIONAL_POI_SOURCE_ID)?.data,
    authoredSourceBefore,
    'feature state cannot mutate regional geometry or base/top height facts',
  )
  assert.equal(mapHasExactCityGeoPresentation(map, initial), true)
  assert.equal(
    map.featureStateSetCalls.length,
    regionalProfile.surfaces.length,
  )

  const firstSurfaceId = `${regionalProfile.id}:${regionalProfile.surfaces[0].id}`
  map.setFeatureState(
    { source: REGIONAL_POI_SOURCE_ID, id: firstSurfaceId },
    { unrelatedOwnerState: 'retained' },
  )
  const updated = createSyntheticSnapshot({
    revision: 'city-presentation-state-update',
    selectedParcelId: regionalProfile.pois[1].id,
  })
  assert.equal(applyCityGeoPresentationToMap(map, updated), true)
  assert.equal(mapHasExactCityGeoPresentation(map, updated), true)
  assert.equal(
    map.getFeatureState({
      source: REGIONAL_POI_SOURCE_ID,
      id: firstSurfaceId,
    }).unrelatedOwnerState,
    'retained',
  )
  assert.equal(clearCityGeoPresentationFromMap(map), true)
  const retainedState = map.getFeatureState({
    source: REGIONAL_POI_SOURCE_ID,
    id: firstSurfaceId,
  })
  assert.deepEqual(retainedState, { unrelatedOwnerState: 'retained' })
  assert.ok(map.getSource(REGIONAL_POI_SOURCE_ID))
  assert.equal(map.getLayer(TEST_LAYER_ANCHOR)?.type, 'background')
}

function testControllerRepairsRegionalPresentationFramesAndClicksPoiIds(): void {
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
  const regionalProfile = current.profile!.regionalPoiProfile
  assert.equal(map.fitBoundsCalls.length, 1)
  assert.deepEqual(map.fitBoundsCalls[0].bounds, regionalPoiProfileBounds(regionalProfile))
  assert.deepEqual(
    map.getStyle().layers.map(layer => layer.id),
    [...REGIONAL_POI_LAYER_ORDER, TEST_LAYER_ANCHOR],
  )
  assert.equal(map.sourceAddCount, 1)

  current = createSyntheticSnapshot({
    revision: 'city-live-state-update',
    selectedParcelId: regionalProfile.pois[2].id,
  })
  for (const listener of [...listeners]) listener(current)
  assert.equal(map.fitBoundsCalls.length, 1)
  assert.equal(controller.setViewMode('2d'), true)
  assert.equal(map.fitBoundsCalls.length, 2)
  assert.equal(map.fitBoundsCalls[1].options.pitch, 0)

  map.dropRegionalPoiStyleOwnership()
  map.emit('style.load')
  assert.equal(map.sourceAddCount, 2)
  assert.equal(mapHasExactCityGeoPresentation(map, current), true)
  assert.equal(mapHasExactRegionalPoiProfile(map, regionalProfile, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '2d',
  }), true)
  assert.equal(map.fitBoundsCalls.length, 2)

  const clickedPoiId = regionalProfile.pois[3].id
  map.queryFeatures = [{
    properties: {
      kgRegionalPoiFeatureKind: 'surface',
      kgRegionalPoiId: clickedPoiId,
    },
  }]
  map.emit('click', { point: { x: 12, y: 18 } })
  assert.equal(selectedParcelId, clickedPoiId)
  map.queryFeatures = [{
    properties: {
      kgRegionalPoiFeatureKind: 'surface',
      kgRegionalPoiId: 'stale-poi',
    },
  }]
  map.emit('click', { point: { x: 12, y: 18 } })
  assert.equal(selectedParcelId, clickedPoiId)

  controller.dispose()
  assert.equal(listeners.size, 0)
  for (const eventName of [
    'load',
    'style.load',
    'resize',
    'click',
    'sourcedataloading',
    'sourcedata',
  ]) assert.equal(map.styleListeners.get(eventName)?.size, 0)
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
      fitMapToCityPresentation(map, createSyntheticSnapshot(), '3d'),
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

function testControllerWaitsForRegionalSourceSettlementAndRefits(): void {
  const { dom, restore } = initJsdomHarness()
  const viewport = dom.window.document.createElement('section') as HTMLElement
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
    map.emit('sourcedata', { sourceId: REGIONAL_POI_SOURCE_ID })
    assert.equal(viewport.dataset.kgCityGeospatialOverlay, undefined)
    map.markRegionalPoiSourceLoaded()
    map.emit('sourcedata', {
      coord: { canonical: { x: 1, y: 1, z: 1 } },
      sourceDataType: 'content',
      sourceId: REGIONAL_POI_SOURCE_ID,
    })
    assert.equal(viewport.dataset.kgCityGeospatialOverlay, undefined)
    map.emit('sourcedata', {
      sourceDataType: 'content',
      sourceId: REGIONAL_POI_SOURCE_ID,
    })
    assert.equal(viewport.dataset.kgCityGeospatialOverlay, 'active')
    assert.equal(viewport.dataset.kgCityGeospatialFeatureCount, '0')
    assert.equal(
      viewport.dataset.kgCityGeospatialStateFeatureCount,
      String(snapshot.profile!.regionalPoiProfile.surfaces.length),
    )
    assert.equal(
      viewport.dataset.kgCityGeospatialPoiFeatureCount,
      String(regionalPoiFeatureCollection(
        snapshot.profile!.regionalPoiProfile,
      ).features.length),
    )
    assert.equal(map.fitBoundsCalls.length, 1)
    size.width = 1_200
    map.emit('resize')
    assert.equal(map.fitBoundsCalls.length, 2)
    map.emit('sourcedataloading', {
      coord: { canonical: { x: 1, y: 1, z: 1 } },
      sourceId: REGIONAL_POI_SOURCE_ID,
    })
    assert.equal(viewport.dataset.kgCityGeospatialOverlay, 'active')
    map.emit('sourcedataloading', {
      sourceDataType: 'content',
      sourceId: REGIONAL_POI_SOURCE_ID,
    })
    assert.equal(viewport.dataset.kgCityGeospatialOverlay, undefined)
    const firstSurfaceId = `${snapshot.profile!.regionalPoiProfile.id}:${
      snapshot.profile!.regionalPoiProfile.surfaces[0].id
    }`
    assert.deepEqual(map.getFeatureState({
      source: REGIONAL_POI_SOURCE_ID,
      id: firstSurfaceId,
    }), {})
  } finally {
    controller.dispose()
    restore()
  }
}

async function testPresentationHookKeepsControllerAcrossCallbacks(): Promise<void> {
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
        onParcelSelect: () => { firstSelectionCount += 1 },
        viewMode: '3d',
      }))
      await Promise.resolve()
    })
    assert.equal(map.sourceAddCount, 1)
    assert.equal(map.fitBoundsCalls.length, 1)
    await act(async () => {
      root.render(React.createElement(Harness, {
        onParcelSelect: () => { secondSelectionCount += 1 },
        viewMode: '2d',
      }))
      await Promise.resolve()
    })
    assert.equal(map.sourceAddCount, 1)
    assert.equal(map.fitBoundsCalls.length, 2)
    const clickedPoiId = snapshot.profile!.regionalPoiProfile.pois[1].id
    map.queryFeatures = [{
      properties: {
        kgRegionalPoiFeatureKind: 'surface',
        kgRegionalPoiId: clickedPoiId,
      },
    }]
    map.emit('click', { point: { x: 4, y: 8 } })
    assert.equal(firstSelectionCount, 0)
    assert.equal(secondSelectionCount, 1)
    assert.notEqual(
      map.getLayoutProperty(REGIONAL_POI_LAYER_IDS.fill, 'visibility'),
      'none',
    )
    assert.equal(
      map.getLayoutProperty(REGIONAL_POI_LAYER_IDS.extrusion, 'visibility'),
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

function testRegionalLayersReadGenericPresentationState(): void {
  const map = new TestMapLibreMap()
  const snapshot = createSyntheticSnapshot()
  applyRegionalPoiProfileToMap(map, snapshot.profile!.regionalPoiProfile, {
    beforeLayerId: TEST_LAYER_ANCHOR,
    viewMode: '3d',
  })
  const fillPaint = map.getLayer(REGIONAL_POI_LAYER_IDS.fill)?.paint
  const extrusionPaint = map.getLayer(REGIONAL_POI_LAYER_IDS.extrusion)?.paint
  const outlinePaint = map.getLayer(REGIONAL_POI_LAYER_IDS.outline)?.paint
  assert.deepEqual(fillPaint?.['fill-color'], [
    'coalesce',
    ['feature-state', REGIONAL_POI_PRESENTATION_STATE_KEYS.fillColor],
    '#0ea5e9',
  ])
  assert.deepEqual(extrusionPaint?.['fill-extrusion-height'], [
    'get',
    'kgRegionalPoiHeightMeters',
  ])
  assert.deepEqual(extrusionPaint?.['fill-extrusion-base'], [
    'get',
    'kgRegionalPoiBaseHeightMeters',
  ])
  assert.match(JSON.stringify(outlinePaint), /feature-state/)
}

export async function testCityGeoOverlayMapLibreRuntime(): Promise<void> {
  testStateProjectionFansPoiParcelsAcrossExactAuthoredSurfaces()
  testMapLibreUsesOneRegionalSourceAndCityOwnedFeatureState()
  testControllerRepairsRegionalPresentationFramesAndClicksPoiIds()
  testFramingRestoresPaddingAfterFitFailure()
  testControllerWaitsForRegionalSourceSettlementAndRefits()
  testRegionalLayersReadGenericPresentationState()
  await testPresentationHookKeepsControllerAcrossCallbacks()
}
