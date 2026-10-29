type PointFeature = {
  geometry?: {
    type?: unknown
    coordinates?: unknown
  }
}

export type ProjectedPoint = Readonly<{ x: number; y: number }>

export const GRAPH_POINT_PICK_RADIUS_PX = 24

/** Pick a source point by screen distance when renderer hit-testing misses an overlapping region. */
export function pickNearestPointFeature<T extends PointFeature>(
  features: readonly T[],
  screenPoint: ProjectedPoint,
  project: (lng: number, lat: number) => ProjectedPoint | null,
  maxDistancePx = GRAPH_POINT_PICK_RADIUS_PX,
): T | null {
  if (!Number.isFinite(screenPoint.x) || !Number.isFinite(screenPoint.y)) return null
  const maxDistanceSquared = Math.max(0, maxDistancePx) ** 2
  let nearest: T | null = null
  let nearestDistanceSquared = maxDistanceSquared

  for (const feature of features) {
    if (feature?.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) continue
    const [lngRaw, latRaw] = feature.geometry.coordinates
    const lng = Number(lngRaw)
    const lat = Number(latRaw)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    const projected = project(lng, lat)
    if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) continue
    const dx = projected.x - screenPoint.x
    const dy = projected.y - screenPoint.y
    const distanceSquared = dx * dx + dy * dy
    if (distanceSquared > nearestDistanceSquared) continue
    nearest = feature
    nearestDistanceSquared = distanceSquared
  }
  return nearest
}
