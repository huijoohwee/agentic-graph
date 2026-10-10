import type { Feature, FeatureCollection, Point } from 'geojson'
import {
  deriveRegionalPoiLocators,
  deriveRegionalPoiLongitudeSpan,
  type RegionalPoiProfile,
} from 'grph-shared/geospatial/regionalPoiGeo'
import { findNearestMapLibreWalkablePoint } from './features/geospatial/mapLibreWalkableSurface.js'
import { readGeoMapPresentationPadding } from './geoMapViewport.js'
import { isMapLibreStyleReady } from './maplibreLayers.js'
import type { CityGeoOverlaySnapshot } from './cityGeoOverlay.js'
import type { FlightGeoEnvironmentProjection } from './flightGeoOverlay.js'
import { regionalPoiProfileBounds } from './regionalPoiMapLibreProjection.js'

export const GAME_MODE_GEO_OVERLAY_SOURCE_ID = 'kg-game-mode:actors'
export const GAME_MODE_GEO_OVERLAY_LAYER_IDS = Object.freeze({
  npcs: `${GAME_MODE_GEO_OVERLAY_SOURCE_ID}:npcs`,
  assets: `${GAME_MODE_GEO_OVERLAY_SOURCE_ID}:assets`,
  assetLabels: `${GAME_MODE_GEO_OVERLAY_SOURCE_ID}:asset-labels`,
  player: `${GAME_MODE_GEO_OVERLAY_SOURCE_ID}:player`,
})

export type GameModeGeoOverlayActor = Readonly<{
  id: string
  x: number
  z: number
  action?: 'hold' | 'alert' | 'engage' | 'flee'
  health?: number
}>

export type GameModeGeoOverlayAsset = Readonly<{
  id: string
  assetId: string
  category: 'people' | 'animals' | 'vehicles' | 'furniture' | 'props'
  label: string
  color: string
  x: number
  z: number
  scale?: number
  selected?: boolean
}>

export type GameModeGeoOverlayPhase = 'playing' | 'won' | 'lost' | 'stopped'

export type GameModeGeoOverlaySnapshot = Readonly<{
  active: boolean
  /** False when the same shared map is presenting Media objects without an active Game Mode mission. */
  gameplayActive?: boolean
  /** A terminal mission cannot consume movement input, so WASD returns to map navigation. */
  phase?: GameModeGeoOverlayPhase
  runId: number
  tick: number
  mapFrame?: GameModeGeoOverlayMapFrame | null
  cityContext?: CityGeoOverlaySnapshot | null
  /** The selected Media terrain kit, projected with the shared Geo+XR coordinate frame. */
  environment?: FlightGeoEnvironmentProjection | null
  player: Readonly<{ x: number; z: number }>
  npcs: readonly GameModeGeoOverlayActor[]
  /** Objects authored through the shared Media → Subjects & Props catalog. */
  assets?: readonly GameModeGeoOverlayAsset[]
}>

export function gameModeNeedsMapKeyboardFallback(
  snapshot: Pick<GameModeGeoOverlaySnapshot, 'active' | 'phase' | 'gameplayActive'> | null | undefined,
): boolean {
  return snapshot?.active === true
    && snapshot.gameplayActive !== false
    && (snapshot.phase === 'won' || snapshot.phase === 'lost')
}

/**
 * Once Game Mode is active, it owns WASD until a mission reaches a terminal
 * state. That includes the short ready/stopped interval before the first
 * movement key arms the mission; otherwise MapLibre can consume that key as
 * camera input before the gameplay listener sees it.
 */
export function gameModeOwnsKeyboardInput(
  snapshot: Pick<GameModeGeoOverlaySnapshot, 'active' | 'phase' | 'gameplayActive'> | null | undefined,
): boolean {
  return snapshot?.active === true
    && snapshot.gameplayActive === true
    && !gameModeNeedsMapKeyboardFallback(snapshot)
}

export type GameModeGeoOverlayOrigin = Readonly<{ lng: number; lat: number }>
export type GameModeGeoOverlayMapFrame = Readonly<{
  id: string
  bounds: readonly [readonly [number, number], readonly [number, number]]
  center?: readonly [number, number]
  origin?: readonly [number, number]
  zoom?: number
  framing: Readonly<Record<'2d' | '3d', Readonly<{
    bearingDegrees: number
    maxZoom: number
    paddingPixels: number
    pitchDegrees: number
  }>>>
}>

type GameModeGeoOverlayProperties = Readonly<{
  actorId: string
  actorKind: 'player' | 'npc' | 'asset'
  action: 'hold' | 'alert' | 'engage' | 'flee'
  health: number
  assetId?: string
  category?: GameModeGeoOverlayAsset['category']
  label?: string
  color?: string
  scale?: number
  selected?: boolean
}>

export type GameModeGeoOverlayFeatureCollection = FeatureCollection<Point, GameModeGeoOverlayProperties>

const GAME_MODE_ACTOR_SNAP_RADIUS_PX = 18

/**
 * Build Game Mode framing from the exact City profile and route. This keeps
 * the shared map at City scale while Game Mode adds its own actors.
 */
export function deriveGameModeCityMapFrame(
  cityContext: CityGeoOverlaySnapshot | null | undefined,
): GameModeGeoOverlayMapFrame | null {
  const profile = cityContext?.active ? cityContext.profile?.regionalPoiProfile : null
  if (!profile || !cityContext?.profile) return null

  const locators = deriveRegionalPoiLocators(profile)
  if (locators.length === 0) return null
  const gameplay = cityContext.gameplay
  const player = locators.find(locator => locator.poiId === gameplay?.playerPoiId) || locators[0]
  const goal = gameplay?.profileId === profile.id
    ? locators.find(locator => locator.poiId === gameplay.taskPoiId)
    : null
  const origin = gameplay?.profileId === profile.id
    ? gameplay.playerCoordinate || player.coordinate
    : player.coordinate
  const center = goal
    ? Object.freeze([
      deriveRegionalPoiLongitudeSpan([origin[0], goal.coordinate[0]]).center,
      (origin[1] + goal.coordinate[1]) / 2,
    ]) as readonly [number, number]
    : undefined
  const bounds = regionalPoiProfileBounds(profile)
  const framing = cityContext.profile.framing

  return Object.freeze({
    id: [
      cityContext.profile.id,
      cityContext.profile.revision,
      profile.id,
      profile.revision,
      gameplay?.playerPoiId || player.poiId,
      gameplay?.taskPoiId || 'no-route',
      origin.join(','),
      goal ? 'city-route-frame-v1' : 'city-profile-frame-v1',
    ].join(':'),
    bounds,
    ...(center ? { center } : {}),
    origin: Object.freeze([origin[0], origin[1]] as const),
    framing,
  })
}

/** Frame shared Geo+XR content without replacing the active City extent. */
export function deriveXrEnvironmentMapFrame(
  environment: FlightGeoEnvironmentProjection | null | undefined,
  cityFrame?: GameModeGeoOverlayMapFrame | null,
): GameModeGeoOverlayMapFrame | null {
  const coordinates = environment?.stageFootprint
    ?.filter(point => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite))
  if (!environment || !coordinates || coordinates.length < 3) return cityFrame || null
  const longitudes = coordinates.map(point => Number(point[0]))
  const latitudes = coordinates.map(point => Number(point[1]))
  const cityBounds = cityFrame?.bounds
  const allLongitudes = cityBounds
    ? [...longitudes, cityBounds[0][0], cityBounds[1][0]]
    : longitudes
  const longitudeSpan = deriveRegionalPoiLongitudeSpan(allLongitudes)
  const minLng = longitudeSpan.west
  const maxLng = longitudeSpan.east
  const minLat = Math.min(...latitudes, ...(cityBounds ? [cityBounds[0][1]] : []))
  const maxLat = Math.max(...latitudes, ...(cityBounds ? [cityBounds[1][1]] : []))
  if (![minLng, maxLng, minLat, maxLat].every(Number.isFinite) || minLng === maxLng || minLat === maxLat) {
    return cityFrame || null
  }
  const fallbackFraming = Object.freeze({
    '2d': Object.freeze({ bearingDegrees: 0, maxZoom: 21, paddingPixels: 40, pitchDegrees: 0 }),
    '3d': Object.freeze({ bearingDegrees: 0, maxZoom: 21, paddingPixels: 40, pitchDegrees: 55 }),
  })
  const framing = cityFrame?.framing || fallbackFraming
  return Object.freeze({
    id: `${cityFrame?.id || 'geo-xr'}:${environment.id}:${environment.revision}:scene-frame`,
    bounds: Object.freeze([Object.freeze([minLng, minLat] as const), Object.freeze([maxLng, maxLat] as const)] as const),
    ...(cityFrame?.center ? { center: cityFrame.center } : {}),
    origin: cityFrame?.origin || Object.freeze([environment.anchor[0], environment.anchor[1]] as const),
    framing: Object.freeze({
      '2d': cityFrame?.framing['2d'] || Object.freeze({ ...framing['2d'], maxZoom: Math.max(21, framing['2d'].maxZoom), paddingPixels: 40, pitchDegrees: 0 }),
      '3d': cityFrame?.framing['3d'] || Object.freeze({ ...framing['3d'], maxZoom: Math.max(21, framing['3d'].maxZoom), paddingPixels: 40, pitchDegrees: Math.max(45, framing['3d'].pitchDegrees) }),
    }),
  })
}

function localMetersToCoordinate(
  point: Readonly<{ x: number; z: number }>,
  origin: GameModeGeoOverlayOrigin,
): readonly [number, number] {
  const metersPerDegreeLatitude = 111_320
  const metersPerDegreeLongitude = metersPerDegreeLatitude
    * Math.max(0.01, Math.abs(Math.cos(origin.lat * Math.PI / 180)))
  return [
    origin.lng + point.x / metersPerDegreeLongitude,
    origin.lat - point.z / metersPerDegreeLatitude,
  ]
}

function assetToEnvironmentCoordinate(
  point: Readonly<{ x: number; z: number }>,
  environment: FlightGeoEnvironmentProjection | null | undefined,
  origin: GameModeGeoOverlayOrigin,
): readonly [number, number] {
  const localLayoutFrame = environment?.localLayoutFrame
  if (!localLayoutFrame) return localMetersToCoordinate(point, origin)
  const [[minX, minZ], [maxX, maxZ]] = localLayoutFrame.sourceBoundsMeters
  const [southwest, northeast] = environment.presentationBounds
  const xFraction = maxX > minX ? (point.x - minX) / (maxX - minX) : 0.5
  const zFraction = maxZ > minZ ? (point.z - minZ) / (maxZ - minZ) : 0.5
  return [
    southwest[0] + xFraction * (northeast[0] - southwest[0]),
    northeast[1] - zFraction * (northeast[1] - southwest[1]),
  ]
}

export function gameModeGeoOverlayFeatureCollection(
  snapshot: GameModeGeoOverlaySnapshot,
  origin: GameModeGeoOverlayOrigin,
): GameModeGeoOverlayFeatureCollection {
  if (!snapshot.active) return { type: 'FeatureCollection', features: [] }
  const features: Feature<Point, GameModeGeoOverlayProperties>[] = []
  const addActor = (
    actor: Readonly<{ id: string; x: number; z: number; action?: GameModeGeoOverlayProperties['action']; health?: number }>,
    actorKind: GameModeGeoOverlayProperties['actorKind'],
  ) => {
    if (!Number.isFinite(actor.x) || !Number.isFinite(actor.z)) return
    const health = Number.isFinite(actor.health) ? Math.max(0, Number(actor.health)) : 100
    if (actorKind === 'npc' && health <= 0) return
    features.push({
      type: 'Feature',
      id: `game-mode:${snapshot.runId}:${actorKind}:${actor.id}`,
      geometry: { type: 'Point', coordinates: [...localMetersToCoordinate(actor, origin)] },
      properties: {
        actorId: actor.id,
        actorKind,
        action: actor.action || 'hold',
        health,
      },
    })
  }
  if (snapshot.gameplayActive !== false) {
    addActor({ ...snapshot.player, id: 'player' }, 'player')
    for (const npc of snapshot.npcs) addActor(npc, 'npc')
  }
  for (const asset of snapshot.assets || []) {
    if (!Number.isFinite(asset.x) || !Number.isFinite(asset.z) || !asset.id.trim()) continue
    features.push({
      type: 'Feature',
      id: `game-mode:${snapshot.runId}:asset:${asset.id}`,
      geometry: { type: 'Point', coordinates: [...assetToEnvironmentCoordinate(asset, snapshot.environment, origin)] },
      properties: {
        actorId: asset.id,
        actorKind: 'asset',
        action: 'hold',
        health: 100,
        assetId: asset.assetId,
        category: asset.category,
        label: asset.label,
        color: asset.color,
        scale: Number.isFinite(asset.scale) ? Math.max(0.1, Math.min(10, Number(asset.scale))) : 1,
        selected: asset.selected === true,
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

export function alignGameModeGeoOverlayToWalkableMap(
  map: any,
  collection: GameModeGeoOverlayFeatureCollection,
): GameModeGeoOverlayFeatureCollection {
  if (!collection.features.length || typeof map?.project !== 'function') return collection
  try {
    return {
      type: 'FeatureCollection',
      features: collection.features.map(feature => {
        // Authored Media objects belong at their exact scene coordinates. Only
        // live gameplay actors receive the bounded street/path snap.
        if (feature.properties.actorKind === 'asset') return feature
        const coordinate = feature.geometry.coordinates
        const screenPoint = map.project(coordinate)
        const walkable = findNearestMapLibreWalkablePoint(
          map,
          { x: Number(screenPoint?.x), y: Number(screenPoint?.y) },
          GAME_MODE_ACTOR_SNAP_RADIUS_PX,
        )
        return walkable?.coordinate
          ? {
            ...feature,
            geometry: { type: 'Point', coordinates: [...walkable.coordinate] },
          }
          : feature
      }),
    }
  } catch {
    return collection
  }
}

export function applyGameModeGeoOverlayMapFrame(
  map: any,
  frame: GameModeGeoOverlayMapFrame | null | undefined,
  viewMode: '2d' | '3d',
): boolean {
  if (!map || !frame || typeof map.fitBounds !== 'function') return false
  const bounds = frame.bounds
  const framing = frame.framing[viewMode]
  if (
    !Array.isArray(bounds)
    || bounds.length !== 2
    || bounds.some(point => !Array.isArray(point)
      || point.length !== 2
      || !point.every(Number.isFinite))
    || ![framing.bearingDegrees, framing.maxZoom, framing.paddingPixels, framing.pitchDegrees].every(Number.isFinite)
  ) return false
  try {
    const padding = readGeoMapPresentationPadding(map, framing.paddingPixels)
    map.setPadding?.({ bottom: 0, left: 0, right: 0, top: 0 })
    if (frame.center && Number.isFinite(frame.zoom) && typeof map.easeTo === 'function') {
      map.easeTo({
        center: frame.center,
        zoom: Math.min(Number(frame.zoom), framing.maxZoom),
        bearing: framing.bearingDegrees,
        pitch: framing.pitchDegrees,
        duration: 0,
        offset: [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2],
      })
    } else {
      map.fitBounds(bounds, {
        bearing: framing.bearingDegrees,
        duration: 0,
        maxZoom: framing.maxZoom,
        padding,
        pitch: framing.pitchDegrees,
      })
      if (frame.center && typeof map.easeTo === 'function') {
        map.easeTo({
          center: frame.center,
          duration: 0,
          offset: [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2],
        })
      }
    }
    return true
  } catch (error) {
    console.error('[kg-game-mode] MapLibre regional framing failed.', error)
    return false
  }
}

const GAME_MODE_NPC_LAYER = Object.freeze({
  id: GAME_MODE_GEO_OVERLAY_LAYER_IDS.npcs,
  type: 'circle',
  source: GAME_MODE_GEO_OVERLAY_SOURCE_ID,
  filter: ['==', ['get', 'actorKind'], 'npc'],
  paint: {
    'circle-color': [
      'match', ['get', 'action'],
      'alert', '#facc15',
      'engage', '#ef4444',
      'flee', '#c084fc',
      '#334155',
    ],
    'circle-radius': 6,
    'circle-pitch-alignment': 'viewport',
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 2,
  },
})

const GAME_MODE_PLAYER_LAYER = Object.freeze({
  id: GAME_MODE_GEO_OVERLAY_LAYER_IDS.player,
  type: 'circle',
  source: GAME_MODE_GEO_OVERLAY_SOURCE_ID,
  filter: ['==', ['get', 'actorKind'], 'player'],
  paint: {
    'circle-color': '#111827',
    'circle-opacity': 0.16,
    'circle-radius': 11,
    'circle-pitch-alignment': 'viewport',
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 3,
  },
})

const GAME_MODE_ASSET_LAYER = Object.freeze({
  id: GAME_MODE_GEO_OVERLAY_LAYER_IDS.assets,
  // The shared XR Media renderer supplies the faithful 3D mesh above the map.
  // Keep a small placement anchor here for map-only/fallback contexts instead
  // of drawing a second, flat catalog illustration over the same asset.
  type: 'circle',
  source: GAME_MODE_GEO_OVERLAY_SOURCE_ID,
  filter: ['==', ['get', 'actorKind'], 'asset'],
  paint: {
    'circle-color': ['get', 'color'],
    'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 5, 3],
    'circle-opacity': 0.82,
    'circle-pitch-alignment': 'viewport',
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 1.5,
  },
})

const GAME_MODE_ASSET_LABEL_LAYER = Object.freeze({
  id: GAME_MODE_GEO_OVERLAY_LAYER_IDS.assetLabels,
  type: 'symbol',
  source: GAME_MODE_GEO_OVERLAY_SOURCE_ID,
  filter: ['==', ['get', 'actorKind'], 'asset'],
  layout: {
    'text-field': ['get', 'label'],
    'text-font': ['Noto Sans Regular'],
    'text-size': 11,
    'text-offset': [0, 1.2],
    'text-anchor': 'top',
    'text-allow-overlap': true,
  },
  paint: {
    'text-color': '#172554',
    'text-halo-color': '#ffffff',
    'text-halo-width': 1.5,
  },
})

const GAME_MODE_LAYER_DEFINITIONS = [GAME_MODE_NPC_LAYER, GAME_MODE_ASSET_LAYER, GAME_MODE_ASSET_LABEL_LAYER, GAME_MODE_PLAYER_LAYER] as const

function removeGameModeLayers(map: any): void {
  for (const id of [...Object.values(GAME_MODE_GEO_OVERLAY_LAYER_IDS)].reverse()) {
    if (map?.getLayer?.(id)) map.removeLayer?.(id)
  }
}

function removeGameModeSource(map: any): void {
  if (map?.getSource?.(GAME_MODE_GEO_OVERLAY_SOURCE_ID)) {
    map.removeSource?.(GAME_MODE_GEO_OVERLAY_SOURCE_ID)
  }
}

export function clearGameModeGeoOverlayFromMap(map: any): boolean {
  if (!map || !isMapLibreStyleReady(map)) return false
  try {
    removeGameModeLayers(map)
    removeGameModeSource(map)
    return !map.getSource?.(GAME_MODE_GEO_OVERLAY_SOURCE_ID)
      && Object.values(GAME_MODE_GEO_OVERLAY_LAYER_IDS).every(id => !map.getLayer?.(id))
  } catch (error) {
    console.error('[kg-game-mode] MapLibre actor cleanup failed.', error)
    return false
  }
}

export function applyGameModeGeoOverlayToMap(
  map: any,
  snapshot: GameModeGeoOverlaySnapshot,
  origin: GameModeGeoOverlayOrigin,
): boolean {
  if (!map || !isMapLibreStyleReady(map)) return false
  try {
    const data = alignGameModeGeoOverlayToWalkableMap(
      map,
      gameModeGeoOverlayFeatureCollection(snapshot, origin),
    )
    let source = map.getSource?.(GAME_MODE_GEO_OVERLAY_SOURCE_ID)
    if (!source) {
      map.addSource?.(GAME_MODE_GEO_OVERLAY_SOURCE_ID, { type: 'geojson', data })
      source = map.getSource?.(GAME_MODE_GEO_OVERLAY_SOURCE_ID)
    } else if (typeof source.setData === 'function') {
      source.setData(data)
    } else {
      removeGameModeLayers(map)
      removeGameModeSource(map)
      map.addSource?.(GAME_MODE_GEO_OVERLAY_SOURCE_ID, { type: 'geojson', data })
      source = map.getSource?.(GAME_MODE_GEO_OVERLAY_SOURCE_ID)
    }
    if (!source) return false
    for (const layer of GAME_MODE_LAYER_DEFINITIONS) {
      if (!map.getLayer?.(layer.id)) map.addLayer?.(layer)
      if (!map.getLayer?.(layer.id)) return false
    }
    return true
  } catch (error) {
    console.error('[kg-game-mode] MapLibre actor overlay failed.', error)
    return false
  }
}
