import { flightSimAirspeed, flightSimHeadingDegrees } from './flightModel'
import { resolveFlightSimEffectiveSaveStatus } from './flightSimDecisionStore'
import type {
  FlightSimDecisionStoreSnapshot,
  FlightSimEffectiveSaveStatus,
} from './flightSimDecisionStore'
import type { FlightSimSnapshot } from './flightSimModel'

export type FlightSimHudProjection = Readonly<{
  airspeed: number
  altitude: number
  headingDegrees: number
  pitchRadians: number
  rollRadians: number
  throttle: number
  waypoint: Readonly<{
    index: number
    count: number
    currentId: string | null
    atLandingPad: boolean
  }>
  objective: string
  save: Readonly<{
    status: FlightSimDecisionStoreSnapshot['status']
    effectiveStatus: FlightSimEffectiveSaveStatus
    label: string
    pendingCount: number
    retainedCount: number
    error: string | null
    path: string
  }>
  error: Readonly<{
    message: string
    path: string | null
  }> | null
}>

function saveLabel(status: FlightSimEffectiveSaveStatus): string {
  if (status === 'saving') return 'Saving Decisions…'
  if (status === 'error') return 'Local save needs attention'
  if (status === 'pending') return 'Decision pending'
  if (status === 'saved') return 'Decisions saved locally'
  return 'Local save ready'
}

function objectiveLabel(
  flight: FlightSimSnapshot,
  hydrationPending: boolean,
): string {
  if (hydrationPending) return 'Loading local Decisions…'
  if (flight.phase === 'completed') return 'Route complete'
  if (flight.phase === 'crashed') {
    return `Aircraft stopped by ${flight.collisionId || 'terrain'}`
  }
  if (flight.phase === 'flying') {
    return flight.waypointIndex >= flight.waypointCount
      ? 'Land on the marked landing pad'
      : `Waypoint ${flight.waypointIndex + 1} of ${flight.waypointCount}`
  }
  return flight.phase === 'ready'
    ? 'Ready · apply flight input'
    : 'Flight Sim stopped'
}

export function projectFlightSimHud(args: Readonly<{
  flight: FlightSimSnapshot
  save: FlightSimDecisionStoreSnapshot
  savePath: string
  hydrationPending: boolean
}>): FlightSimHudProjection {
  const pendingCount = args.flight.pendingDecisions.length
  const effectiveStatus = resolveFlightSimEffectiveSaveStatus(
    args.save.status,
    pendingCount,
  )
  const errorMessage = args.flight.runtimeError || args.save.error
  return Object.freeze({
    airspeed: flightSimAirspeed(args.flight.aircraft),
    altitude: args.flight.aircraft.position[1],
    headingDegrees: flightSimHeadingDegrees(args.flight.aircraft.yaw),
    pitchRadians: args.flight.aircraft.pitch,
    rollRadians: args.flight.aircraft.roll,
    throttle: args.flight.aircraft.throttle,
    waypoint: Object.freeze({
      index: args.flight.waypointIndex,
      count: args.flight.waypointCount,
      currentId: args.flight.currentWaypointId,
      atLandingPad: args.flight.waypointIndex >= args.flight.waypointCount,
    }),
    objective: objectiveLabel(args.flight, args.hydrationPending),
    save: Object.freeze({
      status: args.save.status,
      effectiveStatus,
      label: saveLabel(effectiveStatus),
      pendingCount,
      retainedCount: args.save.retainedCount,
      error: args.save.error,
      path: args.savePath,
    }),
    error: errorMessage
      ? Object.freeze({
        message: errorMessage,
        path: args.save.error ? args.savePath : null,
      })
      : null,
  })
}
