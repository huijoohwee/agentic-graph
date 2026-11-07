import assert from 'node:assert/strict'
import { type CityGeoOverlayListener } from 'gympgrph/testkit/cityGeoOverlay'
import {
  applyCityGeoPresentationToMap,
  cityGeoPresentationStateEntries,
  clearCityGeoPresentationFromMap,
  mapHasExactCityGeoPresentation,
} from 'gympgrph/testkit/cityGeoPresentationMapLibre'
import { createCityGeoOverlayMapLibreController } from 'gympgrph/testkit/cityGeoOverlayMapLibreController'
import {
  REGIONAL_POI_LAYER_IDS,
  REGIONAL_POI_LAYER_ORDER,
  REGIONAL_POI_PRESENTATION_STATE_KEYS,
  REGIONAL_POI_SOURCE_ID,
  applyRegionalPoiProfileToMap,
  mapHasExactRegionalPoiProfile,
  regionalPoiProfileBounds,
} from 'gympgrph/testkit/regionalPoiMapLibre'
import {
  testCityGameplayAppearsOnAndMovesAcrossTheSharedMap,
  testCityGameplayRecentersIntoTheUncoveredMapAperture,
  testControllerWaitsForRegionalSourceSettlementAndRefits,
  testFramingRestoresPaddingAfterFitFailure,
  testPresentationHookKeepsControllerAcrossCallbacks,
  testKeyboardCameraControlsPanOnlyOnFocusedMapAndRespectFineMovement,
  testMapLibreWalkableSurfaceRejectsBuildingsAndWaterAndSnapsToLines,
} from './helpers/cityGeoOverlayMapLibreGameplayAssertions.js'
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
  testCityGameplayAppearsOnAndMovesAcrossTheSharedMap()
  testCityGameplayRecentersIntoTheUncoveredMapAperture()
  testFramingRestoresPaddingAfterFitFailure()
  testControllerWaitsForRegionalSourceSettlementAndRefits()
  testRegionalLayersReadGenericPresentationState()
  testKeyboardCameraControlsPanOnlyOnFocusedMapAndRespectFineMovement()
  testMapLibreWalkableSurfaceRejectsBuildingsAndWaterAndSnapsToLines()
  await testPresentationHookKeepsControllerAcrossCallbacks()
}
