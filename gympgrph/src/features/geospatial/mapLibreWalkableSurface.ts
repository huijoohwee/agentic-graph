export type MapLibreScreenPoint = Readonly<{ x: number; y: number }>
export type MapLibreWalkablePoint = Readonly<{
  coordinate: readonly [longitude: number, latitude: number]
  distancePx: number
  point: MapLibreScreenPoint
}>

const WALKABLE_TRANSPORT_CLASSES = new Set([
  'bridleway',
  'cycleway',
  'footway',
  'living_street',
  'minor',
  'path',
  'pedestrian',
  'primary',
  'residential',
  'secondary',
  'service',
  'steps',
  'street',
  'street_limited',
  'tertiary',
  'track',
  'unclassified',
])

function readScreenPoint(value: unknown): MapLibreScreenPoint | null {
  if (!value || typeof value !== 'object') return null
  const point = value as { x?: unknown; y?: unknown }
  const x = Number(point.x)
  const y = Number(point.y)
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

function readCoordinate(value: unknown): readonly [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const longitude = Number(value[0])
  const latitude = Number(value[1])
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null
}

function readUnprojectedCoordinate(map: any, point: MapLibreScreenPoint): readonly [number, number] | null {
  if (typeof map?.unproject !== 'function') return null
  try {
    const value = map.unproject(point)
    if (Array.isArray(value)) return readCoordinate(value)
    if (!value || typeof value !== 'object') return null
    const result = value as { lng?: unknown; lat?: unknown }
    const longitude = Number(result.lng)
    const latitude = Number(result.lat)
    return Number.isFinite(longitude) && Number.isFinite(latitude)
      ? [longitude, latitude]
      : null
  } catch {
    return null
  }
}

function lineCoordinates(feature: any): readonly (readonly (readonly [number, number])[])[] {
  const geometry = feature?.geometry
  const coordinates = geometry?.coordinates
  if (geometry?.type === 'LineString' && Array.isArray(coordinates)) return [coordinates]
  if (geometry?.type === 'MultiLineString' && Array.isArray(coordinates)) return coordinates
  return []
}

export function isMapLibreWalkableLineFeature(feature: unknown): boolean {
  if (!feature || typeof feature !== 'object') return false
  const value = feature as any
  const lines = lineCoordinates(value)
  if (!lines.length) return false

  const layer = value.layer && typeof value.layer === 'object' ? value.layer : {}
  const sourceLayer = String(value.sourceLayer || layer['source-layer'] || layer.sourceLayer || '').toLowerCase()
  const layerId = String(layer.id || '').toLowerCase()
  if (sourceLayer !== 'transportation' && !/(^|[_-])(road|street|path|pedestrian|footway)([_-]|$)/.test(layerId)) {
    return false
  }

  const properties = value.properties && typeof value.properties === 'object' ? value.properties : {}
  const transportClass = String(properties.class || properties.highway || properties.subclass || '').toLowerCase()
  if (!WALKABLE_TRANSPORT_CLASSES.has(transportClass)) return false
  const blockedValues = new Set(['no', 'private', 'restricted'])
  if (blockedValues.has(String(properties.foot || '').toLowerCase())) return false
  if (blockedValues.has(String(properties.access || '').toLowerCase())) return false
  if (properties.ramp === true || Number(properties.ramp) === 1) return false
  return lines.some(line => Array.isArray(line) && line.length >= 2)
}

function closestPointOnSegment(
  target: MapLibreScreenPoint,
  start: MapLibreScreenPoint,
  end: MapLibreScreenPoint,
): Readonly<{ distancePx: number; point: MapLibreScreenPoint }> {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((target.x - start.x) * dx + (target.y - start.y) * dy) / lengthSquared))
    : 0
  const point = { x: start.x + t * dx, y: start.y + t * dy }
  return {
    distancePx: Math.hypot(target.x - point.x, target.y - point.y),
    point,
  }
}

export function findNearestMapLibreWalkablePoint(
  map: any,
  target: MapLibreScreenPoint,
  radiusPx: number,
): MapLibreWalkablePoint | null {
  if (
    !readScreenPoint(target)
    || !Number.isFinite(radiusPx)
    || radiusPx < 0
    || typeof map?.queryRenderedFeatures !== 'function'
    || typeof map?.project !== 'function'
  ) return null

  let features: readonly any[]
  try {
    features = map.queryRenderedFeatures([
      [target.x - radiusPx, target.y - radiusPx],
      [target.x + radiusPx, target.y + radiusPx],
    ]) || []
  } catch {
    return null
  }

  let nearest: MapLibreWalkablePoint | null = null
  for (const feature of features) {
    if (!isMapLibreWalkableLineFeature(feature)) continue
    for (const line of lineCoordinates(feature)) {
      let previous: MapLibreScreenPoint | null = null
      for (const rawCoordinate of line) {
        const coordinate = readCoordinate(rawCoordinate)
        if (!coordinate) {
          previous = null
          continue
        }
        let projected: MapLibreScreenPoint | null = null
        try {
          projected = readScreenPoint(map.project(coordinate))
        } catch {
          projected = null
        }
        if (!projected) {
          previous = null
          continue
        }
        if (previous) {
          const candidate = closestPointOnSegment(target, previous, projected)
          if (candidate.distancePx <= radiusPx && (!nearest || candidate.distancePx < nearest.distancePx)) {
            const snappedCoordinate = readUnprojectedCoordinate(map, candidate.point)
            if (snappedCoordinate) {
              nearest = {
                coordinate: snappedCoordinate,
                distancePx: candidate.distancePx,
                point: candidate.point,
              }
            }
          }
        }
        previous = projected
      }
    }
  }
  return nearest
}
