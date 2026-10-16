import type { GameFpsBlocker, GameFpsSpatialMap } from './gameFpsModel'

export type GameFpsPoint = Readonly<{ x: number; z: number }>
export type GameFpsRayAabbCandidate = Readonly<{
  entityRef: string
  center: readonly [number, number, number]
  halfExtents: readonly [number, number, number]
}>
export type GameFpsRayAabbHit = Readonly<{ entityRef: string; distance: number }>

const EPSILON = 1e-8
const GROUND_ACTOR_STEP_HEIGHT_METERS = 0.45
const GROUND_ACTOR_HEIGHT_METERS = 1.8

function obstructsGroundActor(blocker: GameFpsBlocker): boolean {
  const bottom = blocker.centerY - blocker.halfHeight
  const top = blocker.centerY + blocker.halfHeight
  return top > GROUND_ACTOR_STEP_HEIGHT_METERS && bottom < GROUND_ACTOR_HEIGHT_METERS
}

export function clampGameFpsPitch(value: number): number {
  return Math.max(-1.2, Math.min(1.2, value))
}

export function normalizeGameFpsYaw(value: number): number {
  const fullTurn = Math.PI * 2
  return ((value + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI
}

function insideBlocker(point: GameFpsPoint, blocker: GameFpsBlocker, radius: number): boolean {
  return obstructsGroundActor(blocker)
    && Math.abs(point.x - blocker.centerX) < blocker.halfWidth + radius
    && Math.abs(point.z - blocker.centerZ) < blocker.halfDepth + radius
}

export function isGameFpsPositionValid(
  point: GameFpsPoint,
  radius: number,
  map: GameFpsSpatialMap,
): boolean {
  if (Math.abs(point.x - map.centerX) > map.halfWidth - radius) return false
  if (Math.abs(point.z - map.centerZ) > map.halfDepth - radius) return false
  if (map.walkableSurfaces?.length && !hasWalkableFootprint(point, radius, map.walkableSurfaces)) return false
  return !map.blockers.some(blocker => insideBlocker(point, blocker, radius))
}

function isInsideWalkableSurface(
  point: GameFpsPoint,
  surface: NonNullable<GameFpsSpatialMap['walkableSurfaces']>[number],
): boolean {
  return Math.abs(point.x - surface.centerX) <= surface.halfWidth
    && Math.abs(point.z - surface.centerZ) <= surface.halfDepth
}

function hasWalkableFootprint(
  point: GameFpsPoint,
  radius: number,
  surfaces: NonNullable<GameFpsSpatialMap['walkableSurfaces']>,
): boolean {
  if (!surfaces.some(surface => isInsideWalkableSurface(point, surface))) return false
  if (radius <= 0) return true
  const sampleCount = 16
  for (let index = 0; index < sampleCount; index += 1) {
    const angle = index * Math.PI * 2 / sampleCount
    const sample = {
      x: point.x + Math.cos(angle) * radius,
      z: point.z + Math.sin(angle) * radius,
    }
    if (!surfaces.some(surface => isInsideWalkableSurface(sample, surface))) return false
  }
  return true
}

export function readGameFpsGroundHeight(
  point: GameFpsPoint,
  map: GameFpsSpatialMap,
): number {
  const surfaces = map.walkableSurfaces || []
  const ground = surfaces
    .filter(surface => isInsideWalkableSurface(point, surface))
    .sort((left, right) => right.topMeters - left.topMeters || left.id.localeCompare(right.id))[0]
  return ground?.topMeters || 0
}

export function resolveGameFpsMovement(
  origin: GameFpsPoint,
  delta: GameFpsPoint,
  radius: number,
  map: GameFpsSpatialMap,
): GameFpsPoint {
  const both = { x: origin.x + delta.x, z: origin.z + delta.z }
  if (isGameFpsPositionValid(both, radius, map)) return both
  const xOnly = { x: origin.x + delta.x, z: origin.z }
  if (isGameFpsPositionValid(xOnly, radius, map)) return xOnly
  const zOnly = { x: origin.x, z: origin.z + delta.z }
  return isGameFpsPositionValid(zOnly, radius, map) ? zOnly : origin
}

function segmentIntersectsBlocker(
  start: GameFpsPoint,
  end: GameFpsPoint,
  blocker: GameFpsBlocker,
  padding = 0,
): boolean {
  const minX = blocker.centerX - blocker.halfWidth - padding
  const maxX = blocker.centerX + blocker.halfWidth + padding
  const minZ = blocker.centerZ - blocker.halfDepth - padding
  const maxZ = blocker.centerZ + blocker.halfDepth + padding
  const dx = end.x - start.x
  const dz = end.z - start.z
  let entry = 0
  let exit = 1
  for (const [origin, delta, min, max] of [
    [start.x, dx, minX, maxX],
    [start.z, dz, minZ, maxZ],
  ] as const) {
    if (Math.abs(delta) <= EPSILON) {
      if (origin < min || origin > max) return false
      continue
    }
    const first = (min - origin) / delta
    const second = (max - origin) / delta
    entry = Math.max(entry, Math.min(first, second))
    exit = Math.min(exit, Math.max(first, second))
    if (entry > exit) return false
  }
  return exit > EPSILON && entry < 1 - EPSILON
}

export function hasGameFpsLineOfSight(
  start: GameFpsPoint,
  end: GameFpsPoint,
  map: GameFpsSpatialMap,
): boolean {
  return !map.blockers.some(blocker => {
    if (!obstructsGroundActor(blocker)) return false
    return segmentIntersectsBlocker(start, end, blocker)
  })
}

export function gameFpsHorizontalDistance(left: GameFpsPoint, right: GameFpsPoint): number {
  return Math.hypot(right.x - left.x, right.z - left.z)
}

export function gameFpsLookDirection(yaw: number, pitch: number): readonly [number, number, number] {
  const horizontal = Math.cos(pitch)
  return Object.freeze([
    -Math.sin(yaw) * horizontal,
    Math.sin(pitch),
    -Math.cos(yaw) * horizontal,
  ])
}

export function gameFpsRayAabbDistance(args: {
  origin: readonly [number, number, number]
  direction: readonly [number, number, number]
  center: readonly [number, number, number]
  halfExtents: readonly [number, number, number]
}): number | null {
  const directionLength = Math.hypot(...args.direction)
  if (!Number.isFinite(directionLength) || directionLength <= EPSILON) return null
  const direction = args.direction.map(value => value / directionLength)
  let entryDistance = Number.NEGATIVE_INFINITY
  let exitDistance = Number.POSITIVE_INFINITY

  for (const axis of [0, 1, 2] as const) {
    const halfExtent = args.halfExtents[axis]
    if (!Number.isFinite(halfExtent) || halfExtent < 0) return null
    const minimum = args.center[axis] - halfExtent
    const maximum = args.center[axis] + halfExtent
    const axisDirection = direction[axis]
    if (Math.abs(axisDirection) <= EPSILON) {
      if (args.origin[axis] < minimum || args.origin[axis] > maximum) return null
      continue
    }
    const first = (minimum - args.origin[axis]) / axisDirection
    const second = (maximum - args.origin[axis]) / axisDirection
    entryDistance = Math.max(entryDistance, Math.min(first, second))
    exitDistance = Math.min(exitDistance, Math.max(first, second))
    if (entryDistance > exitDistance) return null
  }

  if (exitDistance <= EPSILON) return null
  return entryDistance > EPSILON ? entryDistance : exitDistance
}

export function selectGameFpsRayAabbHit(args: {
  origin: readonly [number, number, number]
  direction: readonly [number, number, number]
  maxDistance: number
  candidates: readonly GameFpsRayAabbCandidate[]
}): GameFpsRayAabbHit | null {
  let selected: GameFpsRayAabbHit | null = null
  for (const candidate of args.candidates) {
    const distance = gameFpsRayAabbDistance({
      origin: args.origin,
      direction: args.direction,
      center: candidate.center,
      halfExtents: candidate.halfExtents,
    })
    if (distance == null || distance > args.maxDistance) continue
    const winsDistance = !selected || distance < selected.distance
    const winsEntityTie = selected && distance === selected.distance && candidate.entityRef < selected.entityRef
    if (winsDistance || winsEntityTie) {
      selected = Object.freeze({ entityRef: candidate.entityRef, distance })
    }
  }
  return selected
}
