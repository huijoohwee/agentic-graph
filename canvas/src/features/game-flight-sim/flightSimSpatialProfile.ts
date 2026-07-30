import { useGraphStore } from '@/hooks/useGraphStore'
import { isNativeXrRunReadyDemoActive } from '@/features/workspace-fs/workspaceRunReadyDemos'
import {
  findSpatialCollision,
  findSweptSpatialCuboidHit,
  type SpatialWorldCuboid,
} from '@/features/physics/spatialPhysicsGeometry'
import type { SpatialVector } from '@/features/physics/spatialPhysicsTypes'
import {
  resolveXrCanonicalSceneProjection,
  resolveXrCanonicalSceneSpatialSource,
  type XrCanonicalSceneSpatialSource,
} from '@/features/three/xrCanonicalSceneSpatialSource'
import { readXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { FLIGHT_SIM_AIRCRAFT_ASSET_SPEC } from './assetSpec/flightSimAssetSpec'
import {
  FLIGHT_SIM_COLLISION_SEPARATION_METERS,
  FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
  freezeFlightSimAircraftState,
  type FlightSimAircraftState,
  type FlightSimBlocker,
  type FlightSimSpatialProfile,
  type FlightSimWaypoint,
} from './flightSimModel'
import {
  FLIGHT_SIM_SPATIAL_SCALE_ID,
  flightSimAuthoredWorldUnitsToMeters,
} from './flightSimSpatialScale'

export type FlightSimCollisionResolution = Readonly<{
  state: FlightSimAircraftState
  collisionId: string | null
  impactSpeed: number
}>

function vector(value: readonly number[]): SpatialVector {
  return Object.freeze([...value]) as SpatialVector
}

function missionVector(value: readonly number[]): SpatialVector {
  return vector(value.map(flightSimAuthoredWorldUnitsToMeters))
}

function blockerCuboid(blocker: FlightSimBlocker): SpatialWorldCuboid {
  return { kind: 'cuboid', center: blocker.center, halfSize: blocker.halfSize }
}

function aircraftCuboid(position: SpatialVector, halfSize: SpatialVector): SpatialWorldCuboid {
  return { kind: 'cuboid', center: position, halfSize }
}

function compareIds(left: { id: string }, right: { id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

export function createFlightSimSpatialProfile(
  source: XrCanonicalSceneSpatialSource,
): FlightSimSpatialProfile {
  const [sourceCenterX, sourceCenterZ] = source.perimeter.centerMeters
  const centerX = flightSimAuthoredWorldUnitsToMeters(sourceCenterX)
  const centerZ = flightSimAuthoredWorldUnitsToMeters(sourceCenterZ)
  const halfWidth = flightSimAuthoredWorldUnitsToMeters(source.perimeter.halfWidthMeters)
  const halfDepth = flightSimAuthoredWorldUnitsToMeters(source.perimeter.halfDepthMeters)
  const authoredBlockers = source.staticColliders
    .filter(collider => !collider.trigger)
    .map<FlightSimBlocker>(collider => Object.freeze({
      id: collider.id,
      center: missionVector(collider.center),
      halfSize: missionVector(collider.sizeMeters.map(size => size / 2)),
    }))
    .sort(compareIds)
  const boundaryHalfThickness = flightSimAuthoredWorldUnitsToMeters(0.5)
  const ground = Object.freeze({
    id: 'flight-sim:terrain-ground',
    center: vector([centerX, -boundaryHalfThickness, centerZ]),
    halfSize: vector([halfWidth, boundaryHalfThickness, halfDepth]),
  })
  const authoredTop = authoredBlockers.reduce(
    (maximum, blocker) => Math.max(maximum, blocker.center[1] + blocker.halfSize[1]),
    0,
  )
  const ceilingHeight = Math.max(
    flightSimAuthoredWorldUnitsToMeters(32),
    authoredTop + flightSimAuthoredWorldUnitsToMeters(12),
  )
  const boundaryHalfHeight = ceilingHeight / 2 + boundaryHalfThickness
  const boundaryPadding = boundaryHalfThickness * 2
  const boundaries: readonly FlightSimBlocker[] = Object.freeze([
    Object.freeze({
      id: 'flight-sim:boundary-west',
      center: vector([centerX - halfWidth - boundaryHalfThickness, ceilingHeight / 2, centerZ]),
      halfSize: vector([boundaryHalfThickness, boundaryHalfHeight, halfDepth + boundaryPadding]),
    }),
    Object.freeze({
      id: 'flight-sim:boundary-east',
      center: vector([centerX + halfWidth + boundaryHalfThickness, ceilingHeight / 2, centerZ]),
      halfSize: vector([boundaryHalfThickness, boundaryHalfHeight, halfDepth + boundaryPadding]),
    }),
    Object.freeze({
      id: 'flight-sim:boundary-north',
      center: vector([centerX, ceilingHeight / 2, centerZ - halfDepth - boundaryHalfThickness]),
      halfSize: vector([halfWidth + boundaryPadding, boundaryHalfHeight, boundaryHalfThickness]),
    }),
    Object.freeze({
      id: 'flight-sim:boundary-south',
      center: vector([centerX, ceilingHeight / 2, centerZ + halfDepth + boundaryHalfThickness]),
      halfSize: vector([halfWidth + boundaryPadding, boundaryHalfHeight, boundaryHalfThickness]),
    }),
    Object.freeze({
      id: 'flight-sim:boundary-ceiling',
      center: vector([centerX, ceilingHeight + boundaryHalfThickness, centerZ]),
      halfSize: vector([halfWidth + boundaryPadding, boundaryHalfThickness, halfDepth + boundaryPadding]),
    }),
  ])
  const blockers = Object.freeze([...authoredBlockers, ...boundaries, ground].sort(compareIds))
  const cruiseAltitude = Math.max(
    flightSimAuthoredWorldUnitsToMeters(7),
    Math.min(
      flightSimAuthoredWorldUnitsToMeters(20),
      authoredTop + flightSimAuthoredWorldUnitsToMeters(3),
    ),
  )
  const spawn = freezeFlightSimAircraftState({
    position: vector([centerX, cruiseAltitude, centerZ + halfDepth * 0.34]),
    velocity: vector([0, 0, -12]),
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttle: 0.62,
  })
  const waypointSeeds: readonly [string, number, number, number][] = [
    ['departure', centerX, cruiseAltitude, centerZ - halfDepth * 0.12],
    ['harbour-west', centerX - halfWidth * 0.32, cruiseAltitude + flightSimAuthoredWorldUnitsToMeters(2), centerZ - halfDepth * 0.38],
    ['home-leg', centerX + halfWidth * 0.28, cruiseAltitude + flightSimAuthoredWorldUnitsToMeters(1), centerZ + halfDepth * 0.04],
  ]
  const waypoints = Object.freeze(waypointSeeds.map<FlightSimWaypoint>((seed, index) => Object.freeze({
    id: `flight-sim:waypoint:${index + 1}:${seed[0]}`,
    position: vector([seed[1], seed[2], seed[3]]),
    radiusMeters: FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
  })))
  const landingPad = Object.freeze({
    id: 'flight-sim:landing-pad:home',
    position: vector([
      centerX,
      flightSimAuthoredWorldUnitsToMeters(0.25),
      centerZ + halfDepth * 0.24,
    ]),
    radiusMeters: FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
  })
  return Object.freeze({
    id: `flight-sim:${source.projection}:${source.stage.id}:${FLIGHT_SIM_SPATIAL_SCALE_ID}`,
    sourceKey: `${source.projection}:${source.stage.id}:${FLIGHT_SIM_SPATIAL_SCALE_ID}`,
    aircraftHalfSize: FLIGHT_SIM_AIRCRAFT_ASSET_SPEC.collisionHalfSizeMeters,
    spawn,
    blockers,
    waypoints,
    landingPad,
  })
}

function readSpatialSelection() {
  const state = useGraphStore.getState()
  const projection = resolveXrCanonicalSceneProjection({
    physicsRunReady: isNativeXrRunReadyDemoActive(
      state.markdownDocumentName,
      state.markdownDocumentText,
    ),
  })
  return Object.freeze({
    projection,
    stageId: readXrMotionReferenceRuntime().plan.stageId,
  })
}

export function readFlightSimXrSpatialSourceKey(): string {
  const selection = readSpatialSelection()
  return `${selection.projection}:${selection.stageId}:${FLIGHT_SIM_SPATIAL_SCALE_ID}`
}

export function readFlightSimXrSpatialProfile(): FlightSimSpatialProfile {
  return createFlightSimSpatialProfile(resolveXrCanonicalSceneSpatialSource(readSpatialSelection()))
}

export function resolveFlightSimAabbMotion(
  previous: FlightSimAircraftState,
  proposed: FlightSimAircraftState,
  profile: Pick<FlightSimSpatialProfile, 'aircraftHalfSize' | 'blockers'>,
): FlightSimCollisionResolution {
  const start = aircraftCuboid(previous.position, profile.aircraftHalfSize)
  const end = aircraftCuboid(proposed.position, profile.aircraftHalfSize)
  const hits = profile.blockers.flatMap(blocker => {
    const fixed = blockerCuboid(blocker)
    const startedOverlapping = findSpatialCollision(start, fixed)
    if (startedOverlapping?.penetration && startedOverlapping.penetration > 1e-7) {
      return [{
        blocker,
        time: 0,
        normal: startedOverlapping.normal,
        penetration: startedOverlapping.penetration,
      }]
    }
    const swept = findSweptSpatialCuboidHit(start, end, fixed, fixed)
    if (swept) return [{ blocker, time: swept.time, normal: swept.normal, penetration: 0 }]
    const endedOverlapping = findSpatialCollision(end, fixed)
    return endedOverlapping
      ? [{ blocker, time: 1, normal: endedOverlapping.normal, penetration: 0 }]
      : []
  }).sort((left, right) => left.time - right.time || compareIds(left.blocker, right.blocker))
  const hit = hits[0]
  if (!hit) return Object.freeze({ state: proposed, collisionId: null, impactSpeed: 0 })

  const impactPosition = previous.position.map((value, axis) => (
    value + (proposed.position[axis] - value) * hit.time
  ))
  const position = hit.penetration > 0
    ? vector(previous.position.map((value, axis) => (
        value - hit.normal[axis] * (
          hit.penetration + FLIGHT_SIM_COLLISION_SEPARATION_METERS
        )
      )))
    : vector(impactPosition.map((value, axis) => (
        value - hit.normal[axis] * FLIGHT_SIM_COLLISION_SEPARATION_METERS
      )))
  const velocity = vector(proposed.velocity.map((value, axis) => (
    Math.abs(hit.normal[axis]) > 0.5 ? 0 : value
  )))
  return Object.freeze({
    state: freezeFlightSimAircraftState({ ...proposed, position, velocity }),
    collisionId: hit.blocker.id,
    impactSpeed: Math.hypot(...proposed.velocity),
  })
}

export function flightSimWaypointReached(
  position: SpatialVector,
  waypoint: FlightSimWaypoint,
): boolean {
  return Math.hypot(
    position[0] - waypoint.position[0],
    position[1] - waypoint.position[1],
    position[2] - waypoint.position[2],
  ) <= waypoint.radiusMeters
}
