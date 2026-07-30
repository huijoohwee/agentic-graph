import { stableStringifyJson } from '../../../../ecs/kgcNodeContract.js'
import {
  captureFlightSimMission,
  cloneFlightSimMission,
  createFlightSimMission,
  disposeFlightSimMission,
  tickFlightSimMission,
  type FlightSimMission,
  type FlightSimMissionCapture,
} from './flightSimMission'
import {
  normalizeFlightSimInput,
  type FlightSimSpatialProfile,
  type FlightSimTickInput,
} from './flightSimModel'

export type FlightSimReplayInput = Readonly<{
  tickIndex: number
  controls: FlightSimTickInput
  throttleSetpoint: number | null
}>

export type FlightSimReplayFrame = Readonly<{
  input: FlightSimReplayInput
  canonicalCapture: string
}>

export type FlightSimReplayTrace = Readonly<{
  schema: 'flight-sim-replay/v1'
  sourceKey: string
  seed: string
  frames: readonly FlightSimReplayFrame[]
}>

export type FlightSimReplayError = Readonly<{
  code: 'FLIGHT_SIM_INVALID_REPLAY_INPUTS'
    | 'FLIGHT_SIM_REPLAY_DIVERGENCE'
    | 'FLIGHT_SIM_REPLAY_TICK_FAILED'
  reason: string
  tickIndex: number | null
  lastMatchingTick: number
  expectedCapture?: string
  actualCapture?: string
}>

export type FlightSimReplayResult = Readonly<{
  ok: boolean
  mission: FlightSimMission
  capture: FlightSimMissionCapture
  error: FlightSimReplayError | null
}>

function canonicalInput(input: FlightSimReplayInput): FlightSimReplayInput {
  if (!Number.isSafeInteger(input.tickIndex) || input.tickIndex < 1) {
    throw new Error('Flight Sim replay tickIndex must be a positive safe integer')
  }
  if (input.throttleSetpoint !== null
    && (!Number.isFinite(input.throttleSetpoint)
      || input.throttleSetpoint < 0
      || input.throttleSetpoint > 1)) {
    throw new Error('Flight Sim replay throttle setpoint must be from 0 to 1')
  }
  return Object.freeze({
    tickIndex: input.tickIndex,
    controls: normalizeFlightSimInput(input.controls),
    throttleSetpoint: input.throttleSetpoint,
  })
}

function validateOrderedInputs(inputs: readonly FlightSimReplayInput[]): readonly FlightSimReplayInput[] {
  return Object.freeze(inputs.map((input, index) => {
    const canonical = canonicalInput(input)
    if (canonical.tickIndex !== index + 1) {
      throw new Error('Flight Sim replay inputs must use contiguous construction order')
    }
    return canonical
  }))
}

export function serializeFlightSimCapture(capture: FlightSimMissionCapture): string {
  return stableStringifyJson({
    aircraft: {
      pitch: capture.aircraft.pitch,
      position: [...capture.aircraft.position],
      roll: capture.aircraft.roll,
      throttle: capture.aircraft.throttle,
      velocity: [...capture.aircraft.velocity],
      yaw: capture.aircraft.yaw,
    },
    collisionId: capture.collisionId,
    currentWaypointId: capture.currentWaypointId,
    elapsedSeconds: capture.elapsedSeconds,
    phase: capture.phase,
    tick: capture.tick,
    waypointCount: capture.waypointCount,
    waypointIndex: capture.waypointIndex,
  })
}

function serializeReplayInput(input: FlightSimReplayInput): string {
  return stableStringifyJson(input)
}

export async function recordFlightSimReplayTrace(args: Readonly<{
  profile: FlightSimSpatialProfile
  seed: string
  inputs: readonly FlightSimReplayInput[]
}>): Promise<FlightSimReplayTrace> {
  const inputs = validateOrderedInputs(args.inputs)
  const mission = createFlightSimMission({
    runId: 1,
    profile: args.profile,
    seed: args.seed,
  })
  const frames: FlightSimReplayFrame[] = []
  try {
    for (const input of inputs) {
      const result = await tickFlightSimMission(
        mission,
        input.controls,
        input.throttleSetpoint,
      )
      frames.push(Object.freeze({
        input,
        canonicalCapture: serializeFlightSimCapture(result.capture),
      }))
    }
  } finally {
    disposeFlightSimMission(mission)
  }
  return Object.freeze({
    schema: 'flight-sim-replay/v1',
    sourceKey: args.profile.sourceKey,
    seed: args.seed,
    frames: Object.freeze(frames),
  })
}

function invalidResult(
  mission: FlightSimMission,
  capture: FlightSimMissionCapture,
  reason: string,
  tickIndex: number | null = null,
): FlightSimReplayResult {
  return Object.freeze({
    ok: false,
    mission,
    capture,
    error: Object.freeze({
      code: 'FLIGHT_SIM_INVALID_REPLAY_INPUTS',
      reason,
      tickIndex,
      lastMatchingTick: capture.tick,
    }),
  })
}

export async function replayFlightSimTrace(args: Readonly<{
  mission: FlightSimMission
  trace: FlightSimReplayTrace
  inputs: readonly FlightSimReplayInput[]
}>): Promise<FlightSimReplayResult> {
  const initialCapture = captureFlightSimMission(args.mission)
  if (args.trace.schema !== 'flight-sim-replay/v1') {
    return invalidResult(args.mission, initialCapture, 'schema_mismatch')
  }
  if (args.trace.sourceKey !== args.mission.profile.sourceKey) {
    return invalidResult(args.mission, initialCapture, 'source_mismatch')
  }
  if (args.trace.seed !== args.mission.seed) {
    return invalidResult(args.mission, initialCapture, 'seed_mismatch')
  }
  if (args.inputs.length !== args.trace.frames.length) {
    return invalidResult(args.mission, initialCapture, 'count_mismatch')
  }

  let inputs: readonly FlightSimReplayInput[]
  try {
    inputs = validateOrderedInputs(args.inputs)
  } catch {
    return invalidResult(args.mission, initialCapture, 'order_mismatch')
  }
  for (let index = 0; index < inputs.length; index += 1) {
    const recorded = args.trace.frames[index]
    if (!recorded || recorded.input.tickIndex !== index + 1) {
      return invalidResult(args.mission, initialCapture, 'recorded_order_mismatch', index + 1)
    }
    if (serializeReplayInput(recorded.input) !== serializeReplayInput(inputs[index]!)) {
      return invalidResult(args.mission, initialCapture, 'input_mismatch', index + 1)
    }
  }

  let matchingMission = cloneFlightSimMission(args.mission)
  let matchingCapture = captureFlightSimMission(matchingMission)
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index]!
    const candidate = cloneFlightSimMission(matchingMission)
    try {
      const tick = await tickFlightSimMission(
        candidate,
        input.controls,
        input.throttleSetpoint,
      )
      const actualCapture = serializeFlightSimCapture(tick.capture)
      const expectedCapture = args.trace.frames[index]!.canonicalCapture
      if (actualCapture !== expectedCapture) {
        disposeFlightSimMission(candidate)
        return Object.freeze({
          ok: false,
          mission: matchingMission,
          capture: matchingCapture,
          error: Object.freeze({
            code: 'FLIGHT_SIM_REPLAY_DIVERGENCE',
            reason: 'capture_bytes_mismatch',
            tickIndex: input.tickIndex,
            lastMatchingTick: matchingCapture.tick,
            expectedCapture,
            actualCapture,
          }),
        })
      }
      disposeFlightSimMission(matchingMission)
      matchingMission = candidate
      matchingCapture = tick.capture
    } catch (error) {
      disposeFlightSimMission(candidate)
      return Object.freeze({
        ok: false,
        mission: matchingMission,
        capture: matchingCapture,
        error: Object.freeze({
          code: 'FLIGHT_SIM_REPLAY_TICK_FAILED',
          reason: error instanceof Error ? error.message : String(error),
          tickIndex: input.tickIndex,
          lastMatchingTick: matchingCapture.tick,
        }),
      })
    }
  }
  return Object.freeze({
    ok: true,
    mission: matchingMission,
    capture: matchingCapture,
    error: null,
  })
}
