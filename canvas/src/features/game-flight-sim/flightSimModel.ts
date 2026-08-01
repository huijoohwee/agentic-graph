import type { SpatialVector } from '@/features/physics/spatialPhysicsTypes'

export const FLIGHT_SIM_MISSION_ID = 'flight-sim-mission-1' as const
export const FLIGHT_SIM_FIXED_STEP_SECONDS = 1 / 60
export const FLIGHT_SIM_MAX_FRAME_SECONDS = 0.25
export const FLIGHT_SIM_MAX_CATCH_UP_TICKS = 5
export const FLIGHT_SIM_MAX_MISSION_TICKS = 60 * 90
export const FLIGHT_SIM_MAX_RUN_ID = Number.MAX_SAFE_INTEGER - 1
export const FLIGHT_SIM_MAX_PERSISTED_RUN_ID = FLIGHT_SIM_MAX_RUN_ID - 1
export const FLIGHT_SIM_MAX_PERSISTED_POSITION_METERS = 1_000_000
export const FLIGHT_SIM_MAX_PERSISTED_SPEED_METERS_PER_SECOND = 64
export const FLIGHT_SIM_ROUTE_WAYPOINT_COUNT = 3
export const FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS = 50
export const FLIGHT_SIM_MAX_CAPTURE_RADIUS_METERS = 200
export const FLIGHT_SIM_COLLISION_SEPARATION_METERS = 0.001
export const FLIGHT_SIM_AIRCRAFT_COLLISION_HALF_SIZE_METERS = Object.freeze([
  6,
  1.7,
  5.5,
] as const) satisfies SpatialVector
export const FLIGHT_SIM_TIMEOUT_COLLIDER_ID = 'flight-sim:mission-timeout'
export const FLIGHT_SIM_AIRCRAFT_ENTITY_REF = 'flight-sim:aircraft'
export const FLIGHT_SIM_MISSION_ENTITY_REF = `flight-sim:mission:${FLIGHT_SIM_MISSION_ID}`
export const FLIGHT_SIM_DECISION_EVENTS = Object.freeze([
  'flight_state',
  'waypoint_reached',
  'mission_completed',
  'mission_crashed',
] as const)
const FLIGHT_SIM_DECISION_EPOCH_MS = Date.UTC(2026, 0, 1)

export type FlightSimDecisionEvent = (typeof FLIGHT_SIM_DECISION_EVENTS)[number]
export type FlightSimPhase = 'stopped' | 'ready' | 'flying' | 'completed' | 'crashed'

export type FlightSimTickInput = Readonly<{
  pitch: number
  roll: number
  yaw: number
  throttleDelta: number
}>

export type FlightSimInputPatch = Partial<FlightSimTickInput>

export type FlightSimAircraftState = Readonly<{
  position: SpatialVector
  velocity: SpatialVector
  pitch: number
  roll: number
  yaw: number
  throttle: number
}>

export type FlightSimWaypoint = Readonly<{
  id: string
  position: SpatialVector
  radiusMeters: number
}>

export type FlightSimBlocker = Readonly<{
  id: string
  center: SpatialVector
  halfSize: SpatialVector
}>

export type FlightSimSpatialProfile = Readonly<{
  id: string
  sourceKey: string
  aircraftHalfSize: SpatialVector
  spawn: FlightSimAircraftState
  blockers: readonly FlightSimBlocker[]
  waypoints: readonly FlightSimWaypoint[]
  landingPad: FlightSimWaypoint
}>

export type FlightSimDecisionRecord = Readonly<{
  decisionId: string
  decisionType: 'dialogue_outcome' | 'quest_flag' | 'world_tick_result'
  entityRef: string
  payload: Readonly<Record<string, unknown>>
  producedAt: string
}>

export function flightSimDecisionId(
  runId: number,
  tick: number,
  event: FlightSimDecisionEvent,
  suffix: string,
): string {
  return `flight-sim:run-${runId}:tick-${tick}:${event}:${suffix}`
}

export function flightSimDecisionProducedAt(
  tick: number,
  event: FlightSimDecisionEvent,
): string {
  const eventRank = event === 'flight_state'
    ? 0
    : event === 'waypoint_reached' ? 1 : event === 'mission_completed' ? 2 : 3
  return new Date(FLIGHT_SIM_DECISION_EPOCH_MS + tick * 20 + eventRank).toISOString()
}

export type FlightSimZeroCostLog = Readonly<{
  model: 'none'
  prompt_tokens: 0
  completion_tokens: 0
  cache_hits: 0
  estimated_cost_usd: 0
  incomplete: false
}>

export type FlightSimBlockedInferenceCostLog = Readonly<{
  model: 'none'
  prompt_tokens: 'unknown'
  completion_tokens: 'unknown'
  cache_hits: 0
  estimated_cost_usd: 0
  incomplete: true
  error: 'blocked_inference'
}>

export type FlightSimCostLog = FlightSimZeroCostLog | FlightSimBlockedInferenceCostLog

export type FlightSimSnapshot = Readonly<{
  active: boolean
  surfaceMode: 'xr'
  webglSupported: boolean
  phase: FlightSimPhase
  runId: number
  aircraft: FlightSimAircraftState
  waypointIndex: number
  waypointCount: number
  currentWaypointId: string | null
  tick: number
  elapsedSeconds: number
  collisionId: string | null
  pendingDecisions: readonly FlightSimDecisionRecord[]
  lastCostLog: FlightSimCostLog
  runtimeError: string | null
  revision: number
}>

export const FLIGHT_SIM_NEUTRAL_INPUT: FlightSimTickInput = Object.freeze({
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttleDelta: 0,
})

export function stageFlightSimInputPatch(
  previous: FlightSimTickInput,
  patch: FlightSimInputPatch,
): FlightSimTickInput {
  const stagedField = (field: keyof FlightSimTickInput): number => {
    const candidate = patch[field]
    return candidate === undefined ? previous[field] : Number(candidate)
  }
  return Object.freeze({
    pitch: stagedField('pitch'),
    roll: stagedField('roll'),
    yaw: stagedField('yaw'),
    throttleDelta: stagedField('throttleDelta'),
  })
}

export type FlightSimInputNormalizationResult = Readonly<{
  input: FlightSimTickInput
  outOfRange: boolean
  retainedLastValid: boolean
}>

export function normalizeFlightSimInputFrame(
  value: FlightSimInputPatch | null | undefined,
  lastValid: FlightSimTickInput = FLIGHT_SIM_NEUTRAL_INPUT,
): FlightSimInputNormalizationResult {
  const retained = normalizeFlightSimInput(lastValid)
  let outOfRange = false
  let retainedLastValid = false
  const axis = (candidateValue: unknown, fallback: number): number => {
    const candidate = Number(candidateValue ?? 0)
    if (Number.isNaN(candidate)) {
      outOfRange = true
      retainedLastValid = true
      return fallback
    }
    if (candidate === Number.POSITIVE_INFINITY || candidate === Number.NEGATIVE_INFINITY) {
      outOfRange = true
      return Math.sign(candidate)
    }
    if (candidate < -1 || candidate > 1) outOfRange = true
    return Math.max(-1, Math.min(1, candidate))
  }
  return Object.freeze({
    input: Object.freeze({
      pitch: axis(value?.pitch, retained.pitch),
      roll: axis(value?.roll, retained.roll),
      yaw: axis(value?.yaw, retained.yaw),
      throttleDelta: axis(value?.throttleDelta, retained.throttleDelta),
    }),
    outOfRange,
    retainedLastValid,
  })
}

export const FLIGHT_SIM_ZERO_COST_LOG: FlightSimCostLog = Object.freeze({
  model: 'none',
  prompt_tokens: 0,
  completion_tokens: 0,
  cache_hits: 0,
  estimated_cost_usd: 0,
  incomplete: false,
})

export const FLIGHT_SIM_BLOCKED_INFERENCE_COST_LOG: FlightSimCostLog = Object.freeze({
  model: 'none',
  prompt_tokens: 'unknown',
  completion_tokens: 'unknown',
  cache_hits: 0,
  estimated_cost_usd: 0,
  incomplete: true,
  error: 'blocked_inference',
})

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort()
  const canonical = [...expected].sort()
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    throw new Error(`${label} must contain exactly ${canonical.join(', ')}`)
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty trimmed string`)
  }
  return value
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  const numeric = Number(value)
  if (!Number.isSafeInteger(numeric) || numeric < minimum || numeric > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`)
  }
  return numeric
}

function finiteNumber(value: unknown, label: string): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) throw new Error(`${label} must be finite`)
  return numeric
}

function decisionVector(value: unknown, label: string, maximumAbsolute: number): SpatialVector {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must contain three numbers`)
  return Object.freeze(value.map((item, index) => {
    const numeric = finiteNumber(item, `${label}[${index}]`)
    if (Math.abs(numeric) > maximumAbsolute) {
      throw new Error(`${label}[${index}] exceeds its bounded runtime range`)
    }
    return numeric
  })) as SpatialVector
}

function canonicalDialogueValue(value: unknown, label: string): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
    return Object.is(value, -0) ? 0 : value
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) throw new Error(`${label} must not be sparse`)
    }
    return Object.freeze(value.map((item, index) => canonicalDialogueValue(item, `${label}[${index}]`)))
  }
  const source = record(value, label)
  const prototype = Object.getPrototypeOf(source)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain object`)
  }
  const canonical: Record<string, unknown> = {}
  for (const key of Object.keys(source).sort()) {
    canonical[key] = canonicalDialogueValue(source[key], `${label}.${key}`)
  }
  return Object.freeze(canonical)
}

export function clampFlightSimUnit(value: unknown, label = 'Flight Sim input'): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) throw new Error(`${label} must be finite`)
  return Math.max(-1, Math.min(1, numeric))
}

export function normalizeFlightSimInput(value: FlightSimInputPatch | null | undefined): FlightSimTickInput {
  return Object.freeze({
    pitch: clampFlightSimUnit(value?.pitch ?? 0, 'Flight Sim pitch'),
    roll: clampFlightSimUnit(value?.roll ?? 0, 'Flight Sim roll'),
    yaw: clampFlightSimUnit(value?.yaw ?? 0, 'Flight Sim yaw'),
    throttleDelta: clampFlightSimUnit(value?.throttleDelta ?? 0, 'Flight Sim throttle delta'),
  })
}

export function isFlightSimInputNeutral(input: FlightSimTickInput): boolean {
  return input.pitch === 0 && input.roll === 0 && input.yaw === 0 && input.throttleDelta === 0
}

export function freezeFlightSimAircraftState(value: FlightSimAircraftState): FlightSimAircraftState {
  return Object.freeze({
    ...value,
    position: Object.freeze([...value.position]) as SpatialVector,
    velocity: Object.freeze([...value.velocity]) as SpatialVector,
  })
}

/**
 * Flight's ECS stores component scalars as Float32. Canonicalizing a preview
 * snapshot through the same representation lets a stopped surface show the
 * exact tick-zero state that a newly created mission will expose.
 */
export function canonicalizeFlightSimEcsAircraftState(
  value: FlightSimAircraftState,
): FlightSimAircraftState {
  return freezeFlightSimAircraftState({
    ...value,
    pitch: Math.fround(value.pitch),
    position: Object.freeze(
      value.position.map(component => Math.fround(component)),
    ) as SpatialVector,
    roll: Math.fround(value.roll),
    throttle: Math.fround(value.throttle),
    velocity: Object.freeze(
      value.velocity.map(component => Math.fround(component)),
    ) as SpatialVector,
    yaw: Math.fround(value.yaw),
  })
}

function validateDecision(value: unknown): FlightSimDecisionRecord {
  const decision = record(value, 'Flight Sim Decision')
  exactKeys(decision, ['decisionId', 'decisionType', 'entityRef', 'payload', 'producedAt'], 'Flight Sim Decision')
  const decisionId = requiredString(decision.decisionId, 'Flight Sim Decision decisionId')
  const entityRef = requiredString(decision.entityRef, 'Flight Sim Decision entityRef')
  const producedAt = requiredString(decision.producedAt, 'Flight Sim Decision producedAt')
  if (Number.isNaN(Date.parse(producedAt))) throw new Error('Flight Sim Decision producedAt must be an ISO timestamp')
  const payload = record(decision.payload, 'Flight Sim Decision payload')
  if (decision.decisionType === 'dialogue_outcome') {
    return Object.freeze({
      decisionId,
      decisionType: 'dialogue_outcome',
      entityRef,
      payload: canonicalDialogueValue(payload, 'Flight Sim dialogue_outcome payload') as Readonly<Record<string, unknown>>,
      producedAt,
    })
  }
  const event = requiredString(payload.event, 'Flight Sim Decision event') as FlightSimDecisionEvent
  if (!FLIGHT_SIM_DECISION_EVENTS.includes(event)) throw new Error(`Unsupported Flight Sim Decision event: ${event}`)
  const eventPayloadKeys = event === 'flight_state'
    ? ['event', 'missionId', 'runId', 'tick', 'position', 'velocity', 'pitch', 'roll', 'yaw', 'throttle', 'waypointIndex', 'phase']
    : event === 'waypoint_reached'
      ? ['event', 'missionId', 'runId', 'tick', 'waypointId', 'waypointIndex']
      : event === 'mission_crashed'
        ? ['event', 'missionId', 'runId', 'tick', 'status', 'colliderId', 'impactSpeed']
        : ['event', 'missionId', 'runId', 'tick', 'status', 'landingPadId']
  exactKeys(payload, eventPayloadKeys, `Flight Sim Decision ${event} payload`)
  if (payload.missionId !== FLIGHT_SIM_MISSION_ID) throw new Error('Flight Sim Decision missionId is invalid')
  boundedInteger(payload.runId, 'Flight Sim Decision runId', 1, FLIGHT_SIM_MAX_PERSISTED_RUN_ID)
  const decisionTick = boundedInteger(payload.tick, 'Flight Sim Decision tick', 0, FLIGHT_SIM_MAX_MISSION_TICKS)

  const expectedType = event === 'flight_state' || event === 'waypoint_reached'
    ? 'world_tick_result'
    : 'quest_flag'
  if (decision.decisionType !== expectedType) {
    throw new Error(`Flight Sim Decision ${event} must use ${expectedType}`)
  }
  if (event === 'flight_state') {
    if (entityRef !== FLIGHT_SIM_MISSION_ENTITY_REF) {
      throw new Error('Flight Sim flight_state entityRef is invalid')
    }
    decisionVector(
      payload.position,
      'Flight Sim Decision position',
      FLIGHT_SIM_MAX_PERSISTED_POSITION_METERS,
    )
    const velocity = decisionVector(
      payload.velocity,
      'Flight Sim Decision velocity',
      FLIGHT_SIM_MAX_PERSISTED_SPEED_METERS_PER_SECOND,
    )
    if (Math.hypot(...velocity) > FLIGHT_SIM_MAX_PERSISTED_SPEED_METERS_PER_SECOND) {
      throw new Error('Flight Sim Decision velocity exceeds its bounded runtime range')
    }
    for (const [key, value] of [
      ['pitch', payload.pitch],
      ['roll', payload.roll],
      ['yaw', payload.yaw],
    ] as const) {
      if (Math.abs(finiteNumber(value, `Flight Sim Decision ${key}`)) > Math.PI) {
        throw new Error(`Flight Sim Decision ${key} exceeds its bounded runtime range`)
      }
    }
    const throttle = finiteNumber(payload.throttle, 'Flight Sim Decision throttle')
    if (throttle < 0 || throttle > 1) throw new Error('Flight Sim Decision throttle must be from 0 to 1')
    boundedInteger(payload.waypointIndex, 'Flight Sim Decision waypointIndex', 0, 255)
    const phase = String(payload.phase)
    if (!['flying', 'completed', 'crashed'].includes(phase)) {
      throw new Error('Flight Sim Decision flight_state phase is invalid')
    }
    if (phase === 'flying' && decisionTick === FLIGHT_SIM_MAX_MISSION_TICKS) {
      throw new Error('Flight Sim Decision cannot remain flying at the terminal tick')
    }
  } else if (event === 'waypoint_reached') {
    const waypointId = requiredString(payload.waypointId, 'Flight Sim Decision waypointId')
    if (entityRef !== waypointId) throw new Error('Flight Sim waypoint_reached entityRef is invalid')
    boundedInteger(payload.waypointIndex, 'Flight Sim Decision waypointIndex', 0, 255)
  } else {
    if (entityRef !== FLIGHT_SIM_MISSION_ENTITY_REF) {
      throw new Error(`Flight Sim Decision ${event} entityRef is invalid`)
    }
    if (payload.status !== (event === 'mission_completed' ? 'completed' : 'crashed')) {
      throw new Error(`Flight Sim Decision ${event} has an invalid status`)
    }
  }
  if (event === 'mission_completed') {
    requiredString(payload.landingPadId, 'Flight Sim Decision landingPadId')
  }
  if (event === 'mission_crashed') {
    requiredString(payload.colliderId, 'Flight Sim Decision colliderId')
    if (finiteNumber(payload.impactSpeed, 'Flight Sim Decision impactSpeed') < 0) {
      throw new Error('Flight Sim Decision impactSpeed must be non-negative')
    }
  }
  const suffix = event === 'waypoint_reached'
    ? String(payload.waypointId)
    : event === 'mission_crashed' ? String(payload.colliderId) : 'mission'
  const runId = Number(payload.runId)
  if (decisionId !== flightSimDecisionId(runId, decisionTick, event, suffix)) {
    throw new Error('Flight Sim Decision decisionId is not canonical')
  }
  if (producedAt !== flightSimDecisionProducedAt(decisionTick, event)) {
    throw new Error('Flight Sim Decision producedAt is not canonical')
  }

  return Object.freeze({
    decisionId,
    decisionType: decision.decisionType as FlightSimDecisionRecord['decisionType'],
    entityRef,
    payload: Object.freeze({ ...payload }),
    producedAt,
  })
}

export function validateFlightSimDecisions(values: readonly unknown[]): readonly FlightSimDecisionRecord[] {
  if (!Array.isArray(values)) throw new Error('Flight Sim Decisions must be an array')
  const decisions = values.map(validateDecision)
  const ids = new Set<string>()
  for (const decision of decisions) {
    if (ids.has(decision.decisionId)) throw new Error(`Duplicate Flight Sim Decision: ${decision.decisionId}`)
    ids.add(decision.decisionId)
  }
  return Object.freeze(decisions)
}
