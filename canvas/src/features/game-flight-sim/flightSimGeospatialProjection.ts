import type {
  FlightSimSnapshot,
  FlightSimSpatialProfile,
} from './flightSimModel'
import type { SpatialVector } from '@/features/physics/spatialPhysicsTypes'
import type { CameraFramingPose } from '@/lib/camera/cameraFramingPose'
import { resolveFlightSimFollowTarget } from './flightSimFollowTarget'
import { projectFlightSimRouteGuidance } from './flightSimRouteGuidance'
import { flightSimAuthoredWorldUnitsToMeters } from './flightSimSpatialScale'
import {
  projectSingaporeLocalMeters,
} from '@/lib/gympgrph/api'
import type {
  FlightSimGeoEnvironmentProjection,
} from './flightSimGeoEnvironmentProjection'

export type FlightSimGeospatialCoordinate =
  readonly [longitude: number, latitude: number]

export type FlightSimGeospatialRoutePoint = Readonly<{
  id: string
  coordinate: FlightSimGeospatialCoordinate
  altitudeMeters: number
  kind: 'spawn' | 'waypoint' | 'landing'
  state: 'active' | 'pending' | 'visited'
}>

export type FlightSimGeospatialOverlay = Readonly<{
  active: boolean
  aircraft: Readonly<{
    coordinate: FlightSimGeospatialCoordinate
    altitudeMeters: number
    headingDegrees: number
  }>
  camera: Readonly<{
    centerCoordinate: FlightSimGeospatialCoordinate
    cockpitClearance: Readonly<{
      forwardMeters: number
      verticalMeters: number
    }>
    effectiveOwner: 'fixed-follow' | 'free-orbit' | 'timeline-playback'
    source: 'fixed-follow' | 'free-orbit'
    timeline: FlightSimGeospatialTimelineCamera | null
    view: 'chase' | 'cockpit' | 'survey'
  }>
  environment: FlightSimGeoEnvironmentProjection | null
  night: boolean
  objective: Readonly<{
    bearingDegrees: number
    coordinate: FlightSimGeospatialCoordinate
    distanceMeters: number
    headingErrorDegrees: number
    id: string
    kind: 'waypoint' | 'landing'
    label: string
  }> | null
  phase: FlightSimSnapshot['phase']
  profileId: string
  readyFrameRequestId: number | null
  revision: string
  route: readonly FlightSimGeospatialRoutePoint[]
  runId: number
  tick: number
}>

export type FlightSimGeospatialTimelineCamera = Readonly<{
  bearingDegrees: number
  centerCoordinate: FlightSimGeospatialCoordinate
  pitchDegrees: number
  playheadSeconds: number
  zoom: number
}>

export type FlightSimGeospatialCameraInput = Readonly<{
  source: 'fixed-follow' | 'free-orbit'
  timeline?: FlightSimGeospatialTimelineCamera | null
  view: 'chase' | 'cockpit' | 'survey'
}>

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function projectPosition(
  position: SpatialVector,
  origin: SpatialVector,
): FlightSimGeospatialCoordinate {
  return projectSingaporeLocalMeters(
    position[0] - origin[0],
    origin[2] - position[2],
  )
}

export function projectFlightSimTimelineCameraToGeospatial(
  pose: CameraFramingPose,
  profile: FlightSimSpatialProfile,
  playheadSeconds: number,
): FlightSimGeospatialTimelineCamera {
  const position = Object.freeze(
    pose.position.map(flightSimAuthoredWorldUnitsToMeters),
  ) as SpatialVector
  const target = Object.freeze(
    pose.target.map(flightSimAuthoredWorldUnitsToMeters),
  ) as SpatialVector
  const eastMeters = target[0] - position[0]
  const northMeters = position[2] - target[2]
  const horizontalDistanceMeters = Math.hypot(eastMeters, northMeters)
  const verticalDistanceMeters = Math.max(0, position[1] - target[1])
  const distanceMeters = Math.max(
    1,
    Math.hypot(horizontalDistanceMeters, verticalDistanceMeters),
  )
  return Object.freeze({
    bearingDegrees: (
      Math.atan2(eastMeters, northMeters) * 180 / Math.PI + 360
    ) % 360,
    centerCoordinate: projectPosition(target, profile.spawn.position),
    pitchDegrees: clamp(
      90 - Math.atan2(verticalDistanceMeters, Math.max(0.001, horizontalDistanceMeters))
        * 180 / Math.PI,
      8,
      80,
    ),
    playheadSeconds,
    zoom: clamp(17 - Math.log2(distanceMeters / 40), 12, 18),
  })
}

export function projectFlightSimToGeospatialOverlay(
  flight: FlightSimSnapshot,
  profile: FlightSimSpatialProfile,
  camera: FlightSimGeospatialCameraInput,
  night: boolean,
  readyFrameRequestId: number | null = null,
  environment: FlightSimGeoEnvironmentProjection | null = null,
): FlightSimGeospatialOverlay {
  const guidance = projectFlightSimRouteGuidance(flight, profile)
  const fixedFollow = resolveFlightSimFollowTarget(flight, 1, camera.view)
  const cockpitClearance = Object.freeze({
    forwardMeters: Math.hypot(
      fixedFollow.position[0] - flight.aircraft.position[0],
      fixedFollow.position[2] - flight.aircraft.position[2],
    ),
    verticalMeters:
      fixedFollow.position[1] - flight.aircraft.position[1],
  })
  const centerPosition = camera.view === 'cockpit'
    ? Object.freeze([...fixedFollow.target]) as SpatialVector
    : flight.aircraft.position
  const timeline = camera.timeline || null
  const route = Object.freeze(guidance.route.map<FlightSimGeospatialRoutePoint>(point => {
    return Object.freeze({
      id: point.id,
      coordinate: projectPosition(point.position, profile.spawn.position),
      altitudeMeters: point.position[1],
      kind: point.kind,
      state: point.state,
    })
  }))
  const objective = guidance.objective
    ? Object.freeze({
        bearingDegrees: guidance.objective.bearingDegrees,
        coordinate: projectPosition(
          guidance.objective.position,
          profile.spawn.position,
        ),
        distanceMeters: guidance.objective.distanceMeters,
        headingErrorDegrees: guidance.objective.headingErrorDegrees,
        id: guidance.objective.id,
        kind: guidance.objective.kind,
        label: guidance.objective.label,
      })
    : null
  return Object.freeze({
    active: flight.active,
    aircraft: Object.freeze({
      coordinate: projectPosition(flight.aircraft.position, profile.spawn.position),
      altitudeMeters: flight.aircraft.position[1],
      headingDegrees: guidance.aircraftHeadingDegrees,
    }),
    camera: Object.freeze({
      centerCoordinate: projectPosition(centerPosition, profile.spawn.position),
      cockpitClearance,
      effectiveOwner: timeline ? 'timeline-playback' : camera.source,
      source: camera.source,
      timeline,
      view: camera.view,
    }),
    environment,
    night,
    objective,
    phase: flight.phase,
    profileId: profile.id,
    readyFrameRequestId,
    revision: [
      flight.runId,
      flight.tick,
      flight.phase,
      flight.waypointIndex,
      profile.id,
      camera.source,
      camera.view,
      timeline?.playheadSeconds ?? 'operator',
      environment?.revision ?? 'no-environment',
      night ? 'night' : 'day',
    ].join(':'),
    route,
    runId: flight.runId,
    tick: flight.tick,
  })
}
