import {
  FLIGHT_SIM_FIXED_STEP_SECONDS,
  FLIGHT_SIM_MAX_MISSION_TICKS,
  FLIGHT_SIM_MISSION_ENTITY_REF,
  FLIGHT_SIM_MISSION_ID,
  FLIGHT_SIM_TIMEOUT_COLLIDER_ID,
  flightSimDecisionId,
  flightSimDecisionProducedAt,
  freezeFlightSimAircraftState,
  normalizeFlightSimInputFrame,
  type FlightSimAircraftState,
  type FlightSimDecisionEvent,
  type FlightSimDecisionRecord,
  type FlightSimSpatialProfile,
  type FlightSimTickInput,
} from './flightSimModel'
import { integrateFlightModel } from './flightModel'
import {
  flightSimWaypointReached,
  resolveFlightSimAabbMotion,
} from './flightSimSpatialProfile'

export const FLIGHT_SIM_PHASE_READY = 1
export const FLIGHT_SIM_PHASE_FLYING = 2
export const FLIGHT_SIM_PHASE_COMPLETED = 3
export const FLIGHT_SIM_PHASE_CRASHED = 4

export const FLIGHT_SIM_SYSTEM_NAMES = Object.freeze([
  'InputIntegrationSystem',
  'FlightModelSystem',
  'CollisionResolverSystem',
  'ObjectiveSystem',
] as const)

export type FlightSimSystemName = (typeof FLIGHT_SIM_SYSTEM_NAMES)[number]

export const FLIGHT_SIM_TICK_ARCHITECTURE = Object.freeze({
  transactionalSystems: FLIGHT_SIM_SYSTEM_NAMES,
  costLogOwner: 'AgenticECS.worldTick:post-systems',
  projectionOwner: 'captureFlightSimMission:post-commit',
})

export type FlightSimSystemFailureInjection = Readonly<{
  systemName: FlightSimSystemName
  errorCode?: string
  message?: string
}>

export type FlightSimWorldTickInput = Readonly<{
  controls: FlightSimTickInput
  throttleSetpoint: number | null
  attemptInference: boolean
}>

type EcsContext = {
  read(entityId: number, component: string, field: string): number
  write(entityId: number, component: string, field: string, value: number): void
  emitDecision(decision: FlightSimDecisionRecord): void
  requestReasoning(request: Record<string, unknown>): number
}

type FlightSimSystem = ((
  context: EcsContext,
  input: FlightSimWorldTickInput,
) => void) & { systemName?: string }

function decision(
  runId: number,
  tick: number,
  event: FlightSimDecisionEvent,
  decisionType: FlightSimDecisionRecord['decisionType'],
  payload: Record<string, unknown>,
): FlightSimDecisionRecord {
  const suffix = String(payload.waypointId || payload.colliderId || 'mission')
  return Object.freeze({
    decisionId: flightSimDecisionId(runId, tick, event, suffix),
    decisionType,
    entityRef: event === 'waypoint_reached'
      ? String(payload.waypointId)
      : FLIGHT_SIM_MISSION_ENTITY_REF,
    payload: Object.freeze({ event, missionId: FLIGHT_SIM_MISSION_ID, runId, tick, ...payload }),
    producedAt: flightSimDecisionProducedAt(tick, event),
  })
}

function readAircraft(context: EcsContext, entityId: number): FlightSimAircraftState {
  return freezeFlightSimAircraftState({
    position: [
      context.read(entityId, 'Transform', 'x'),
      context.read(entityId, 'Transform', 'y'),
      context.read(entityId, 'Transform', 'z'),
    ],
    velocity: [
      context.read(entityId, 'Velocity', 'x'),
      context.read(entityId, 'Velocity', 'y'),
      context.read(entityId, 'Velocity', 'z'),
    ],
    pitch: context.read(entityId, 'Attitude', 'pitch'),
    roll: context.read(entityId, 'Attitude', 'roll'),
    yaw: context.read(entityId, 'Attitude', 'yaw'),
    throttle: context.read(entityId, 'FlightControl', 'throttle'),
  })
}

function writeAircraft(context: EcsContext, entityId: number, state: FlightSimAircraftState): void {
  context.write(entityId, 'Transform', 'x', state.position[0])
  context.write(entityId, 'Transform', 'y', state.position[1])
  context.write(entityId, 'Transform', 'z', state.position[2])
  context.write(entityId, 'Velocity', 'x', state.velocity[0])
  context.write(entityId, 'Velocity', 'y', state.velocity[1])
  context.write(entityId, 'Velocity', 'z', state.velocity[2])
  context.write(entityId, 'Attitude', 'pitch', state.pitch)
  context.write(entityId, 'Attitude', 'roll', state.roll)
  context.write(entityId, 'Attitude', 'yaw', state.yaw)
  context.write(entityId, 'FlightControl', 'throttle', state.throttle)
}

function writePreviousAircraft(
  context: EcsContext,
  entityId: number,
  state: FlightSimAircraftState,
): void {
  context.write(entityId, 'PreviousAircraft', 'x', state.position[0])
  context.write(entityId, 'PreviousAircraft', 'y', state.position[1])
  context.write(entityId, 'PreviousAircraft', 'z', state.position[2])
  context.write(entityId, 'PreviousAircraft', 'vx', state.velocity[0])
  context.write(entityId, 'PreviousAircraft', 'vy', state.velocity[1])
  context.write(entityId, 'PreviousAircraft', 'vz', state.velocity[2])
  context.write(entityId, 'PreviousAircraft', 'pitch', state.pitch)
  context.write(entityId, 'PreviousAircraft', 'roll', state.roll)
  context.write(entityId, 'PreviousAircraft', 'yaw', state.yaw)
  context.write(entityId, 'PreviousAircraft', 'throttle', state.throttle)
}

function readPreviousAircraft(context: EcsContext, entityId: number): FlightSimAircraftState {
  return freezeFlightSimAircraftState({
    position: [
      context.read(entityId, 'PreviousAircraft', 'x'),
      context.read(entityId, 'PreviousAircraft', 'y'),
      context.read(entityId, 'PreviousAircraft', 'z'),
    ],
    velocity: [
      context.read(entityId, 'PreviousAircraft', 'vx'),
      context.read(entityId, 'PreviousAircraft', 'vy'),
      context.read(entityId, 'PreviousAircraft', 'vz'),
    ],
    pitch: context.read(entityId, 'PreviousAircraft', 'pitch'),
    roll: context.read(entityId, 'PreviousAircraft', 'roll'),
    yaw: context.read(entityId, 'PreviousAircraft', 'yaw'),
    throttle: context.read(entityId, 'PreviousAircraft', 'throttle'),
  })
}

function emitFlightStateDecision(
  context: EcsContext,
  runId: number,
  tick: number,
  state: FlightSimAircraftState,
  phase: 'flying' | 'completed' | 'crashed',
  waypointIndex: number,
): void {
  context.emitDecision(decision(runId, tick, 'flight_state', 'world_tick_result', {
    position: state.position,
    velocity: state.velocity,
    pitch: state.pitch,
    roll: state.roll,
    yaw: state.yaw,
    throttle: state.throttle,
    waypointIndex,
    phase,
  }))
}

function withStableName(system: FlightSimSystem, systemName: FlightSimSystemName): FlightSimSystem {
  Object.defineProperty(system, 'systemName', { value: systemName })
  return system
}

export function createFlightSimSystems(args: Readonly<{
  runId: number
  profile: FlightSimSpatialProfile
  aircraftEntityId: () => number
  missionEntityId: () => number
  failureInjection?: FlightSimSystemFailureInjection
}>): readonly FlightSimSystem[] {
  const { runId, profile } = args
  const failIfInjected = (systemName: FlightSimSystemName) => {
    if (args.failureInjection?.systemName !== systemName) return
    const error = new Error(
      args.failureInjection.message || `Injected failure in ${systemName}`,
    ) as Error & { code?: string }
    error.name = 'FlightSimInjectedSystemError'
    error.code = args.failureInjection.errorCode || 'FLIGHT_SIM_INJECTED_SYSTEM_FAILURE'
    throw error
  }

  function InputIntegrationSystem(
    context: EcsContext,
    tickInput: FlightSimWorldTickInput,
  ): void {
    const missionEntityId = args.missionEntityId()
    const aircraftEntityId = args.aircraftEntityId()
    const phase = context.read(missionEntityId, 'Mission', 'phase')
    const previousTick = context.read(missionEntityId, 'Mission', 'tick')
    if (phase === FLIGHT_SIM_PHASE_COMPLETED || phase === FLIGHT_SIM_PHASE_CRASHED) {
      if (tickInput.attemptInference) {
        context.requestReasoning({
          decisionId: `flight-sim:blocked-inference:run-${runId}:tick-${previousTick}`,
        })
      }
      return
    }
    if (previousTick >= FLIGHT_SIM_MAX_MISSION_TICKS) {
      const error = new Error('Flight Sim mission exhausted its bounded tick range') as Error & {
        code?: string
      }
      error.code = 'FLIGHT_SIM_TICK_RANGE_EXHAUSTED'
      throw error
    }
    const normalized = normalizeFlightSimInputFrame(tickInput.controls, {
      pitch: context.read(aircraftEntityId, 'InputFrame', 'pitch'),
      roll: context.read(aircraftEntityId, 'InputFrame', 'roll'),
      yaw: context.read(aircraftEntityId, 'InputFrame', 'yaw'),
      throttleDelta: context.read(aircraftEntityId, 'InputFrame', 'throttleDelta'),
    })
    const input = normalized.input
    const tick = previousTick + 1
    context.write(aircraftEntityId, 'InputFrame', 'pitch', input.pitch)
    context.write(aircraftEntityId, 'InputFrame', 'roll', input.roll)
    context.write(aircraftEntityId, 'InputFrame', 'yaw', input.yaw)
    context.write(aircraftEntityId, 'InputFrame', 'throttleDelta', input.throttleDelta)
    context.write(
      aircraftEntityId,
      'InputFrame',
      'throttleSetpoint',
      tickInput.throttleSetpoint ?? 0,
    )
    context.write(
      aircraftEntityId,
      'InputFrame',
      'hasThrottleSetpoint',
      tickInput.throttleSetpoint === null ? 0 : 1,
    )
    context.write(
      aircraftEntityId,
      'InputFrame',
      'outOfRange',
      normalized.outOfRange ? 1 : 0,
    )
    context.write(missionEntityId, 'Mission', 'tick', tick)
    context.write(missionEntityId, 'Mission', 'elapsed', tick * FLIGHT_SIM_FIXED_STEP_SECONDS)
    if (tickInput.attemptInference) {
      context.requestReasoning({
        decisionId: `flight-sim:blocked-inference:run-${runId}:tick-${tick}`,
      })
    }
    failIfInjected('InputIntegrationSystem')
  }

  function FlightModelSystem(context: EcsContext): void {
    const missionEntityId = args.missionEntityId()
    const aircraftEntityId = args.aircraftEntityId()
    const phase = context.read(missionEntityId, 'Mission', 'phase')
    if (phase === FLIGHT_SIM_PHASE_COMPLETED || phase === FLIGHT_SIM_PHASE_CRASHED) return
    if (context.read(missionEntityId, 'Mission', 'tick') === FLIGHT_SIM_MAX_MISSION_TICKS) {
      failIfInjected('FlightModelSystem')
      return
    }
    const captured = readAircraft(context, aircraftEntityId)
    const previous = context.read(aircraftEntityId, 'InputFrame', 'hasThrottleSetpoint') === 0
      ? captured
      : freezeFlightSimAircraftState({
          ...captured,
          throttle: context.read(aircraftEntityId, 'InputFrame', 'throttleSetpoint'),
        })
    writePreviousAircraft(context, aircraftEntityId, previous)
    writeAircraft(context, aircraftEntityId, integrateFlightModel(previous, {
      pitch: context.read(aircraftEntityId, 'InputFrame', 'pitch'),
      roll: context.read(aircraftEntityId, 'InputFrame', 'roll'),
      yaw: context.read(aircraftEntityId, 'InputFrame', 'yaw'),
      throttleDelta: context.read(aircraftEntityId, 'InputFrame', 'throttleDelta'),
    }))
    failIfInjected('FlightModelSystem')
  }

  function CollisionResolverSystem(context: EcsContext): void {
    const missionEntityId = args.missionEntityId()
    const aircraftEntityId = args.aircraftEntityId()
    const phase = context.read(missionEntityId, 'Mission', 'phase')
    if (phase === FLIGHT_SIM_PHASE_COMPLETED || phase === FLIGHT_SIM_PHASE_CRASHED) return
    context.write(aircraftEntityId, 'TickCollision', 'blockerIndex', 0)
    context.write(aircraftEntityId, 'TickCollision', 'impactSpeed', 0)
    if (context.read(missionEntityId, 'Mission', 'tick') !== FLIGHT_SIM_MAX_MISSION_TICKS) {
      const collision = resolveFlightSimAabbMotion(
        readPreviousAircraft(context, aircraftEntityId),
        readAircraft(context, aircraftEntityId),
        profile,
      )
      writeAircraft(context, aircraftEntityId, collision.state)
      if (collision.collisionId) {
        const blockerIndex = profile.blockers.findIndex(
          blocker => blocker.id === collision.collisionId,
        )
        context.write(aircraftEntityId, 'TickCollision', 'blockerIndex', blockerIndex + 1)
        context.write(aircraftEntityId, 'TickCollision', 'impactSpeed', collision.impactSpeed)
      }
    }
    failIfInjected('CollisionResolverSystem')
  }

  function ObjectiveSystem(context: EcsContext): void {
    const missionEntityId = args.missionEntityId()
    const aircraftEntityId = args.aircraftEntityId()
    const phase = context.read(missionEntityId, 'Mission', 'phase')
    if (phase === FLIGHT_SIM_PHASE_COMPLETED || phase === FLIGHT_SIM_PHASE_CRASHED) return
    const tick = context.read(missionEntityId, 'Mission', 'tick')
    const waypointIndex = context.read(missionEntityId, 'Mission', 'waypointIndex')
    const state = readAircraft(context, aircraftEntityId)
    const finish = () => failIfInjected('ObjectiveSystem')
    context.write(missionEntityId, 'Mission', 'phase', FLIGHT_SIM_PHASE_FLYING)

    if (tick === FLIGHT_SIM_MAX_MISSION_TICKS) {
      context.write(missionEntityId, 'Mission', 'phase', FLIGHT_SIM_PHASE_CRASHED)
      context.write(missionEntityId, 'Mission', 'collisionIndex', profile.blockers.length + 1)
      context.emitDecision(decision(runId, tick, 'mission_crashed', 'quest_flag', {
        status: 'crashed',
        colliderId: FLIGHT_SIM_TIMEOUT_COLLIDER_ID,
        impactSpeed: Math.hypot(...state.velocity),
      }))
      emitFlightStateDecision(context, runId, tick, state, 'crashed', waypointIndex)
      finish()
      return
    }

    const blockerIndex = context.read(aircraftEntityId, 'TickCollision', 'blockerIndex')
    if (blockerIndex > 0) {
      const blocker = profile.blockers[blockerIndex - 1]
      context.write(missionEntityId, 'Mission', 'phase', FLIGHT_SIM_PHASE_CRASHED)
      context.write(missionEntityId, 'Mission', 'collisionIndex', blockerIndex)
      context.emitDecision(decision(runId, tick, 'mission_crashed', 'quest_flag', {
        status: 'crashed',
        colliderId: blocker.id,
        impactSpeed: context.read(aircraftEntityId, 'TickCollision', 'impactSpeed'),
      }))
      emitFlightStateDecision(context, runId, tick, state, 'crashed', waypointIndex)
      finish()
      return
    }

    const waypoint = profile.waypoints[waypointIndex]
    if (waypoint && flightSimWaypointReached(state.position, waypoint)) {
      const nextWaypointIndex = waypointIndex + 1
      context.write(missionEntityId, 'Mission', 'waypointIndex', nextWaypointIndex)
      context.emitDecision(decision(runId, tick, 'waypoint_reached', 'world_tick_result', {
        waypointId: waypoint.id,
        waypointIndex,
      }))
      emitFlightStateDecision(context, runId, tick, state, 'flying', nextWaypointIndex)
      finish()
      return
    }
    if (waypoint || !flightSimWaypointReached(state.position, profile.landingPad)) {
      emitFlightStateDecision(context, runId, tick, state, 'flying', waypointIndex)
      finish()
      return
    }
    context.write(missionEntityId, 'Mission', 'phase', FLIGHT_SIM_PHASE_COMPLETED)
    context.emitDecision(decision(runId, tick, 'mission_completed', 'quest_flag', {
      status: 'completed',
      landingPadId: profile.landingPad.id,
    }))
    emitFlightStateDecision(context, runId, tick, state, 'completed', waypointIndex)
    finish()
  }

  return Object.freeze([
    withStableName(InputIntegrationSystem, 'InputIntegrationSystem'),
    withStableName(FlightModelSystem, 'FlightModelSystem'),
    withStableName(CollisionResolverSystem, 'CollisionResolverSystem'),
    withStableName(ObjectiveSystem, 'ObjectiveSystem'),
  ])
}
