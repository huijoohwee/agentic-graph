type Coordinate = readonly [longitude: number, latitude: number]
type ProjectedCoordinate = readonly [x: number, y: number]
type PolygonRings = readonly (readonly Coordinate[])[]

type RingMass = Readonly<{
  area: number
  centroid: ProjectedCoordinate
}>

type RepresentativePolygon = Readonly<{
  area: number
  centroid: ProjectedCoordinate
  centroidCoordinate: Coordinate
  key: string
  longitudeScale: number
  longitudeSpan: RegionalPoiLongitudeSpan
  originLatitude: number
  rings: readonly (readonly ProjectedCoordinate[])[]
}>

export type RegionalPoiLongitudeSpan = Readonly<{
  center: number
  east: number
  spanDegrees: number
  west: number
}>

export function normalizeRegionalPoiLongitude(longitude: number): number {
  if (!Number.isFinite(longitude)) {
    throw new RangeError('longitude must be finite')
  }
  if (longitude >= -180 && longitude < 180) {
    return Object.is(longitude, -0) ? 0 : longitude
  }
  const normalized = ((longitude + 180) % 360 + 360) % 360 - 180
  return Object.is(normalized, -0) ? 0 : normalized
}

/** Returns the shortest ordered longitude interval containing every input. */
export function deriveRegionalPoiLongitudeSpan(
  longitudes: readonly number[],
): RegionalPoiLongitudeSpan {
  if (longitudes.length === 0) {
    throw new TypeError('longitude span requires at least one longitude')
  }
  const entries = [...new Set(longitudes.map(longitude => (
    normalizeRegionalPoiLongitude(longitude)
  )))].map(canonical => ({
    canonical,
    wrapped: canonical < 0 ? canonical + 360 : canonical,
  })).sort((left, right) => left.wrapped - right.wrapped)
  if (entries.length === 1) {
    const west = entries[0].canonical
    return Object.freeze({ center: west, east: west, spanDegrees: 0, west })
  }

  let largestGap = Number.NEGATIVE_INFINITY
  let west = entries[0].canonical
  let east = entries.at(-1)!.canonical
  for (let index = 0; index < entries.length; index += 1) {
    const current = entries[index]
    const next = index === entries.length - 1
      ? { ...entries[0], wrapped: entries[0].wrapped + 360 }
      : entries[index + 1]
    if (next.wrapped - current.wrapped > largestGap) {
      largestGap = next.wrapped - current.wrapped
      west = next.canonical
      east = current.canonical
    }
  }
  if (east < west) east += 360
  const spanDegrees = east - west
  return Object.freeze({
    center: normalizeRegionalPoiLongitude(west + spanDegrees / 2),
    east,
    spanDegrees,
    west,
  })
}

export function unwrapRegionalPoiLongitude(
  longitude: number,
  span: Pick<RegionalPoiLongitudeSpan, 'west'>,
): number {
  const normalized = normalizeRegionalPoiLongitude(longitude)
  return span.west + ((normalized - span.west) % 360 + 360) % 360
}

function projectedRing(
  ring: readonly Coordinate[],
  span: RegionalPoiLongitudeSpan,
  origin: Coordinate,
): readonly ProjectedCoordinate[] {
  const originLongitude = unwrapRegionalPoiLongitude(origin[0], span)
  return ring.slice(0, -1).map(([longitude, latitude]) => Object.freeze([
    unwrapRegionalPoiLongitude(longitude, span) - originLongitude,
    latitude - origin[1],
  ] as const))
}

function cross(
  start: ProjectedCoordinate,
  end: ProjectedCoordinate,
  point: ProjectedCoordinate,
): number {
  return (end[0] - start[0]) * (point[1] - start[1])
    - (end[1] - start[1]) * (point[0] - start[0])
}

function geometryTolerance(points: readonly ProjectedCoordinate[]): number {
  const width = Math.max(...points.map(([x]) => x))
    - Math.min(...points.map(([x]) => x))
  const height = Math.max(...points.map(([, y]) => y))
    - Math.min(...points.map(([, y]) => y))
  return Math.max(width, height, Number.EPSILON) ** 2
    * Number.EPSILON * 128
}

function pointOnSegment(
  point: ProjectedCoordinate,
  start: ProjectedCoordinate,
  end: ProjectedCoordinate,
  tolerance: number,
): boolean {
  return Math.abs(cross(start, end, point)) <= tolerance
    && point[0] >= Math.min(start[0], end[0]) - tolerance
    && point[0] <= Math.max(start[0], end[0]) + tolerance
    && point[1] >= Math.min(start[1], end[1]) - tolerance
    && point[1] <= Math.max(start[1], end[1]) + tolerance
}

function segmentsIntersect(
  leftStart: ProjectedCoordinate,
  leftEnd: ProjectedCoordinate,
  rightStart: ProjectedCoordinate,
  rightEnd: ProjectedCoordinate,
  tolerance: number,
): boolean {
  const values = [
    cross(leftStart, leftEnd, rightStart),
    cross(leftStart, leftEnd, rightEnd),
    cross(rightStart, rightEnd, leftStart),
    cross(rightStart, rightEnd, leftEnd),
  ]
  const signs = values.map(value => (
    Math.abs(value) <= tolerance ? 0 : Math.sign(value)
  ))
  if (signs[0] * signs[1] < 0 && signs[2] * signs[3] < 0) return true
  return (signs[0] === 0 && pointOnSegment(rightStart, leftStart, leftEnd, tolerance))
    || (signs[1] === 0 && pointOnSegment(rightEnd, leftStart, leftEnd, tolerance))
    || (signs[2] === 0 && pointOnSegment(leftStart, rightStart, rightEnd, tolerance))
    || (signs[3] === 0 && pointOnSegment(leftEnd, rightStart, rightEnd, tolerance))
}

function assertSimpleRing(
  points: readonly ProjectedCoordinate[],
  label: string,
): void {
  const tolerance = geometryTolerance(points)
  for (let left = 0; left < points.length; left += 1) {
    const leftNext = (left + 1) % points.length
    if (
      points[left][0] === points[leftNext][0]
      && points[left][1] === points[leftNext][1]
    ) throw new TypeError(`${label} must not contain a zero-length edge`)
    for (let right = left + 1; right < points.length; right += 1) {
      const rightNext = (right + 1) % points.length
      if (left === rightNext || right === leftNext) continue
      if (segmentsIntersect(
        points[left],
        points[leftNext],
        points[right],
        points[rightNext],
        tolerance,
      )) throw new TypeError(`${label} must not self-intersect`)
    }
  }
  const twiceArea = points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]
    return area + point[0] * next[1] - next[0] * point[1]
  }, 0)
  if (Math.abs(twiceArea) <= tolerance) {
    throw new TypeError(`${label} must enclose non-zero area`)
  }
}

function ringsIntersect(
  left: readonly ProjectedCoordinate[],
  right: readonly ProjectedCoordinate[],
): boolean {
  const tolerance = geometryTolerance([...left, ...right])
  return left.some((start, leftIndex) => right.some((otherStart, rightIndex) => (
    segmentsIntersect(
      start,
      left[(leftIndex + 1) % left.length],
      otherStart,
      right[(rightIndex + 1) % right.length],
      tolerance,
    )
  )))
}

function pointInRing(
  point: ProjectedCoordinate,
  ring: readonly ProjectedCoordinate[],
): boolean {
  let inside = false
  for (let index = 0, prior = ring.length - 1; index < ring.length; prior = index++) {
    const [x, y] = ring[index]
    const [priorX, priorY] = ring[prior]
    if (
      (y > point[1]) !== (priorY > point[1])
      && point[0] < (priorX - x) * (point[1] - y) / (priorY - y) + x
    ) inside = !inside
  }
  return inside
}

function ringMass(points: readonly ProjectedCoordinate[]): RingMass {
  let twiceArea = 0
  let weightedX = 0
  let weightedY = 0
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const next = points[(index + 1) % points.length]
    const contribution = point[0] * next[1] - next[0] * point[1]
    twiceArea += contribution
    weightedX += (point[0] + next[0]) * contribution
    weightedY += (point[1] + next[1]) * contribution
  }
  const area = Math.abs(twiceArea) / 2
  if (area <= geometryTolerance(points)) {
    throw new TypeError('representative-point ring must enclose non-zero area')
  }
  return Object.freeze({
    area,
    centroid: Object.freeze([
      weightedX / (3 * twiceArea),
      weightedY / (3 * twiceArea),
    ] as const),
  })
}

function coordinateFromRepresentativeProjection(
  polygon: Pick<
    RepresentativePolygon,
    'longitudeScale' | 'longitudeSpan' | 'originLatitude'
  >,
  point: ProjectedCoordinate,
): Coordinate {
  return Object.freeze([
    normalizeRegionalPoiLongitude(
      polygon.longitudeSpan.west + point[0] / polygon.longitudeScale,
    ),
    polygon.originLatitude + point[1],
  ] as const)
}

function coordinateToRepresentativeProjection(
  polygon: Pick<
    RepresentativePolygon,
    'longitudeScale' | 'longitudeSpan' | 'originLatitude'
  >,
  coordinate: Coordinate,
): ProjectedCoordinate {
  return Object.freeze([
    (
      unwrapRegionalPoiLongitude(coordinate[0], polygon.longitudeSpan)
      - polygon.longitudeSpan.west
    ) * polygon.longitudeScale,
    coordinate[1] - polygon.originLatitude,
  ] as const)
}

function prepareRepresentativePolygon(rings: PolygonRings): RepresentativePolygon {
  const coordinates = rings.flat()
  const longitudeSpan = deriveRegionalPoiLongitudeSpan(
    coordinates.map(([longitude]) => longitude),
  )
  const latitudes = coordinates.map(([, latitude]) => latitude)
  const originLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2
  const longitudeScale = Math.max(
    Number.EPSILON,
    Math.abs(Math.cos(originLatitude * Math.PI / 180)),
  )
  const origin = Object.freeze([
    longitudeSpan.west,
    originLatitude,
  ] as const)
  const projectedRings = rings.map(ring => (
    projectedRing(ring, longitudeSpan, origin).map(([x, y]) => (
      Object.freeze([x * longitudeScale, y] as const)
    ))
  ))
  const outer = ringMass(projectedRings[0])
  const holes = projectedRings.slice(1).map(ringMass)
  const area = outer.area - holes.reduce((sum, hole) => sum + hole.area, 0)
  const tolerance = geometryTolerance(projectedRings.flat())
  if (area <= tolerance) {
    throw new TypeError('representative-point polygon must retain non-zero area')
  }
  const weightedX = outer.centroid[0] * outer.area
    - holes.reduce((sum, hole) => sum + hole.centroid[0] * hole.area, 0)
  const weightedY = outer.centroid[1] * outer.area
    - holes.reduce((sum, hole) => sum + hole.centroid[1] * hole.area, 0)
  const centroid = Object.freeze([
    weightedX / area,
    weightedY / area,
  ] as const)
  const projection = Object.freeze({
    longitudeScale,
    longitudeSpan,
    originLatitude,
  })
  return Object.freeze({
    ...projection,
    area,
    centroid,
    centroidCoordinate: coordinateFromRepresentativeProjection(
      projection,
      centroid,
    ),
    key: JSON.stringify(rings),
    rings: projectedRings,
  })
}

function compareRepresentativePolygonKeys(
  left: RepresentativePolygon,
  right: RepresentativePolygon,
): number {
  if (left.key < right.key) return -1
  if (left.key > right.key) return 1
  return 0
}

function dominantRepresentativePolygon(
  polygons: readonly RepresentativePolygon[],
): RepresentativePolygon {
  return [...polygons].sort((left, right) => (
    right.area - left.area || compareRepresentativePolygonKeys(left, right)
  ))[0]
}

function areaWeightedRepresentativeTarget(
  polygons: readonly RepresentativePolygon[],
): Coordinate {
  const totalArea = polygons.reduce((sum, polygon) => sum + polygon.area, 0)
  const weightedLongitude = polygons.reduce<{
    cosine: number
    sine: number
  }>((sum, polygon) => {
    const radians = polygon.centroidCoordinate[0] * Math.PI / 180
    return {
      cosine: sum.cosine + Math.cos(radians) * polygon.area,
      sine: sum.sine + Math.sin(radians) * polygon.area,
    }
  }, { cosine: 0, sine: 0 })
  const circularStrength = Math.hypot(
    weightedLongitude.cosine,
    weightedLongitude.sine,
  )
  const longitude = circularStrength > totalArea * Number.EPSILON * 128
    ? normalizeRegionalPoiLongitude(
        Math.atan2(weightedLongitude.sine, weightedLongitude.cosine)
          * 180 / Math.PI,
      )
    : dominantRepresentativePolygon(polygons).centroidCoordinate[0]
  return Object.freeze([
    longitude,
    polygons.reduce((sum, polygon) => (
      sum + polygon.centroidCoordinate[1] * polygon.area
    ), 0) / totalArea,
  ] as const)
}

function pointInPolygon(
  point: ProjectedCoordinate,
  polygon: RepresentativePolygon,
): boolean {
  return pointInRing(point, polygon.rings[0])
    && !polygon.rings.slice(1).some(hole => pointInRing(point, hole))
}

function scanlineInteriorPoints(
  polygon: RepresentativePolygon,
  y: number,
): readonly ProjectedCoordinate[] {
  const intersections: number[] = []
  for (const ring of polygon.rings) {
    for (let index = 0; index < ring.length; index += 1) {
      const start = ring[index]
      const end = ring[(index + 1) % ring.length]
      if ((start[1] > y) === (end[1] > y)) continue
      intersections.push(
        start[0] + (y - start[1]) * (end[0] - start[0])
          / (end[1] - start[1]),
      )
    }
  }
  intersections.sort((left, right) => left - right)
  const minimumWidth = Math.sqrt(geometryTolerance(polygon.rings.flat()))
  const points: ProjectedCoordinate[] = []
  for (let index = 0; index + 1 < intersections.length; index += 2) {
    const left = intersections[index]
    const right = intersections[index + 1]
    if (right - left <= minimumWidth) continue
    const point = Object.freeze([(left + right) / 2, y] as const)
    if (pointInPolygon(point, polygon)) points.push(point)
  }
  return points
}

function candidateScanlines(
  polygon: RepresentativePolygon,
  target: ProjectedCoordinate,
): readonly number[] {
  const yValues = [...new Set(
    polygon.rings.flatMap(ring => ring.map(([, y]) => y)),
  )].sort((left, right) => left - right)
  const south = yValues[0]
  const north = yValues.at(-1)!
  const bandCenters = yValues.slice(0, -1).map((value, index) => (
    (value + yValues[index + 1]) / 2
  ))
  return [...new Set([
    Math.min(north, Math.max(south, target[1])),
    polygon.centroid[1],
    (south + north) / 2,
    ...bandCenters,
  ])]
}

function pointOnRepresentativePolygon(
  polygon: RepresentativePolygon,
  target: ProjectedCoordinate,
): ProjectedCoordinate {
  if (pointInPolygon(polygon.centroid, polygon)) return polygon.centroid
  const candidates = candidateScanlines(polygon, target).flatMap(y => (
    scanlineInteriorPoints(polygon, y)
  ))
  if (candidates.length === 0) {
    throw new TypeError('representative-point polygon has no interior point')
  }
  return candidates.sort((left, right) => {
    const leftDistance = (left[0] - target[0]) ** 2
      + (left[1] - target[1]) ** 2
    const rightDistance = (right[0] - target[0]) ** 2
      + (right[1] - target[1]) ** 2
    return leftDistance - rightDistance
      || left[0] - right[0]
      || left[1] - right[1]
  })[0]
}

function assertRepresentativePolygonInput(
  rings: PolygonRings,
  label: string,
): void {
  if (!Array.isArray(rings) || rings.length === 0) {
    throw new TypeError(`${label} requires at least one ring`)
  }
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
    const ring = rings[ringIndex]
    const ringLabel = `${label}[${ringIndex}]`
    if (!Array.isArray(ring) || ring.length < 4) {
      throw new TypeError(`${ringLabel} requires at least four coordinates`)
    }
    for (
      let coordinateIndex = 0;
      coordinateIndex < ring.length;
      coordinateIndex += 1
    ) {
      const coordinate = ring[coordinateIndex]
      const coordinateLabel = `${ringLabel}[${coordinateIndex}]`
      if (!Array.isArray(coordinate) || coordinate.length !== 2) {
        throw new TypeError(`${coordinateLabel} must be [longitude, latitude]`)
      }
      const [longitude, latitude] = coordinate
      if (
        !Number.isFinite(longitude)
        || longitude < -180
        || longitude > 180
      ) {
        throw new RangeError(
          `${coordinateLabel} longitude must be within [-180, 180]`,
        )
      }
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        throw new RangeError(
          `${coordinateLabel} latitude must be within [-90, 90]`,
        )
      }
    }
    const first = ring[0]
    const last = ring.at(-1)!
    if (first[0] !== last[0] || first[1] !== last[1]) {
      throw new TypeError(`${ringLabel} must be closed`)
    }
  }
  assertValidRegionalPoiPolygon(rings, label)
}

export function assertValidRegionalPoiPolygon(
  rings: readonly (readonly Coordinate[])[],
  label: string,
): void {
  const span = deriveRegionalPoiLongitudeSpan(
    rings.flatMap(ring => ring.map(([longitude]) => longitude)),
  )
  const origin = rings[0][0]
  const projected = rings.map((ring, index) => {
    const points = projectedRing(ring, span, origin)
    assertSimpleRing(points, `${label}[${index}]`)
    return points
  })
  const outer = projected[0]
  for (let index = 1; index < projected.length; index += 1) {
    const hole = projected[index]
    if (ringsIntersect(outer, hole) || !pointInRing(hole[0], outer)) {
      throw new TypeError(`${label}[${index}] must be strictly inside its outer ring`)
    }
    for (let prior = 1; prior < index; prior += 1) {
      const otherHole = projected[prior]
      if (
        ringsIntersect(otherHole, hole)
        || pointInRing(hole[0], otherHole)
        || pointInRing(otherHole[0], hole)
      ) throw new TypeError(`${label} holes must not intersect or contain one another`)
    }
  }
}

/**
 * Finds one stable geographic focus for one or more polygon surfaces. Polygon
 * area determines the shared centroid; concavity, holes, or disjoint surfaces
 * fall back to an interior point on the largest surface instead of returning a
 * point in empty space. Each polygon keeps a continuity-preserving longitude
 * frame; its centroid contributes to one circular area-weighted global target,
 * while canonical polygon ordering makes source order irrelevant.
 */
export function deriveRegionalPoiRepresentativePoint(
  polygons: readonly PolygonRings[],
): Coordinate {
  if (!Array.isArray(polygons) || polygons.length === 0) {
    throw new TypeError('representative point requires at least one polygon')
  }
  for (let index = 0; index < polygons.length; index += 1) {
    assertRepresentativePolygonInput(
      polygons[index],
      `representative point polygon[${index}]`,
    )
  }
  const prepared = polygons.map(prepareRepresentativePolygon)
    .sort(compareRepresentativePolygonKeys)
  const target = areaWeightedRepresentativeTarget(prepared)
  const containingPolygon = prepared.find(polygon => pointInPolygon(
    coordinateToRepresentativeProjection(polygon, target),
    polygon,
  ))
  if (containingPolygon) return target

  const dominant = dominantRepresentativePolygon(prepared)
  return coordinateFromRepresentativeProjection(
    dominant,
    pointOnRepresentativePolygon(
      dominant,
      coordinateToRepresentativeProjection(dominant, target),
    ),
  )
}
