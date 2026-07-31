type Coordinate = readonly [longitude: number, latitude: number]
type ProjectedCoordinate = readonly [x: number, y: number]

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
