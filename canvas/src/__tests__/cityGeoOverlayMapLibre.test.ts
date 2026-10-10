import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  deriveRegionalPoiLocators,
  deriveRegionalPoiLongitudeSpan,
} from 'grph-shared/geospatial/regionalPoiGeo'
import {
  clearCityGeoOverlay,
  createCityGeoOverlaySnapshot,
  setCityGeoOverlay,
  type CityGeoOverlayListener,
} from 'gympgrph/testkit/cityGeoOverlay'
import {
  applyCityGeoPresentationToMap,
  cityGeoPresentationStateEntries,
  clearCityGeoPresentationFromMap,
  mapHasExactCityGeoPresentation,
} from 'gympgrph/testkit/cityGeoPresentationMapLibre'
import {
  createCityGeoOverlayMapLibreController,
  fitMapToCityPresentation,
} from 'gympgrph/testkit/cityGeoOverlayMapLibreController'
import {
  bindMapLibreKeyboardCameraControls,
  findNearestMapLibreWalkablePoint,
  isMapLibreWalkableLineFeature,
  resolveMapLibreKeyboardCharacterOffset,
  resolveMapLibreKeyboardPanOffset,
} from 'gympgrph/testkit/features/geospatial/mapLibreKeyboardCameraControls'
import {
  CITY_GEO_GAMEPLAY_LAYER_ORDER,
  CITY_GEO_GAMEPLAY_SOURCE_ID,
  mapHasExactCityGeoGameplay,
} from 'gympgrph/testkit/cityGeoGameplayMapLibre'
import {
  REGIONAL_POI_LAYER_IDS,
  REGIONAL_POI_LAYER_ORDER,
  REGIONAL_POI_PRESENTATION_STATE_KEYS,
  REGIONAL_POI_SOURCE_ID,
  applyRegionalPoiProfileToMap,
  mapHasExactRegionalPoiProfile,
  regionalPoiFeatureCollection,
  regionalPoiProfileBounds,
} from 'gympgrph/testkit/regionalPoiMapLibre'
import { useCityGeoOverlayMapLibrePresentation } from 'gympgrph/testkit/features/geospatial/useCityGeoOverlayMapLibrePresentation'
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

function testCityGameplayAppearsOnAndMovesAcrossTheSharedMap(): void {
  const map = new TestMapLibreMap()
  const base = createSyntheticSnapshot()
  const profile = base.profile!.regionalPoiProfile
  // Production City mode prefers this Flight route anchor, but does not have
  // it in the style. The gameplay layers must still be appended and rendered.
  const absentFlightRouteAnchor = 'kg-flight-sim:geo-overlay:route'
  const gameplay = Object.freeze({
    completedTasks: 0,
    playerPoiId: profile.pois[0].id,
    profileId: profile.id,
    revision: 0,
    taskPoiId: profile.pois[1].id,
  })
  let current = createCityGeoOverlaySnapshot({ ...base, gameplay })
  const playerSelectionChanges: boolean[] = []
  const listeners = new Set<CityGeoOverlayListener>()
  const controller = createCityGeoOverlayMapLibreController({
    beforeLayerId: absentFlightRouteAnchor,
    map,
    onPlayerSelect: selected => playerSelectionChanges.push(selected),
    readSnapshot: () => current,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    viewMode: '3d',
  })
  const source = map.getSource(CITY_GEO_GAMEPLAY_SOURCE_ID)
  assert.ok(source, 'the player and task share the live MapLibre map')
  const sourceData = source.data as {
    features: Array<{
      geometry: { coordinates?: readonly number[]; type: string }
      id: unknown
      properties: {
        kgCityGameplayFeatureKind: string
        kgCityGameplayPlayerSelected?: boolean
      }
    }>
  }
  assert.equal(sourceData.features.length, 3)
  assert.deepEqual(
    sourceData.features.map(feature => feature.properties.kgCityGameplayFeatureKind),
    ['route', 'player', 'goal'],
  )
  assert.equal(
    sourceData.features[0].geometry.type,
    'LineString',
    'the active POI goal is connected to the player by a visible route overlay',
  )
  assert.equal(mapHasExactCityGeoGameplay(map, profile, gameplay, absentFlightRouteAnchor), true)
  const player = deriveRegionalPoiLocators(profile).find(poi => poi.poiId === gameplay.playerPoiId)!
  const goal = deriveRegionalPoiLocators(profile).find(poi => poi.poiId === gameplay.taskPoiId)!
  assert.deepEqual(
    map.easeToCalls.at(-1)?.center,
    [
      deriveRegionalPoiLongitudeSpan([player.coordinate[0], goal.coordinate[0]]).center,
      (player.coordinate[1] + goal.coordinate[1]) / 2,
    ],
    'the route is recentered in the exposed map without changing its zoom',
  )
  assert.deepEqual(map.easeToCalls.at(-1)?.offset, [0, 0])
  const liveLayers = map.getStyle().layers.map(layer => layer.id)
  assert.deepEqual(
    liveLayers.slice(-CITY_GEO_GAMEPLAY_LAYER_ORDER.length),
    [...CITY_GEO_GAMEPLAY_LAYER_ORDER],
  )
  assert.equal(
    liveLayers.includes(`${CITY_GEO_GAMEPLAY_SOURCE_ID}:label`),
    false,
    'the panel names the player and goal so map labels do not collide at dense POIs',
  )

  map.queryFeatures = [{ properties: { kgCityGameplayFeatureKind: 'player' } }]
  map.emit('click', { point: { x: 20, y: 30 } })
  assert.deepEqual(playerSelectionChanges, [true], 'clicking the map character selects it')
  const selectedCoordinate = [player.coordinate[0] + 0.001, player.coordinate[1] + 0.001] as const
  const selected = Object.freeze({
    ...gameplay,
    playerCoordinate: selectedCoordinate,
    playerSelected: true,
    revision: 1,
  })
  current = createCityGeoOverlaySnapshot({
    ...base,
    gameplay: selected,
    revision: 'city-gameplay-selected',
  })
  for (const listener of [...listeners]) listener(current)
  const selectedData = map.getSource(CITY_GEO_GAMEPLAY_SOURCE_ID)?.data as typeof sourceData
  assert.deepEqual(selectedData.features[1].geometry.coordinates, selectedCoordinate)
  assert.equal(selectedData.features[1].properties.kgCityGameplayPlayerSelected, true)
  assert.equal(mapHasExactCityGeoGameplay(map, profile, selected, absentFlightRouteAnchor), true)

  map.queryFeatures = [{
    properties: {
      kgRegionalPoiFeatureKind: 'surface',
      kgRegionalPoiId: profile.pois[3].id,
    },
  }]
  map.emit('click', { point: { x: 40, y: 50 } })
  assert.deepEqual(playerSelectionChanges, [true, false], 'a map click away from the character deselects it')

  const moved = Object.freeze({
    completedTasks: 1,
    playerPoiId: profile.pois[1].id,
    playerSelected: true,
    profileId: profile.id,
    revision: 2,
    taskPoiId: profile.pois[2].id,
  })
  current = createCityGeoOverlaySnapshot({
    ...base,
    gameplay: moved,
    revision: 'city-gameplay-moved',
  })
  for (const listener of [...listeners]) listener(current)
  assert.equal(mapHasExactCityGeoGameplay(map, profile, moved, absentFlightRouteAnchor), true)
  const movedPlayer = deriveRegionalPoiLocators(profile).find(poi => poi.poiId === moved.playerPoiId)!
  const movedGoal = deriveRegionalPoiLocators(profile).find(poi => poi.poiId === moved.taskPoiId)!
  assert.deepEqual(
    map.easeToCalls.at(-1)?.center,
    [
      deriveRegionalPoiLongitudeSpan([
        movedPlayer.coordinate[0],
        movedGoal.coordinate[0],
      ]).center,
      (movedPlayer.coordinate[1] + movedGoal.coordinate[1]) / 2,
    ],
    'a completed trip recenters on the next route',
  )
  assert.deepEqual(map.easeToCalls.at(-1)?.offset, [0, 0])
  const movedData = map.getSource(CITY_GEO_GAMEPLAY_SOURCE_ID)?.data as typeof sourceData
  assert.equal(
    movedData.features[0].id,
    `${profile.id}:route:${profile.pois[1].id}:${profile.pois[2].id}`,
  )
  assert.equal(movedData.features[1].id, `${profile.id}:player:${profile.pois[1].id}`)
  controller.dispose()
  assert.equal(map.getSource(CITY_GEO_GAMEPLAY_SOURCE_ID), undefined)
}

function testCityGameplayRecentersIntoTheUncoveredMapAperture(): void {
  const { dom, restore } = initJsdomHarness()
  const leftPanel = dom.window.document.createElement('aside')
  leftPanel.setAttribute('aria-label', 'Markdown Workspace')
  const viewport = dom.window.document.createElement('div')
  const rightPanel = dom.window.document.createElement('aside')
  rightPanel.setAttribute('aria-label', 'Floating panel')
  const defineRect = (
    element: HTMLElement,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({
        bottom: y + height,
        height,
        left: x,
        right: x + width,
        top: y,
        width,
      }),
    })
  }
  defineRect(leftPanel, 0, 0, 600, 600)
  defineRect(viewport, 0, 0, 1000, 600)
  defineRect(rightPanel, 800, 0, 200, 600)
  Object.defineProperty(viewport, 'clientWidth', { value: 1000 })
  Object.defineProperty(viewport, 'clientHeight', { value: 600 })
  dom.window.document.body.append(leftPanel, viewport, rightPanel)

  const base = createSyntheticSnapshot()
  const profile = base.profile!.regionalPoiProfile
  const gameplay = Object.freeze({
    completedTasks: 0,
    playerPoiId: profile.pois[0].id,
    profileId: profile.id,
    revision: 0,
    taskPoiId: profile.pois[1].id,
  })
  const map = new TestMapLibreMap({ container: viewport })
  const controller = createCityGeoOverlayMapLibreController({
    map,
    readSnapshot: () => createCityGeoOverlaySnapshot({ ...base, gameplay }),
    viewMode: '3d',
  })

  try {
    const offset = map.easeToCalls.at(-1)?.offset as readonly number[]
    assert.ok(offset)
    assert.deepEqual(
      offset.map(Math.round),
      [200, -12],
      'the route center moves from the full map center to the editor/panel-free aperture',
    )
  } finally {
    controller.dispose()
    leftPanel.remove()
    viewport.remove()
    rightPanel.remove()
    restore()
  }
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

function testKeyboardCameraControlsPanOnlyOnFocusedMapAndRespectFineMovement(): void {
  assert.deepEqual(resolveMapLibreKeyboardPanOffset('w'), [0, 72])
  assert.deepEqual(resolveMapLibreKeyboardPanOffset('A'), [72, 0])
  assert.deepEqual(resolveMapLibreKeyboardPanOffset('ArrowDown'), [0, -72])
  assert.deepEqual(resolveMapLibreKeyboardPanOffset('s', true), [0, -28])
  assert.deepEqual(resolveMapLibreKeyboardPanOffset('d', true), [-28, 0])
  assert.equal(resolveMapLibreKeyboardPanOffset('i'), null)
  assert.deepEqual(resolveMapLibreKeyboardCharacterOffset('w'), [0, -10])
  assert.deepEqual(resolveMapLibreKeyboardCharacterOffset('ArrowRight', true), [4, 0])

  const listeners = new Map<string, (event: any) => void>()
  const keyboardListeners = new Map<string, (event: any) => void>()
  const attributes = new Map<string, string>()
  let focusCount = 0
  const container = {
    dataset: {} as Record<string, string>,
    contains: (target: unknown) => target === container,
    addEventListener: (type: string, listener: (event: any) => void) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    focus: () => { focusCount += 1 },
  }
  const panCalls: Array<readonly [readonly number[], Readonly<{ duration: number }>]> = []
  const zoomCalls: string[] = []
  const characterMoves: Array<readonly [number, number]> = []
  let pointerLockTarget: EventTarget | null = null
  let selectedCharacter: readonly [number, number] | null = null
  let walkableFeatures: readonly any[] = [{
    geometry: { coordinates: [[200, 70], [200, 130]], type: 'LineString' },
    layer: { id: 'road_minor', 'source-layer': 'transportation', type: 'line' },
    properties: { class: 'minor' },
    sourceLayer: 'transportation',
  }, {
    geometry: { coordinates: [[170, 100], [230, 100]], type: 'LineString' },
    layer: { id: 'road_minor', 'source-layer': 'transportation', type: 'line' },
    properties: { class: 'minor' },
    sourceLayer: 'transportation',
  }]
  const map = {
    getCanvasContainer: () => container,
    project: (coordinate: readonly number[]) => (
      coordinate[0] === 103.8 && coordinate[1] === 1.3
        ? { x: 200, y: 100 }
        : { x: coordinate[0], y: coordinate[1] }
    ),
    unproject: (point: { x: number; y: number }) => [point.x, point.y],
    queryRenderedFeatures: () => walkableFeatures,
    panBy: (offset: readonly number[], options: Readonly<{ duration: number }>) => {
      panCalls.push([offset, options])
    },
    zoomIn: () => zoomCalls.push('in'),
    zoomOut: () => zoomCalls.push('out'),
  }
  const keyboardEventTarget = {
    addEventListener: (type: string, listener: (event: any) => void) => keyboardListeners.set(type, listener),
    removeEventListener: (type: string) => keyboardListeners.delete(type),
  }
  const dispose = bindMapLibreKeyboardCameraControls(map, keyboardEventTarget as any, {
    isExternalKeyboardFallbackTarget: target => target === pointerLockTarget,
    readSelectedCharacterCoordinate: () => selectedCharacter,
    moveSelectedCharacter: coordinate => {
      characterMoves.push(coordinate)
      return true
    },
  })
  assert.equal(container.dataset.kgMapKeyboardCamera, 'enabled')
  assert.equal(attributes.get('tabindex'), '0')
  listeners.get('pointerdown')?.({ target: null })
  assert.equal(focusCount, 1)
  const dispatch = (input: Record<string, unknown>) => {
    let prevented = false
    keyboardListeners.get('keydown')?.({
      altKey: false,
      ctrlKey: false,
      defaultPrevented: false,
      key: 'w',
      metaKey: false,
      preventDefault: () => { prevented = true },
      stopPropagation: () => void 0,
      shiftKey: false,
      target: container,
      ...input,
    } as any)
    return prevented
  }
  assert.equal(dispatch({ key: 'w' }), true)
  assert.equal(dispatch({ key: 'd', shiftKey: true }), true)
  selectedCharacter = [103.8, 1.3]
  assert.equal(dispatch({ key: 'w' }), true)
  assert.equal(dispatch({ key: 'ArrowRight', shiftKey: true }), true)
  assert.equal(dispatch({ key: 'w', ctrlKey: true }), false)
  assert.equal(dispatch({ key: 'q' }), false)
  assert.equal(dispatch({ key: '+' }), true)
  assert.equal(dispatch({ key: '-' }), true)
  assert.deepEqual(panCalls, [
    [[0, 72], { duration: 120 }],
    [[-28, 0], { duration: 120 }],
  ])
  assert.deepEqual(characterMoves, [
    [200, 90],
    [204, 100],
  ], 'WASD moves a short step along rendered street geometry')
  walkableFeatures = []
  assert.equal(dispatch({ key: 'w' }), true, 'a blocked step is still consumed while the character is selected')
  assert.equal(panCalls.length, 2, 'a blocked character step never pans the camera')
  const lockedGameCanvas = {} as EventTarget
  selectedCharacter = null
  assert.equal(dispatch({ key: 'a', target: lockedGameCanvas }), false, 'unregistered canvas targets cannot move the map')
  pointerLockTarget = lockedGameCanvas
  assert.equal(dispatch({ key: 'a', target: lockedGameCanvas }), true, 'the ended game hands pointer-locked WASD back to map navigation')
  assert.equal(panCalls.length, 3)
  assert.deepEqual(panCalls[2], [[72, 0], { duration: 120 }])
  assert.deepEqual(zoomCalls, ['in', 'out'])
  dispose()
  assert.equal(keyboardListeners.has('keydown'), false)
  assert.equal(listeners.has('pointerdown'), false)
  assert.equal(container.dataset.kgMapKeyboardCamera, undefined)
  assert.equal(attributes.has('tabindex'), false)
}

function testMapLibreWalkableSurfaceRejectsBuildingsAndWaterAndSnapsToLines(): void {
  const roadway = {
    geometry: { coordinates: [[0, 0], [20, 0]], type: 'LineString' },
    layer: { id: 'road_secondary', 'source-layer': 'transportation', type: 'line' },
    properties: { class: 'secondary' },
    sourceLayer: 'transportation',
  }
  assert.equal(isMapLibreWalkableLineFeature(roadway), true)
  assert.equal(isMapLibreWalkableLineFeature({
    ...roadway,
    geometry: { coordinates: [[[0, 0], [20, 0]]], type: 'MultiLineString' },
    properties: { class: 'path' },
  }), true)
  assert.equal(isMapLibreWalkableLineFeature({
    ...roadway,
    geometry: { coordinates: [[0, 0], [20, 0]], type: 'Polygon' },
  }), false, 'building polygons cannot be walked on')
  assert.equal(isMapLibreWalkableLineFeature({
    ...roadway,
    properties: { class: 'motorway' },
  }), false)
  assert.equal(isMapLibreWalkableLineFeature({
    ...roadway,
    properties: { class: 'path', foot: 'no' },
  }), false)
  assert.equal(isMapLibreWalkableLineFeature({
    ...roadway,
    properties: { class: 'path', ramp: 1 },
  }), false)

  const map = {
    project: (coordinate: readonly number[]) => ({ x: coordinate[0], y: coordinate[1] }),
    unproject: (point: { x: number; y: number }) => [point.x, point.y],
    queryRenderedFeatures: () => [roadway, {
      geometry: { coordinates: [[0, 2], [20, 2]], type: 'LineString' },
      layer: { id: 'water', type: 'line' },
      properties: { class: 'ocean' },
      sourceLayer: 'water',
    }],
  }
  assert.deepEqual(findNearestMapLibreWalkablePoint(map, { x: 5, y: 3 }, 4), {
    coordinate: [5, 0],
    distancePx: 3,
    point: { x: 5, y: 0 },
  })
  assert.equal(findNearestMapLibreWalkablePoint(map, { x: 5, y: 3 }, 2), null)
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
