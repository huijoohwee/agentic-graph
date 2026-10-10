import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deriveRegionalPoiLocators,
  deriveRegionalPoiLongitudeSpan,
} from 'grph-shared/geospatial/regionalPoiGeo'
import { SINGAPORE_MAJOR_POI_GEO_PROFILE } from 'grph-shared/geospatial/singaporeMajorPoiGeo'
import {
  alignGameModeGeoOverlayToWalkableMap,
  applyGameModeGeoOverlayMapFrame,
  applyGameModeGeoOverlayToMap,
  clearGameModeGeoOverlayFromMap,
  deriveGameModeCityMapFrame,
  deriveXrEnvironmentMapFrame,
  gameModeNeedsMapKeyboardFallback,
  gameModeOwnsKeyboardInput,
  gameModeGeoOverlayFeatureCollection,
  GAME_MODE_GEO_OVERLAY_LAYER_IDS,
  GAME_MODE_GEO_OVERLAY_SOURCE_ID,
  type GameModeGeoOverlaySnapshot,
} from '../../../gympgrph/src/gameModeGeoOverlayMapLibre.js'
import { regionalPoiProfileBounds } from '../../../gympgrph/src/regionalPoiMapLibreProjection.js'
import type { CityGeoOverlaySnapshot } from '../../../gympgrph/src/cityGeoOverlay.js'

test('terminal Game Mode returns WASD to map navigation while live missions keep actor movement', () => {
  assert.equal(gameModeNeedsMapKeyboardFallback({ active: false, phase: 'lost' }), false)
  assert.equal(gameModeNeedsMapKeyboardFallback({ active: true, phase: 'playing' }), false)
  assert.equal(gameModeNeedsMapKeyboardFallback({ active: true, phase: 'lost' }), true)
  assert.equal(gameModeNeedsMapKeyboardFallback({ active: true, phase: 'won' }), true)
  assert.equal(gameModeNeedsMapKeyboardFallback({ active: true, phase: 'stopped' }), false)
  assert.equal(gameModeNeedsMapKeyboardFallback({ active: true, gameplayActive: false, phase: 'lost' }), false)
  assert.equal(gameModeNeedsMapKeyboardFallback({ active: true }), false)
  assert.equal(gameModeOwnsKeyboardInput({ active: true, gameplayActive: true, phase: 'playing' }), true)
  assert.equal(gameModeOwnsKeyboardInput({ active: true, gameplayActive: true, phase: 'stopped' }), true)
  assert.equal(gameModeOwnsKeyboardInput({ active: true, gameplayActive: true, phase: 'lost' }), false)
  assert.equal(gameModeOwnsKeyboardInput({ active: true, gameplayActive: false, phase: 'stopped' }), false)
})

test('Game Mode actors project onto the MapLibre map plane around its current center', () => {
  const snapshot: GameModeGeoOverlaySnapshot = {
    active: true,
    runId: 4,
    tick: 12,
    player: { x: 0, z: 0 },
    npcs: [
      { id: 'npc-scout', x: 10, z: -10, action: 'alert', health: 80 },
      { id: 'npc-west', x: -8, z: 2, action: 'hold', health: 0 },
    ],
  }
  const origin = { lng: 103.85, lat: 1.3 }
  const collection = gameModeGeoOverlayFeatureCollection(snapshot, origin)

  assert.equal(collection.features.length, 2)
  const player = collection.features.find(feature => feature.properties.actorKind === 'player')
  const scout = collection.features.find(feature => feature.properties.actorId === 'npc-scout')
  assert.deepEqual(player?.geometry.coordinates, [origin.lng, origin.lat])
  assert.ok((scout?.geometry.coordinates[0] || 0) > origin.lng)
  assert.ok((scout?.geometry.coordinates[1] || 0) > origin.lat)
  assert.equal(scout?.properties.action, 'alert')
})

test('shared Media subjects and props project onto the same Geo+XR plane and retain their authored positions', () => {
  const origin = { lng: 103.85, lat: 1.3 }
  const snapshot: GameModeGeoOverlaySnapshot = {
    active: true,
    runId: 7,
    tick: 0,
    player: { x: 0, z: 0 },
    npcs: [],
    assets: [{
      id: 'xr-subject:pig:1',
      assetId: 'pig-performer',
      category: 'people',
      label: 'Pig performer',
      color: '#f97316',
      x: 8,
      z: -4,
      scale: 0.82,
      selected: true,
    }],
  }
  const collection = gameModeGeoOverlayFeatureCollection(snapshot, origin)
  const asset = collection.features.find(feature => feature.properties.actorId === 'xr-subject:pig:1')
  assert.deepEqual(asset?.geometry.coordinates, [
    origin.lng + 8 / (111_320 * Math.cos(origin.lat * Math.PI / 180)),
    origin.lat + 4 / 111_320,
  ])
  assert.equal(asset?.properties.assetId, 'pig-performer')
  assert.equal(asset?.properties.label, 'Pig performer')
  assert.equal(asset?.properties.selected, true)

  const map = {
    project: ([lng, lat]: readonly [number, number]) => ({ x: lng * 100_000, y: lat * 100_000 }),
    unproject: ({ x, y }: { x: number; y: number }) => ({ lng: x / 100_000, lat: y / 100_000 }),
    queryRenderedFeatures: () => [{
      type: 'Feature',
      sourceLayer: 'transportation',
      properties: { class: 'residential' },
      layer: { id: 'transportation' },
      geometry: { type: 'LineString', coordinates: [[0, 0], [0.01, 0]] },
    }],
  }
  const aligned = alignGameModeGeoOverlayToWalkableMap(map, collection)
  assert.deepEqual(aligned.features.find(feature => feature.properties.actorKind === 'asset')?.geometry.coordinates, asset?.geometry.coordinates)
})

test('Geo+XR can present shared Media assets without duplicating Game Mode actors', () => {
  const collection = gameModeGeoOverlayFeatureCollection({
    active: true,
    gameplayActive: false,
    runId: 0,
    tick: 0,
    player: { x: 0, z: 0 },
    npcs: [{ id: 'npc-scout', x: 2, z: 3, action: 'hold', health: 100 }],
    assets: [{
      id: 'xr-subject:wolf',
      assetId: 'wolf',
      category: 'animals',
      label: 'The Wolf',
      color: '#64748b',
      x: 1,
      z: -1,
    }],
  }, { lng: 103.85, lat: 1.3 })

  assert.equal(collection.features.length, 1)
  assert.equal(collection.features[0].properties.actorKind, 'asset')
  assert.equal(collection.features[0].properties.actorId, 'xr-subject:wolf')
})

test('inactive Game Mode does not publish map-plane actors', () => {
  const collection = gameModeGeoOverlayFeatureCollection({
    active: false,
    runId: 0,
    tick: 0,
    player: { x: 0, z: 0 },
    npcs: [],
  }, { lng: 0, lat: 0 })
  assert.deepEqual(collection.features, [])
})

test('Game Mode actor points snap to rendered MapLibre streets and paths', () => {
  const collection = gameModeGeoOverlayFeatureCollection({
    active: true,
    runId: 1,
    tick: 0,
    player: { x: 0, z: 0 },
    npcs: [{ id: 'npc-scout', x: 6, z: 4, action: 'hold', health: 100 }],
  }, { lng: 0.004, lat: 0.0001 })
  const street = {
    type: 'Feature',
    sourceLayer: 'transportation',
    properties: { class: 'residential' },
    layer: { id: 'transportation' },
    geometry: { type: 'LineString', coordinates: [[0, 0], [0.01, 0]] },
  }
  const map = {
    project: ([lng, lat]: readonly [number, number]) => ({ x: lng * 100_000, y: lat * 100_000 }),
    unproject: ({ x, y }: { x: number; y: number }) => ({ lng: x / 100_000, lat: y / 100_000 }),
    queryRenderedFeatures: () => [street],
  }
  const aligned = alignGameModeGeoOverlayToWalkableMap(map, collection)

  assert.equal(aligned.features.length, 2)
  for (const feature of aligned.features) {
    assert.ok(Math.abs(feature.geometry.coordinates[1]) < 1e-10)
  }
})

test('Game Mode actors keep their shared City coordinates when a path is not nearby', () => {
  const origin = { lng: 0.004, lat: 0.0001 }
  const collection = gameModeGeoOverlayFeatureCollection({
    active: true,
    runId: 3,
    tick: 0,
    player: { x: 0, z: 0 },
    npcs: [{ id: 'npc-scout', x: 10, z: -10, action: 'hold', health: 100 }],
  }, origin)
  const map = {
    project: ([lng, lat]: readonly [number, number]) => ({ x: lng * 100_000, y: lat * 100_000 }),
    unproject: ({ x, y }: { x: number; y: number }) => ({ lng: x / 100_000, lat: y / 100_000 }),
    queryRenderedFeatures: () => [{
      type: 'Feature',
      sourceLayer: 'transportation',
      properties: { class: 'residential' },
      layer: { id: 'transportation' },
      geometry: { type: 'LineString', coordinates: [[0, 0], [0.001, 0]] },
    }],
  }

  const aligned = alignGameModeGeoOverlayToWalkableMap(map, collection)
  assert.deepEqual(
    aligned.features.map(feature => feature.geometry.coordinates),
    collection.features.map(feature => feature.geometry.coordinates),
  )
})

test('Game Mode reuses the City regional extent, route center, and viewport padding', () => {
  const calls: Array<{ name: string; value: unknown }> = []
  let padding = { bottom: 0, left: 0, right: 0, top: 0 }
  const container = { clientWidth: 800, clientHeight: 600 }
  const map = {
    getContainer: () => container,
    getPadding: () => padding,
    setPadding: (value: typeof padding) => { padding = value },
    fitBounds: (bounds: unknown, options: unknown) => calls.push({ name: 'fitBounds', value: { bounds, options } }),
    easeTo: (options: unknown) => calls.push({ name: 'easeTo', value: options }),
  }
  const frame = {
    id: 'regional-profile:poi-route',
    bounds: [[103.7, 1.2], [104, 1.5]] as const,
    center: [103.85, 1.35] as const,
    origin: [103.8, 1.3] as const,
    framing: {
      '2d': { bearingDegrees: 0, maxZoom: 18, paddingPixels: 48, pitchDegrees: 0 },
      '3d': { bearingDegrees: 0, maxZoom: 18, paddingPixels: 48, pitchDegrees: 46 },
    },
  }

  assert.equal(applyGameModeGeoOverlayMapFrame(map, frame, '2d'), true)
  assert.deepEqual(calls.map(call => call.name), ['fitBounds', 'easeTo'])
  const fitted = calls[0].value as { bounds: unknown; options: Record<string, unknown> }
  assert.deepEqual(fitted.bounds, frame.bounds)
  assert.equal(fitted.options.pitch, 0)
  const computedPadding = fitted.options.padding as Record<string, number>
  assert.equal(computedPadding.left, 112)
  assert.equal(computedPadding.right, 112)
  assert.ok(Math.abs(computedPadding.bottom - 129.6) < 1e-8)
  assert.ok(Math.abs(computedPadding.top - 105.6) < 1e-8)
  assert.equal((calls[1].value as { center: unknown }).center, frame.center)

  calls.length = 0
  assert.equal(applyGameModeGeoOverlayMapFrame(map, frame, '3d'), true)
  assert.equal(((calls[0].value as { options: Record<string, unknown> }).options).pitch, 46)
})

test('Game Mode derives identical bounds, route center, origin, and framing from City', () => {
  const regionalPoiProfile = SINGAPORE_MAJOR_POI_GEO_PROFILE
  const locators = deriveRegionalPoiLocators(regionalPoiProfile)
  const [player, goal] = locators
  assert.ok(player)
  assert.ok(goal)
  const playerCoordinate = [player.coordinate[0] + 0.0001, player.coordinate[1] + 0.0002] as const
  const framing = {
    '2d': { bearingDegrees: 0, maxZoom: 18, paddingPixels: 48, pitchDegrees: 0 },
    '3d': { bearingDegrees: 0, maxZoom: 18, paddingPixels: 48, pitchDegrees: 46 },
  }
  const cityContext = {
    active: true,
    profile: { regionalPoiProfile, framing },
    gameplay: {
      completedTasks: 0,
      playerCoordinate,
      playerPoiId: player.poiId,
      profileId: regionalPoiProfile.id,
      revision: 1,
      taskPoiId: goal.poiId,
    },
  } as unknown as CityGeoOverlaySnapshot

  const frame = deriveGameModeCityMapFrame(cityContext)
  assert.ok(frame)
  assert.deepEqual(frame.bounds, regionalPoiProfileBounds(regionalPoiProfile))
  assert.deepEqual(frame.origin, playerCoordinate)
  assert.deepEqual(frame.center, [
    deriveRegionalPoiLongitudeSpan([playerCoordinate[0], goal.coordinate[0]]).center,
    (playerCoordinate[1] + goal.coordinate[1]) / 2,
  ])
  assert.deepEqual(frame.framing, framing)
  assert.equal(frame.zoom, undefined)
})

test('shared Geo+XR framing zooms the existing map to the selected Media environment footprint', () => {
  const anchor = [103.86, 1.29] as const
  const cityFrame = {
    id: 'singapore-city',
    bounds: [[103.7, 1.2], [104, 1.5]],
    origin: anchor,
    framing: {
      '2d': { bearingDegrees: 0, maxZoom: 18, paddingPixels: 48, pitchDegrees: 0 },
      '3d': { bearingDegrees: 0, maxZoom: 18, paddingPixels: 48, pitchDegrees: 46 },
    },
  } as const
  const environment = {
    id: 'terrain:singapore',
    label: 'Singapore',
    anchor,
    presentationBounds: cityFrame.bounds,
    revision: '1',
    stageFootprint: [
      [103.85982, 1.28989],
      [103.86018, 1.28989],
      [103.86018, 1.29011],
      [103.85982, 1.29011],
    ] as const,
    surfaces: [],
  }
  const frame = deriveXrEnvironmentMapFrame(environment, cityFrame)

  assert.ok(frame)
  assert.equal(frame.id, 'singapore-city:terrain:singapore:1:scene-frame')
  assert.deepEqual(frame.origin, anchor)
  assert.deepEqual(frame.center, anchor)
  assert.deepEqual(frame.bounds, [[103.85982, 1.28989], [103.86018, 1.29011]])
  assert.ok((frame.bounds[1][0] - frame.bounds[0][0]) < (cityFrame.bounds[1][0] - cityFrame.bounds[0][0]) / 100)
  assert.equal(frame.framing['3d'].pitchDegrees, 46)
  assert.equal(frame.framing['3d'].maxZoom, 21)
})

test('Game Mode updates and clears its actors on the shared MapLibre map', () => {
  const sources = new Map<string, { data: unknown; setData: (data: unknown) => void }>()
  const layers = new Map<string, unknown>()
  const map = {
    style: { _loaded: true },
    getSource: (id: string) => sources.get(id),
    addSource: (id: string, definition: { data: unknown }) => {
      sources.set(id, {
        data: definition.data,
        setData(data) { this.data = data },
      })
    },
    removeSource: (id: string) => sources.delete(id),
    getLayer: (id: string) => layers.get(id),
    addLayer: (definition: { id: string }) => layers.set(definition.id, definition),
    removeLayer: (id: string) => layers.delete(id),
  }
  const firstSnapshot: GameModeGeoOverlaySnapshot = {
    active: true,
    runId: 2,
    tick: 0,
    player: { x: 0, z: 0 },
    npcs: [{ id: 'npc-scout', x: 2, z: 3, action: 'hold', health: 100 }],
    assets: [{ id: 'xr-subject:crate:1', assetId: 'prop-crate', category: 'props', label: 'Crate', color: '#14b8a6', x: 4, z: 5 }],
  }

  assert.equal(applyGameModeGeoOverlayToMap(map, firstSnapshot, { lng: 103.8, lat: 1.3 }), true)
  assert.equal(sources.get(GAME_MODE_GEO_OVERLAY_SOURCE_ID)?.data && (
    (sources.get(GAME_MODE_GEO_OVERLAY_SOURCE_ID)?.data as { features?: unknown[] }).features?.length
  ), 3)
  assert.deepEqual([...layers.keys()], [
    GAME_MODE_GEO_OVERLAY_LAYER_IDS.npcs,
    GAME_MODE_GEO_OVERLAY_LAYER_IDS.assets,
    GAME_MODE_GEO_OVERLAY_LAYER_IDS.assetLabels,
    GAME_MODE_GEO_OVERLAY_LAYER_IDS.player,
  ])

  assert.equal(applyGameModeGeoOverlayToMap(map, {
    ...firstSnapshot,
    tick: 1,
    npcs: [],
  }, { lng: 103.8, lat: 1.3 }), true)
  assert.equal(
    (sources.get(GAME_MODE_GEO_OVERLAY_SOURCE_ID)?.data as { features?: unknown[] }).features?.length,
    2,
  )
  assert.equal(clearGameModeGeoOverlayFromMap(map), true)
  assert.equal(sources.size, 0)
  assert.equal(layers.size, 0)
})
