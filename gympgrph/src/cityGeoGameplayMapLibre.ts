import type { Feature, FeatureCollection, Geometry, LineString, Point } from 'geojson'
import {
  deriveRegionalPoiLocators,
  type RegionalPoiProfile,
} from 'grph-shared/geospatial/regionalPoiGeo'
import type { CityGeoGameplayState } from './cityGeoOverlay.js'
import {
  isMapLibreStyleReady,
  readGeoJsonSourceData,
} from './maplibreLayers.js'

export const CITY_GEO_GAMEPLAY_SOURCE_ID = 'kg-city-gameplay:activity'
export const CITY_GEO_GAMEPLAY_LAYER_IDS = Object.freeze({
  goal: `${CITY_GEO_GAMEPLAY_SOURCE_ID}:goal`,
  route: `${CITY_GEO_GAMEPLAY_SOURCE_ID}:route`,
  routeHalo: `${CITY_GEO_GAMEPLAY_SOURCE_ID}:route-halo`,
  player: `${CITY_GEO_GAMEPLAY_SOURCE_ID}:player`,
})
export const CITY_GEO_GAMEPLAY_LAYER_ORDER = Object.freeze([
  CITY_GEO_GAMEPLAY_LAYER_IDS.routeHalo,
  CITY_GEO_GAMEPLAY_LAYER_IDS.route,
  CITY_GEO_GAMEPLAY_LAYER_IDS.player,
  CITY_GEO_GAMEPLAY_LAYER_IDS.goal,
])
export const CITY_GEO_GAMEPLAY_PLAYER_IMAGE_ID = `${CITY_GEO_GAMEPLAY_SOURCE_ID}:person`

type GameplayProperties = Readonly<{
  kgCityGameplayFeatureKind: 'player' | 'goal' | 'route'
  kgCityGameplayPlayerSelected?: boolean
  kgCityGameplayPoiId: string
}>
export type CityGeoGameplayFeatureCollection = FeatureCollection<Geometry, GameplayProperties>

export function cityGeoGameplayFeatureCollection(
  profile: RegionalPoiProfile,
  state: CityGeoGameplayState,
): CityGeoGameplayFeatureCollection {
  const locators = new Map(deriveRegionalPoiLocators(profile)
    .map(locator => [locator.poiId, locator]))
  const player = locators.get(state.playerPoiId)
  const goal = locators.get(state.taskPoiId)
  if (!player || !goal || player.poiId === goal.poiId) {
    throw new Error('City Geo gameplay requires distinct player and goal POI locators.')
  }
  const feature = (
    kind: 'player' | 'goal',
    poiId: string,
    coordinate: readonly [number, number],
  ): Feature<Point, GameplayProperties> => ({
    type: 'Feature',
    id: `${profile.id}:${kind}:${poiId}`,
    geometry: { type: 'Point', coordinates: [...coordinate] },
    properties: {
      kgCityGameplayFeatureKind: kind,
      ...(kind === 'player'
        ? { kgCityGameplayPlayerSelected: state.playerSelected === true }
        : {}),
      kgCityGameplayPoiId: poiId,
    },
  })
  const route: Feature<LineString, GameplayProperties> = {
    type: 'Feature',
    id: `${profile.id}:route:${player.poiId}:${goal.poiId}`,
    geometry: {
      type: 'LineString',
      coordinates: [
        [...(state.playerCoordinate || player.coordinate)],
        [...goal.coordinate],
      ],
    },
    properties: {
      kgCityGameplayFeatureKind: 'route',
      kgCityGameplayPoiId: goal.poiId,
    },
  }
  return {
    type: 'FeatureCollection',
    features: [
      route,
      feature('player', player.poiId, state.playerCoordinate || player.coordinate),
      feature('goal', goal.poiId, goal.coordinate),
    ],
  }
}

const GAMEPLAY_FILTER = (kind: 'player' | 'goal') => Object.freeze([
  '==', ['get', 'kgCityGameplayFeatureKind'], kind,
])
const ROUTE_FILTER = Object.freeze([
  '==', ['get', 'kgCityGameplayFeatureKind'], 'route',
])
const LAYER_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: CITY_GEO_GAMEPLAY_LAYER_IDS.routeHalo,
    type: 'line',
    source: CITY_GEO_GAMEPLAY_SOURCE_ID,
    filter: ROUTE_FILTER,
    layout: Object.freeze({
      'line-cap': 'round',
      'line-join': 'round',
    }),
    paint: Object.freeze({
      'line-color': '#fff7ed',
      'line-opacity': 0.96,
      'line-width': 9,
    }),
  }),
  Object.freeze({
    id: CITY_GEO_GAMEPLAY_LAYER_IDS.route,
    type: 'line',
    source: CITY_GEO_GAMEPLAY_SOURCE_ID,
    filter: ROUTE_FILTER,
    layout: Object.freeze({
      'line-cap': 'round',
      'line-join': 'round',
    }),
    paint: Object.freeze({
      'line-color': '#ea580c',
      'line-dasharray': [1.5, 1.25],
      'line-opacity': 1,
      'line-width': 5,
    }),
  }),
  Object.freeze({
    id: CITY_GEO_GAMEPLAY_LAYER_IDS.player,
    type: 'symbol',
    source: CITY_GEO_GAMEPLAY_SOURCE_ID,
    filter: GAMEPLAY_FILTER('player'),
    layout: Object.freeze({
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'icon-image': CITY_GEO_GAMEPLAY_PLAYER_IMAGE_ID,
      'icon-ignore-placement': true,
      'icon-size': [
        'case',
        ['boolean', ['get', 'kgCityGameplayPlayerSelected'], false],
        0.98,
        0.72,
      ],
    }),
  }),
  Object.freeze({
    id: CITY_GEO_GAMEPLAY_LAYER_IDS.goal,
    type: 'circle',
    source: CITY_GEO_GAMEPLAY_SOURCE_ID,
    filter: GAMEPLAY_FILTER('goal'),
    paint: Object.freeze({
      'circle-color': '#ea580c',
      'circle-pitch-alignment': 'viewport',
      'circle-radius': 10,
      'circle-stroke-color': '#fff7ed',
      'circle-stroke-width': 3,
    }),
  }),
] as const)

type GameplayImage = Readonly<{ data: Uint8Array; height: number; width: number }>
const GAMEPLAY_IMAGE_SIZE = 40
const installedImages = new WeakSet<object>()

function createPlayerImage(): GameplayImage {
  const data = new Uint8Array(GAMEPLAY_IMAGE_SIZE * GAMEPLAY_IMAGE_SIZE * 4)
  const colorAt = (x: number, y: number, color: readonly [number, number, number, number]) => {
    if (x < 0 || x >= GAMEPLAY_IMAGE_SIZE || y < 0 || y >= GAMEPLAY_IMAGE_SIZE) return
    const offset = (y * GAMEPLAY_IMAGE_SIZE + x) * 4
    data[offset] = color[0]
    data[offset + 1] = color[1]
    data[offset + 2] = color[2]
    data[offset + 3] = color[3]
  }
  const circle = (
    cx: number,
    cy: number,
    radius: number,
    color: readonly [number, number, number, number],
  ) => {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) colorAt(x, y, color)
      }
    }
  }
  const polygon = (
    points: readonly (readonly [number, number])[],
    color: readonly [number, number, number, number],
  ) => {
    const minX = Math.floor(Math.min(...points.map(point => point[0])))
    const maxX = Math.ceil(Math.max(...points.map(point => point[0])))
    const minY = Math.floor(Math.min(...points.map(point => point[1])))
    const maxY = Math.ceil(Math.max(...points.map(point => point[1])))
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        let inside = false
        for (let index = 0, prior = points.length - 1; index < points.length; prior = index, index += 1) {
          const [x1, y1] = points[index]
          const [x2, y2] = points[prior]
          if ((y1 > y) !== (y2 > y)
            && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside
        }
        if (inside) colorAt(x, y, color)
      }
    }
  }
  const ink = [15, 23, 42, 255] as const
  circle(20, 35, 12, [15, 23, 42, 80])
  polygon([[11, 26], [19, 26], [18, 35], [15, 39], [9, 37]], ink)
  polygon([[21, 26], [29, 26], [31, 36], [27, 39], [21, 36]], ink)
  polygon([[13, 28], [18, 28], [17, 35], [14, 37], [11, 36]], [30, 64, 175, 255])
  polygon([[22, 28], [27, 28], [29, 36], [26, 37], [22, 35]], [30, 64, 175, 255])
  polygon([[10, 16], [29, 15], [34, 23], [30, 31], [11, 31], [6, 23]], ink)
  polygon([[12, 18], [28, 17], [31, 23], [28, 28], [12, 28], [9, 23]], [15, 118, 110, 255])
  polygon([[11, 18], [15, 15], [17, 20], [14, 25], [11, 24]], ink)
  polygon([[28, 17], [31, 19], [29, 25], [26, 23]], ink)
  circle(20, 11, 10, ink)
  circle(20, 12, 8, [251, 191, 36, 255])
  polygon([[12, 11], [13, 5], [18, 2], [25, 2], [29, 7], [28, 11], [23, 8], [17, 9]], [15, 23, 42, 255])
  colorAt(17, 12, ink)
  colorAt(23, 12, ink)
  polygon([[17, 16], [23, 16], [20, 18]], [124, 45, 18, 255])
  return Object.freeze({ data, height: GAMEPLAY_IMAGE_SIZE, width: GAMEPLAY_IMAGE_SIZE })
}

const PLAYER_IMAGE = createPlayerImage()

function ensurePlayerImage(map: any): boolean {
  try {
    const exists = typeof map?.hasImage === 'function'
      ? map.hasImage(CITY_GEO_GAMEPLAY_PLAYER_IMAGE_ID)
      : Boolean(map?.getImage?.(CITY_GEO_GAMEPLAY_PLAYER_IMAGE_ID))
    if (exists) return true
    if (typeof map?.addImage !== 'function') return false
    map.addImage(CITY_GEO_GAMEPLAY_PLAYER_IMAGE_ID, PLAYER_IMAGE)
    const added = typeof map?.hasImage === 'function'
      ? map.hasImage(CITY_GEO_GAMEPLAY_PLAYER_IMAGE_ID)
      : Boolean(map?.getImage?.(CITY_GEO_GAMEPLAY_PLAYER_IMAGE_ID))
    if (added) installedImages.add(map)
    return added
  } catch (error) {
    console.error('[kg-city] MapLibre player marker image registration failed.', error)
    return false
  }
}

function plainRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactValue(expected: unknown, actual: unknown): boolean {
  if (Object.is(expected, actual)) return true
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && expected.length === actual.length
      && expected.every((value, index) => exactValue(value, actual[index]))
  }
  if (!plainRecord(expected) || !plainRecord(actual)) return false
  const keys = Object.keys(expected)
  return keys.length === Object.keys(actual).length
    && keys.every(key => Object.hasOwn(actual, key)
      && exactValue(expected[key], actual[key]))
}

function exactFeatureCollection(
  expected: CityGeoGameplayFeatureCollection,
  actual: unknown,
): boolean {
  return exactValue(expected, actual)
}

function removeOwnedLayers(map: any): boolean {
  if (typeof map?.removeLayer !== 'function') return false
  for (const id of [...CITY_GEO_GAMEPLAY_LAYER_ORDER].reverse()) {
    if (map.getLayer?.(id)) map.removeLayer(id)
    if (map.getLayer?.(id)) return false
  }
  return true
}

function removeOwnedSource(map: any): boolean {
  if (!map?.getSource?.(CITY_GEO_GAMEPLAY_SOURCE_ID)) return true
  if (typeof map.removeSource !== 'function') return false
  map.removeSource(CITY_GEO_GAMEPLAY_SOURCE_ID)
  return !map.getSource?.(CITY_GEO_GAMEPLAY_SOURCE_ID)
}

function readStyleLayer(map: any, id: string): unknown {
  const layers = map?.getStyle?.()?.layers
  return Array.isArray(layers)
    ? layers.find(layer => plainRecord(layer) && layer.id === id)
    : map?.getLayer?.(id)
}

function withoutVisibility(value: unknown): unknown {
  if (!plainRecord(value)) return value
  const entries = Object.entries(value)
    .filter(([property]) => property !== 'visibility')
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function exactLayerDefinition(
  expected: Readonly<{
    filter?: unknown
    id: string
    layout?: unknown
    paint?: unknown
    source: string
    type: string
  }>,
  actual: unknown,
): boolean {
  if (!plainRecord(actual)) return false
  return actual.id === expected.id
    && actual.type === expected.type
    && actual.source === expected.source
    && exactValue(expected.filter, actual.filter)
    && exactValue(withoutVisibility(expected.layout), withoutVisibility(actual.layout))
    && exactValue(expected.paint, actual.paint)
}

function ensureSource(map: any, data: CityGeoGameplayFeatureCollection): boolean {
  let source = map.getSource?.(CITY_GEO_GAMEPLAY_SOURCE_ID)
  if (!source) {
    if (typeof map.addSource !== 'function') return false
    map.addSource(CITY_GEO_GAMEPLAY_SOURCE_ID, { type: 'geojson', data })
    source = map.getSource?.(CITY_GEO_GAMEPLAY_SOURCE_ID)
  } else if (!exactFeatureCollection(data, readGeoJsonSourceData(source))) {
    if (typeof source.setData !== 'function') {
      if (!removeOwnedLayers(map) || !removeOwnedSource(map)) return false
      if (typeof map.addSource !== 'function') return false
      map.addSource(CITY_GEO_GAMEPLAY_SOURCE_ID, { type: 'geojson', data })
      source = map.getSource?.(CITY_GEO_GAMEPLAY_SOURCE_ID)
    } else {
      source.setData(data)
    }
  }
  const current = map.getSource?.(CITY_GEO_GAMEPLAY_SOURCE_ID)
  const currentData = readGeoJsonSourceData(current)
  return Boolean(current) && exactFeatureCollection(data, currentData)
}

function ensureLayers(map: any, beforeLayerId: string | null): boolean {
  // City mode may not have the optional Flight route layer that the
  // controller prefers as its insertion anchor.
  const resolvedBeforeLayerId = beforeLayerId && map.getLayer?.(beforeLayerId)
    ? beforeLayerId
    : null
  for (const layer of LAYER_DEFINITIONS) {
    const live = readStyleLayer(map, layer.id)
    if (live && !exactLayerDefinition(layer, live)) {
      if (typeof map.removeLayer !== 'function') return false
      map.removeLayer(layer.id)
      if (map.getLayer?.(layer.id)) return false
    }
    if (!map.getLayer?.(layer.id)) {
      if (typeof map.addLayer !== 'function') return false
      map.addLayer(layer, resolvedBeforeLayerId || undefined)
    }
    if (!exactLayerDefinition(layer, readStyleLayer(map, layer.id))) return false
  }
  const layers = map?.getStyle?.()?.layers
  if (!Array.isArray(layers)) return false
  const ids = layers.map((layer: any) => String(layer?.id || ''))
  const indexes = CITY_GEO_GAMEPLAY_LAYER_ORDER.map(id => ids.indexOf(id))
  const anchor = beforeLayerId && map.getLayer?.(beforeLayerId)
    ? ids.indexOf(beforeLayerId)
    : ids.length
  const exactOrder = (): boolean => indexes.every((index, slot) => index >= 0
    && (slot === 0 || index === indexes[slot - 1] + 1))
    && indexes[indexes.length - 1] + 1 === anchor
  if (exactOrder()) return true
  if (typeof map.moveLayer !== 'function') return false
  for (const id of CITY_GEO_GAMEPLAY_LAYER_ORDER) {
    if (map.getLayer?.(id)) {
      map.moveLayer(id, resolvedBeforeLayerId || undefined)
    }
  }
  const reorderedLayers = map?.getStyle?.()?.layers
  if (!Array.isArray(reorderedLayers)) return false
  const reorderedIds = reorderedLayers.map((layer: any) => String(layer?.id || ''))
  const reorderedIndexes = CITY_GEO_GAMEPLAY_LAYER_ORDER.map(id => reorderedIds.indexOf(id))
  const reorderedAnchor = beforeLayerId && map.getLayer?.(beforeLayerId)
    ? reorderedIds.indexOf(beforeLayerId)
    : reorderedIds.length
  return reorderedIndexes.every((index, slot) => index >= 0
    && (slot === 0 || index === reorderedIndexes[slot - 1] + 1))
    && reorderedIndexes[reorderedIndexes.length - 1] + 1 === reorderedAnchor
}

export function mapHasExactCityGeoGameplay(
  map: any,
  profile: RegionalPoiProfile,
  state: CityGeoGameplayState,
  beforeLayerId: string | null = null,
): boolean {
  try {
    const data = cityGeoGameplayFeatureCollection(profile, state)
    const source = map?.getSource?.(CITY_GEO_GAMEPLAY_SOURCE_ID)
    return Boolean(source)
      && (typeof map?.hasImage === 'function'
        ? map.hasImage(CITY_GEO_GAMEPLAY_PLAYER_IMAGE_ID)
        : Boolean(map?.getImage?.(CITY_GEO_GAMEPLAY_PLAYER_IMAGE_ID)))
      && exactFeatureCollection(data, readGeoJsonSourceData(source))
      && LAYER_DEFINITIONS.every(layer => exactLayerDefinition(layer, readStyleLayer(map, layer.id)))
      && ensureLayerOrderOnly(map, beforeLayerId)
  } catch {
    return false
  }
}

function ensureLayerOrderOnly(map: any, beforeLayerId: string | null): boolean {
  const layers = map?.getStyle?.()?.layers
  if (!Array.isArray(layers)) return false
  const ids = layers.map((layer: any) => String(layer?.id || ''))
  const indexes = CITY_GEO_GAMEPLAY_LAYER_ORDER.map(id => ids.indexOf(id))
  const anchor = beforeLayerId && map.getLayer?.(beforeLayerId)
    ? ids.indexOf(beforeLayerId)
    : ids.length
  return indexes.every((index, slot) => index >= 0
    && (slot === 0 || index === indexes[slot - 1] + 1))
    && indexes[indexes.length - 1] + 1 === anchor
}

export function applyCityGeoGameplayToMap(
  map: any,
  profile: RegionalPoiProfile,
  state: CityGeoGameplayState,
  beforeLayerId: string | null = null,
): boolean {
  if (!map || !isMapLibreStyleReady(map)) return false
  try {
    const data = cityGeoGameplayFeatureCollection(profile, state)
    return ensurePlayerImage(map)
      && ensureSource(map, data)
      && ensureLayers(map, beforeLayerId)
      && mapHasExactCityGeoGameplay(map, profile, state, beforeLayerId)
  } catch (error) {
    console.error('[kg-city] MapLibre gameplay overlay failed.', error)
    return false
  }
}

export function clearCityGeoGameplayFromMap(map: any): boolean {
  if (!map || !isMapLibreStyleReady(map)) return false
  try {
    const layersCleared = removeOwnedLayers(map)
    const sourceCleared = layersCleared && removeOwnedSource(map)
    if (installedImages.has(map)
      && (typeof map.hasImage !== 'function' || map.hasImage(CITY_GEO_GAMEPLAY_PLAYER_IMAGE_ID))) {
      map.removeImage?.(CITY_GEO_GAMEPLAY_PLAYER_IMAGE_ID)
      installedImages.delete(map)
    }
    return layersCleared && sourceCleared
  } catch (error) {
    console.error('[kg-city] MapLibre gameplay overlay cleanup failed.', error)
    return false
  }
}
