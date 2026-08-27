import { flightSimForwardVector, type FlightSimAircraftState, type SpatialVector } from './flight.js'

export type FlightSimCameraView = 'chase' | 'cockpit' | 'survey'

export interface FlightSimSnapshotLike {
  readonly aircraft: Pick<FlightSimAircraftState, 'position' | 'pitch' | 'yaw'>
  readonly runId: number
  readonly tick: number
}

export interface FlightSimFollowTarget {
  readonly position: SpatialVector
  readonly target: SpatialVector
  readonly fovDegrees: number
  readonly resetKey: number
  readonly sequence: number
}

export const FLIGHT_SIM_CAMERA_PROFILE_SCHEMA = 'agenticgraph.flight-camera/v1' as const
export const FLIGHT_SIM_AIRCRAFT_COLLISION_HALF_SIZE_METERS: SpatialVector = Object.freeze([
  6,
  1.7,
  5.5,
])

export interface FlightSimCameraProfile {
  readonly schema: typeof FLIGHT_SIM_CAMERA_PROFILE_SCHEMA
  readonly aircraftCollisionHalfSizeMeters: SpatialVector
  readonly cockpitForwardClearanceMeters: number
  readonly cockpitVerticalClearanceMeters: number
  readonly cockpitLookAheadMeters: number
  readonly cockpitFovDegrees: number
  readonly chaseMinimumDistanceMeters: number
  readonly chaseTargetMinimumHeightMeters: number
  readonly chaseHeightMeters: number
  readonly chaseFovDegrees: number
  readonly chaseWingHalfSpanClearance: number
  readonly surveyBackDistanceMeters: number
  readonly surveyHeightMeters: number
  readonly surveyLookAheadMeters: number
  readonly surveyTargetHeightMeters: number
  readonly surveyFovDegrees: number
}

export type FlightSimCameraProfileInput = Partial<Omit<FlightSimCameraProfile,
  'schema' | 'aircraftCollisionHalfSizeMeters'>> & {
  readonly schema?: string
  readonly aircraftCollisionHalfSizeMeters?: SpatialVector
}

export const DEFAULT_FLIGHT_SIM_CAMERA_PROFILE: FlightSimCameraProfile = Object.freeze({
  schema: FLIGHT_SIM_CAMERA_PROFILE_SCHEMA,
  aircraftCollisionHalfSizeMeters: FLIGHT_SIM_AIRCRAFT_COLLISION_HALF_SIZE_METERS,
  cockpitForwardClearanceMeters: 0.55,
  cockpitVerticalClearanceMeters: 0.45,
  cockpitLookAheadMeters: 18,
  cockpitFovDegrees: 68,
  chaseMinimumDistanceMeters: 8,
  chaseTargetMinimumHeightMeters: 0.8,
  chaseHeightMeters: 3.2,
  chaseFovDegrees: 58,
  chaseWingHalfSpanClearance: 2,
  surveyBackDistanceMeters: 4,
  surveyHeightMeters: 18,
  surveyLookAheadMeters: 5,
  surveyTargetHeightMeters: 0.8,
  surveyFovDegrees: 64,
})

const CAMERA_PROFILE_KEYS = new Set(Object.keys(DEFAULT_FLIGHT_SIM_CAMERA_PROFILE))

function requirePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a finite positive number.`)
}

export function createFlightSimCameraProfile(
  input: FlightSimCameraProfileInput = {},
): FlightSimCameraProfile {
  for (const key of Object.keys(input)) {
    if (!CAMERA_PROFILE_KEYS.has(key)) throw new RangeError(`Unknown flight-camera profile key: ${key}.`)
  }
  if (input.schema !== undefined && input.schema !== FLIGHT_SIM_CAMERA_PROFILE_SCHEMA) {
    throw new RangeError(`schema must equal ${FLIGHT_SIM_CAMERA_PROFILE_SCHEMA}.`)
  }
  const aircraftCollisionHalfSizeMeters = Object.freeze([
    ...(input.aircraftCollisionHalfSizeMeters
      ?? DEFAULT_FLIGHT_SIM_CAMERA_PROFILE.aircraftCollisionHalfSizeMeters),
  ]) as SpatialVector
  if (aircraftCollisionHalfSizeMeters.length !== 3) {
    throw new RangeError('aircraftCollisionHalfSizeMeters must contain three numbers.')
  }
  const profile: FlightSimCameraProfile = Object.freeze({
    ...DEFAULT_FLIGHT_SIM_CAMERA_PROFILE,
    ...input,
    schema: FLIGHT_SIM_CAMERA_PROFILE_SCHEMA,
    aircraftCollisionHalfSizeMeters,
  })
  for (const [name, value] of Object.entries(profile)) {
    if (name === 'schema' || name.endsWith('FovDegrees') || name === 'aircraftCollisionHalfSizeMeters') continue
    requirePositive(value as number, name)
  }
  for (const value of profile.aircraftCollisionHalfSizeMeters) {
    requirePositive(value, 'aircraftCollisionHalfSizeMeters')
  }
  for (const [name, value] of [
    ['cockpitFovDegrees', profile.cockpitFovDegrees],
    ['chaseFovDegrees', profile.chaseFovDegrees],
    ['surveyFovDegrees', profile.surveyFovDegrees],
  ] as const) {
    if (!Number.isFinite(value) || value <= 1 || value >= 179) {
      throw new RangeError(`${name} must be between 1 and 179 degrees.`)
    }
  }
  return profile
}

export function resolveFlightSimFollowTarget(
  snapshot: FlightSimSnapshotLike,
  coordinateScale: number,
  view: FlightSimCameraView = 'chase',
  profile: FlightSimCameraProfile = DEFAULT_FLIGHT_SIM_CAMERA_PROFILE,
): FlightSimFollowTarget {
  const scale = Number.isFinite(coordinateScale) && coordinateScale > 0 ? coordinateScale : 1
  const forward = flightSimForwardVector(snapshot.aircraft.pitch, snapshot.aircraft.yaw)
  const aircraft: SpatialVector = Object.freeze([
    snapshot.aircraft.position[0] * scale,
    snapshot.aircraft.position[1] * scale,
    snapshot.aircraft.position[2] * scale,
  ])
  const [aircraftHalfWidth, aircraftHalfHeight, aircraftHalfDepth]
    = profile.aircraftCollisionHalfSizeMeters
  const vector = (forwardDistance: number, height: number): SpatialVector => Object.freeze([
    aircraft[0] + forward[0] * forwardDistance * scale,
    aircraft[1] + forward[1] * forwardDistance * scale + height * scale,
    aircraft[2] + forward[2] * forwardDistance * scale,
  ])
  const chaseTargetHeight = Math.max(profile.chaseTargetMinimumHeightMeters, aircraftHalfHeight)
  const chaseDistance = Math.max(
    profile.chaseMinimumDistanceMeters,
    aircraftHalfDepth + aircraftHalfWidth * profile.chaseWingHalfSpanClearance,
  )
  const chaseTarget = vector(0, chaseTargetHeight)
  const chasePosition: SpatialVector = Object.freeze([
    chaseTarget[0] - forward[0] * chaseDistance * scale,
    chaseTarget[1] - forward[1] * 2 * scale + profile.chaseHeightMeters * scale,
    chaseTarget[2] - forward[2] * chaseDistance * scale,
  ])
  const cockpitForwardDistance = aircraftHalfDepth + profile.cockpitForwardClearanceMeters
  const cockpitHeight = aircraftHalfHeight + profile.cockpitVerticalClearanceMeters
  const horizontalForwardLength = Math.max(0.000001, Math.hypot(forward[0], forward[2]))
  const horizontalForward: SpatialVector = Object.freeze([
    forward[0] / horizontalForwardLength,
    0,
    forward[2] / horizontalForwardLength,
  ])
  const cockpitPosition: SpatialVector = Object.freeze([
    aircraft[0] + horizontalForward[0] * cockpitForwardDistance * scale,
    aircraft[1] + cockpitHeight * scale,
    aircraft[2] + horizontalForward[2] * cockpitForwardDistance * scale,
  ])
  const cockpitTarget: SpatialVector = Object.freeze([
    cockpitPosition[0] + forward[0] * profile.cockpitLookAheadMeters * scale,
    cockpitPosition[1] + forward[1] * profile.cockpitLookAheadMeters * scale,
    cockpitPosition[2] + forward[2] * profile.cockpitLookAheadMeters * scale,
  ])
  const framing = view === 'cockpit'
    ? { position: cockpitPosition, target: cockpitTarget, fovDegrees: profile.cockpitFovDegrees }
    : view === 'survey'
      ? {
          position: vector(-profile.surveyBackDistanceMeters, profile.surveyHeightMeters),
          target: vector(profile.surveyLookAheadMeters, profile.surveyTargetHeightMeters),
          fovDegrees: profile.surveyFovDegrees,
        }
      : { position: chasePosition, target: chaseTarget, fovDegrees: profile.chaseFovDegrees }
  return Object.freeze({
    position: framing.position,
    target: framing.target,
    fovDegrees: framing.fovDegrees,
    resetKey: snapshot.runId,
    sequence: snapshot.tick,
  })
}
