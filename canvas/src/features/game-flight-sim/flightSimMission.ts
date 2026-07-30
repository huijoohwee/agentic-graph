import { allocateEntity, createWorld, registerComponent, worldTick } from '../../../../ecs/index.js'
import { disposeWorld, snapshotWorld } from '../../../../ecs/world.js'
import { validateCostLog as validateCanonicalCostLog } from '../../../../contracts/cost-log.schema.js'
import {
  FLIGHT_SIM_AIRCRAFT_ENTITY_REF,
  FLIGHT_SIM_BLOCKED_INFERENCE_COST_LOG,
  FLIGHT_SIM_FIXED_STEP_SECONDS,
  FLIGHT_SIM_MAX_CAPTURE_RADIUS_METERS,
  FLIGHT_SIM_MAX_RUN_ID,
  FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
  FLIGHT_SIM_MISSION_ENTITY_REF,
  FLIGHT_SIM_ROUTE_WAYPOINT_COUNT,
  FLIGHT_SIM_TIMEOUT_COLLIDER_ID,
  FLIGHT_SIM_ZERO_COST_LOG,
  freezeFlightSimAircraftState,
  normalizeFlightSimInputFrame,
  type FlightSimAircraftState,
  type FlightSimCostLog,
  type FlightSimDecisionRecord,
  type FlightSimPhase,
  type FlightSimSpatialProfile,
  type FlightSimTickInput,
} from './flightSimModel'
import { validateFlightSimMissionDecisions } from './flightSimDecisionAdmission'
import {
  createFlightSimSystems,
  FLIGHT_SIM_PHASE_COMPLETED as PHASE_COMPLETED,
  FLIGHT_SIM_PHASE_CRASHED as PHASE_CRASHED,
  FLIGHT_SIM_PHASE_FLYING as PHASE_FLYING,
  FLIGHT_SIM_PHASE_READY as PHASE_READY,
  type FlightSimSystemFailureInjection,
} from './flightSimSystems'

type RuntimeEntity = Readonly<{
  entityRef: string
  components: Record<string, Record<string, number>>
}>

export type FlightSimMissionCapture = Readonly<{
  phase: Exclude<FlightSimPhase, 'stopped'>
  aircraft: FlightSimAircraftState
  waypointIndex: number
  waypointCount: number
  currentWaypointId: string | null
  tick: number
  elapsedSeconds: number
  collisionId: string | null
}>

export type FlightSimMissionTickResult = Readonly<{
  capture: FlightSimMissionCapture
  decisions: readonly FlightSimDecisionRecord[]
  costLog: FlightSimCostLog
}>

export type FlightSimMission = Readonly<{
  world: object
  runId: number
  seed: string
  aircraftEntityId: number
  missionEntityId: number
  profile: FlightSimSpatialProfile
}>

type FlightSimInferenceExecutor = (...args: readonly unknown[]) => unknown
const inferenceExecutorByMission = new WeakMap<FlightSimMission, FlightSimInferenceExecutor>()

type FlightSimReplayState = Readonly<{
  aircraft: FlightSimAircraftState
  waypointIndex: number
  tick: number
  phase: number
  collisionIndex: number
}>

export type FlightSimMissionTickOptions = Readonly<{
  attemptInference?: boolean
}>

export class FlightSimWorldTickError extends Error {
  readonly code = 'FLIGHT_SIM_WORLD_TICK_FAILED'
  readonly ecsErrorCode: string
  readonly failingSystemIndex: number | null
  readonly failingSystemName: string | null
  readonly systemCause: string

  constructor(result: Readonly<Record<string, unknown>>) {
    const ecsErrorCode = String(result.errorCode || 'ECS_TICK_FAILED')
    const systemName = typeof result.failingSystemName === 'string'
      ? result.failingSystemName
      : null
    const systemCause = String(result.failingSystemCause || result.message || 'unknown ECS failure')
    super(`Flight Sim World_Tick failed: ${ecsErrorCode}: ${systemCause}`)
    this.name = 'FlightSimWorldTickError'
    this.ecsErrorCode = ecsErrorCode
    this.failingSystemIndex = Number.isSafeInteger(result.failingSystemIndex)
      ? Number(result.failingSystemIndex)
      : null
    this.failingSystemName = systemName
    this.systemCause = systemCause
  }
}

function boundedRunId(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > FLIGHT_SIM_MAX_RUN_ID) {
    throw new Error('Flight Sim runId must be a bounded positive safe integer')
  }
  return value
}

function phaseName(code: number): Exclude<FlightSimPhase, 'stopped'> {
  if (code === PHASE_COMPLETED) return 'completed'
  if (code === PHASE_CRASHED) return 'crashed'
  if (code === PHASE_FLYING) return 'flying'
  return 'ready'
}

function phaseCode(phase: Exclude<FlightSimPhase, 'stopped'>): number {
  if (phase === 'completed') return PHASE_COMPLETED
  if (phase === 'crashed') return PHASE_CRASHED
  if (phase === 'flying') return PHASE_FLYING
  return PHASE_READY
}

function payloadNumber(payload: Record<string, unknown>, key: string): number {
  return Number(payload[key])
}

function payloadVector(payload: Record<string, unknown>, key: string): readonly [number, number, number] {
  const value = payload[key] as readonly number[]
  return [Number(value[0]), Number(value[1]), Number(value[2])]
}

function replayFlightSimDecisions(
  profile: FlightSimSpatialProfile,
  values: readonly unknown[],
): FlightSimReplayState {
  const decisions = [...validateFlightSimMissionDecisions(profile, values)].sort((left, right) => {
    const leftRun = Number(left.payload.runId)
    const rightRun = Number(right.payload.runId)
    const runDelta = leftRun - rightRun
    const tickDelta = Number(left.payload.tick) - Number(right.payload.tick)
    return runDelta || tickDelta || left.decisionId.localeCompare(right.decisionId)
  })
  let state: FlightSimReplayState = {
    aircraft: profile.spawn,
    waypointIndex: 0,
    tick: 0,
    phase: PHASE_READY,
    collisionIndex: 0,
  }
  let activeRunId = 0
  for (const item of decisions) {
    const runId = Number(item.payload.runId)
    if (runId !== activeRunId) {
      activeRunId = runId
      state = {
        aircraft: profile.spawn,
        waypointIndex: 0,
        tick: 0,
        phase: PHASE_READY,
        collisionIndex: 0,
      }
    }
    const event = item.payload.event
    const tick = Number(item.payload.tick)
    if (event === 'flight_state') {
      const phase = item.payload.phase === 'completed'
        ? PHASE_COMPLETED
        : item.payload.phase === 'crashed'
          ? PHASE_CRASHED
          : PHASE_FLYING
      state = {
        ...state,
        aircraft: freezeFlightSimAircraftState({
          position: payloadVector(item.payload, 'position'),
          velocity: payloadVector(item.payload, 'velocity'),
          pitch: payloadNumber(item.payload, 'pitch'),
          roll: payloadNumber(item.payload, 'roll'),
          yaw: payloadNumber(item.payload, 'yaw'),
          throttle: payloadNumber(item.payload, 'throttle'),
        }),
        waypointIndex: payloadNumber(item.payload, 'waypointIndex'),
        tick,
        phase,
      }
    } else if (event === 'waypoint_reached') {
      state = {
        ...state,
        waypointIndex: Math.max(state.waypointIndex, payloadNumber(item.payload, 'waypointIndex') + 1),
        tick: Math.max(state.tick, tick),
      }
    } else if (event === 'mission_completed') {
      state = { ...state, phase: PHASE_COMPLETED, tick: Math.max(state.tick, tick) }
    } else if (event === 'mission_crashed') {
      const colliderId = String(item.payload.colliderId)
      state = {
        ...state,
        phase: PHASE_CRASHED,
        tick: Math.max(state.tick, tick),
        collisionIndex: colliderId === FLIGHT_SIM_TIMEOUT_COLLIDER_ID
          ? profile.blockers.length + 1
          : profile.blockers.findIndex(blocker => blocker.id === colliderId) + 1,
      }
    }
  }
  return Object.freeze(state)
}

function currentObjectiveId(
  profile: FlightSimSpatialProfile,
  waypointIndex: number,
): string | null {
  return profile.waypoints[waypointIndex]?.id
    || (waypointIndex === profile.waypoints.length ? profile.landingPad.id : null)
}

function replayFlightSimCapture(
  profile: FlightSimSpatialProfile,
  capture: FlightSimMissionCapture,
): FlightSimReplayState {
  if (capture.waypointCount !== profile.waypoints.length) {
    throw new Error('Flight Sim capture waypoint count does not match its spatial profile')
  }
  if (!Number.isSafeInteger(capture.waypointIndex)
    || capture.waypointIndex < 0
    || capture.waypointIndex > profile.waypoints.length) {
    throw new Error('Flight Sim capture waypoint progress exceeds its spatial profile')
  }
  if (capture.currentWaypointId !== currentObjectiveId(profile, capture.waypointIndex)) {
    throw new Error('Flight Sim capture objective identity does not match its spatial profile')
  }
  return Object.freeze({
    aircraft: capture.aircraft,
    waypointIndex: capture.waypointIndex,
    tick: capture.tick,
    phase: phaseCode(capture.phase),
    collisionIndex: capture.collisionId === FLIGHT_SIM_TIMEOUT_COLLIDER_ID
      ? profile.blockers.length + 1
      : capture.collisionId
        ? profile.blockers.findIndex(blocker => blocker.id === capture.collisionId) + 1
        : 0,
  })
}

function validateMissionObjective(profile: FlightSimSpatialProfile): void {
  if (profile.waypoints.length !== FLIGHT_SIM_ROUTE_WAYPOINT_COUNT) {
    throw new Error(`Flight Sim profile must contain exactly ${FLIGHT_SIM_ROUTE_WAYPOINT_COUNT} ordered waypoints`)
  }
  const objectivePoints = [...profile.waypoints, profile.landingPad]
  const ids = new Set<string>()
  for (const point of objectivePoints) {
    if (!point.id || ids.has(point.id)) {
      throw new Error('Flight Sim objective points must use unique non-empty identities')
    }
    ids.add(point.id)
    if (!Number.isFinite(point.radiusMeters)
      || point.radiusMeters < FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS
      || point.radiusMeters > FLIGHT_SIM_MAX_CAPTURE_RADIUS_METERS) {
      throw new Error(
        `Flight Sim objective capture radii must be from ${FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS} to ${FLIGHT_SIM_MAX_CAPTURE_RADIUS_METERS} meters`,
      )
    }
  }
}

function missionSeed(value: string | undefined, profile: FlightSimSpatialProfile): string {
  const seed = value ?? profile.sourceKey
  if (!seed || seed.trim() !== seed) {
    throw new Error('Flight Sim mission seed must be a non-empty trimmed string')
  }
  return seed
}

export function createFlightSimMission(args: {
  runId: number
  profile: FlightSimSpatialProfile
  seed?: string
  decisions?: readonly unknown[]
  initialCapture?: FlightSimMissionCapture
  initialInputFrame?: FlightSimTickInput
  failureInjection?: FlightSimSystemFailureInjection
  inferenceExecutor?: FlightSimInferenceExecutor
}): FlightSimMission {
  const runId = boundedRunId(args.runId)
  const profile = args.profile
  const seed = missionSeed(args.seed, profile)
  validateMissionObjective(profile)
  if (args.initialCapture && args.decisions) {
    throw new Error('Flight Sim mission accepts Decisions or an internal capture, not both')
  }
  const replay = args.initialCapture
    ? replayFlightSimCapture(profile, args.initialCapture)
    : replayFlightSimDecisions(profile, args.decisions || [])
  const initialInputFrame = normalizeFlightSimInputFrame(args.initialInputFrame).input
  let aircraftEntityId = -1
  let missionEntityId = -1
  const systems = createFlightSimSystems({
    runId,
    profile,
    aircraftEntityId: () => aircraftEntityId,
    missionEntityId: () => missionEntityId,
    failureInjection: args.failureInjection,
  })
  const world = createWorld({
    systems,
    decisionExecutor: args.inferenceExecutor,
    reasoningPolicy: 'forbid',
  })
  registerComponent(world, 'Transform', { x: 'f32', y: 'f32', z: 'f32' })
  registerComponent(world, 'Velocity', { x: 'f32', y: 'f32', z: 'f32' })
  registerComponent(world, 'Attitude', { pitch: 'f32', roll: 'f32', yaw: 'f32' })
  registerComponent(world, 'FlightControl', { throttle: 'f32' })
  registerComponent(world, 'InputFrame', {
    pitch: 'f32',
    roll: 'f32',
    yaw: 'f32',
    throttleDelta: 'f32',
    throttleSetpoint: 'f32',
    hasThrottleSetpoint: 'u8',
    outOfRange: 'u8',
  })
  registerComponent(world, 'PreviousAircraft', {
    x: 'f32',
    y: 'f32',
    z: 'f32',
    vx: 'f32',
    vy: 'f32',
    vz: 'f32',
    pitch: 'f32',
    roll: 'f32',
    yaw: 'f32',
    throttle: 'f32',
  })
  registerComponent(world, 'TickCollision', {
    blockerIndex: 'u16',
    impactSpeed: 'f64',
  })
  registerComponent(world, 'Aircraft', { active: 'u8' })
  registerComponent(world, 'Mission', {
    phase: 'u8',
    tick: 'u32',
    elapsed: 'f64',
    waypointIndex: 'u8',
    collisionIndex: 'u16',
  })
  aircraftEntityId = allocateEntity(world, {
    entityRef: FLIGHT_SIM_AIRCRAFT_ENTITY_REF,
    components: {
      Transform: {
        x: replay.aircraft.position[0],
        y: replay.aircraft.position[1],
        z: replay.aircraft.position[2],
      },
      Velocity: {
        x: replay.aircraft.velocity[0],
        y: replay.aircraft.velocity[1],
        z: replay.aircraft.velocity[2],
      },
      Attitude: {
        pitch: replay.aircraft.pitch,
        roll: replay.aircraft.roll,
        yaw: replay.aircraft.yaw,
      },
      FlightControl: { throttle: replay.aircraft.throttle },
      InputFrame: {
        pitch: initialInputFrame.pitch,
        roll: initialInputFrame.roll,
        yaw: initialInputFrame.yaw,
        throttleDelta: initialInputFrame.throttleDelta,
        throttleSetpoint: 0,
        hasThrottleSetpoint: 0,
        outOfRange: 0,
      },
      PreviousAircraft: {
        x: replay.aircraft.position[0],
        y: replay.aircraft.position[1],
        z: replay.aircraft.position[2],
        vx: replay.aircraft.velocity[0],
        vy: replay.aircraft.velocity[1],
        vz: replay.aircraft.velocity[2],
        pitch: replay.aircraft.pitch,
        roll: replay.aircraft.roll,
        yaw: replay.aircraft.yaw,
        throttle: replay.aircraft.throttle,
      },
      TickCollision: {
        blockerIndex: 0,
        impactSpeed: 0,
      },
      Aircraft: { active: 1 },
    },
  })
  missionEntityId = allocateEntity(world, {
    entityRef: FLIGHT_SIM_MISSION_ENTITY_REF,
    components: {
      Mission: {
        phase: replay.phase,
        tick: replay.tick,
        elapsed: replay.tick * FLIGHT_SIM_FIXED_STEP_SECONDS,
        waypointIndex: replay.waypointIndex,
        collisionIndex: replay.collisionIndex,
      },
    },
  })
  const mission = Object.freeze({
    world,
    runId,
    seed,
    aircraftEntityId,
    missionEntityId,
    profile,
  })
  if (args.inferenceExecutor) inferenceExecutorByMission.set(mission, args.inferenceExecutor)
  return mission
}

export function cloneFlightSimMission(mission: FlightSimMission): FlightSimMission {
  const state = captureFlightSimMissionState(mission)
  return createFlightSimMission({
    runId: mission.runId,
    profile: mission.profile,
    seed: mission.seed,
    initialCapture: state.capture,
    initialInputFrame: state.inputFrame,
    inferenceExecutor: inferenceExecutorByMission.get(mission),
  })
}

export function disposeFlightSimMission(mission: FlightSimMission): boolean {
  inferenceExecutorByMission.delete(mission)
  return disposeWorld(mission.world)
}

function component(entity: RuntimeEntity, name: string): Record<string, number> {
  const value = entity.components[name]
  if (!value) throw new Error(`Flight Sim entity ${entity.entityRef} is missing ${name}`)
  return value
}

function captureFlightSimMissionState(mission: FlightSimMission): Readonly<{
  capture: FlightSimMissionCapture
  inputFrame: FlightSimTickInput
}> {
  const snapshot = snapshotWorld(mission.world) as { entities: RuntimeEntity[] }
  const byRef = new Map(snapshot.entities.map(entity => [entity.entityRef, entity]))
  const aircraftEntity = byRef.get(FLIGHT_SIM_AIRCRAFT_ENTITY_REF)!
  const missionEntity = byRef.get(FLIGHT_SIM_MISSION_ENTITY_REF)!
  const transform = component(aircraftEntity, 'Transform')
  const velocity = component(aircraftEntity, 'Velocity')
  const attitude = component(aircraftEntity, 'Attitude')
  const control = component(aircraftEntity, 'FlightControl')
  const input = component(aircraftEntity, 'InputFrame')
  const state = component(missionEntity, 'Mission')
  const waypointIndex = state.waypointIndex
  const collisionIndex = state.collisionIndex - 1
  return Object.freeze({
    capture: Object.freeze({
      phase: phaseName(state.phase),
      aircraft: freezeFlightSimAircraftState({
        position: [transform.x, transform.y, transform.z],
        velocity: [velocity.x, velocity.y, velocity.z],
        pitch: attitude.pitch,
        roll: attitude.roll,
        yaw: attitude.yaw,
        throttle: control.throttle,
      }),
      waypointIndex,
      waypointCount: mission.profile.waypoints.length,
      currentWaypointId: currentObjectiveId(mission.profile, waypointIndex),
      tick: state.tick,
      elapsedSeconds: state.elapsed,
      collisionId: collisionIndex === mission.profile.blockers.length
        ? FLIGHT_SIM_TIMEOUT_COLLIDER_ID
        : collisionIndex >= 0 ? mission.profile.blockers[collisionIndex]?.id || null : null,
    }),
    inputFrame: Object.freeze({
      pitch: input.pitch,
      roll: input.roll,
      yaw: input.yaw,
      throttleDelta: input.throttleDelta,
    }),
  })
}

export function captureFlightSimMission(mission: FlightSimMission): FlightSimMissionCapture {
  return captureFlightSimMissionState(mission).capture
}

function validateFlightSimCostLog(value: unknown, blockedInference: boolean): FlightSimCostLog {
  const cost = value as Record<string, unknown>
  const validation = validateCanonicalCostLog(value)
  if (!validation.valid || !cost || cost.model !== 'none'
    || cost.cache_hits !== 0
    || cost.estimated_cost_usd !== 0) {
    throw new Error('Flight Sim World_Tick produced an invalid canonical Cost_Log')
  }
  if (blockedInference) {
    if (cost.prompt_tokens !== 'unknown'
      || cost.completion_tokens !== 'unknown'
      || cost.incomplete !== true
      || cost.error !== 'blocked_inference') {
      throw new Error('Flight Sim blocked inference must produce one incomplete Cost_Log')
    }
    return FLIGHT_SIM_BLOCKED_INFERENCE_COST_LOG
  }
  if (cost.prompt_tokens !== 0
    || cost.completion_tokens !== 0
    || cost.incomplete !== false
    || Object.hasOwn(cost, 'error')) {
    throw new Error('Flight Sim World_Tick must produce exactly one canonical zero Cost_Log')
  }
  return FLIGHT_SIM_ZERO_COST_LOG
}

export async function tickFlightSimMission(
  mission: FlightSimMission,
  input: FlightSimTickInput,
  throttleSetpoint: number | null = null,
  options: FlightSimMissionTickOptions = {},
): Promise<FlightSimMissionTickResult> {
  if (throttleSetpoint !== null
    && (!Number.isFinite(throttleSetpoint) || throttleSetpoint < 0 || throttleSetpoint > 1)) {
    throw new Error('Flight Sim throttle setpoint must be a finite number from 0 to 1')
  }
  const blockedInference = options.attemptInference === true
  const tickMission = blockedInference ? cloneFlightSimMission(mission) : mission
  try {
    const result = await worldTick(tickMission.world, Object.freeze({
      controls: input,
      throttleSetpoint,
      attemptInference: blockedInference,
    }))
    if (!result.ok) throw new FlightSimWorldTickError(result)
    const expectedDeferredCount = blockedInference ? 1 : 0
    if (result.deferred_decisions.length !== expectedDeferredCount || result.cost_logs.length !== 1) {
      throw new Error('Flight Sim World_Tick must remain deterministic and reasoning-free')
    }
    if (blockedInference
      && result.deferred_decisions[0]?.deferred_reason !== 'inference_blocked') {
      throw new Error('Flight Sim inference guard did not block the reasoning request')
    }
    return Object.freeze({
      capture: captureFlightSimMission(blockedInference ? mission : tickMission),
      decisions: blockedInference
        ? Object.freeze([])
        : Object.freeze(result.decisions.map((item: FlightSimDecisionRecord) => Object.freeze({
            ...item,
            payload: Object.freeze({ ...item.payload }),
          }))),
      costLog: validateFlightSimCostLog(result.cost_logs[0], blockedInference),
    })
  } finally {
    if (blockedInference) disposeFlightSimMission(tickMission)
  }
}
