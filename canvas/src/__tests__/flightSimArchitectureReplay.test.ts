import assert from 'node:assert/strict'
import test from 'node:test'
import { validateCostLog } from '../../../contracts/cost-log.schema.js'
import {
  blockFlightSimGameplayNetworkAttempt,
  FlightSimExternalCallBlockedError,
} from '../features/game-flight-sim/flightSimExternalCallGuard'
import {
  captureFlightSimMission,
  createFlightSimMission,
  disposeFlightSimMission,
  tickFlightSimMission,
  FlightSimWorldTickError,
  type FlightSimMission,
} from '../features/game-flight-sim/flightSimMission'
import {
  FLIGHT_SIM_BLOCKED_INFERENCE_COST_LOG,
  FLIGHT_SIM_FIXED_STEP_SECONDS,
  FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
  FLIGHT_SIM_NEUTRAL_INPUT,
  validateFlightSimDecisions,
  type FlightSimSpatialProfile,
} from '../features/game-flight-sim/flightSimModel'
import {
  recordFlightSimReplayTrace,
  replayFlightSimTrace,
  type FlightSimReplayInput,
  type FlightSimReplayTrace,
} from '../features/game-flight-sim/flightSimReplay'
import {
  FLIGHT_SIM_SYSTEM_NAMES,
  FLIGHT_SIM_TICK_ARCHITECTURE,
} from '../features/game-flight-sim/flightSimSystems'
import { validateFlightSimMissionDecisions } from '../features/game-flight-sim/flightSimDecisionAdmission'
import { createFlightSimRuntime } from '../features/game-flight-sim/flightSimRuntime'

function profile(withCollisionWall = false): FlightSimSpatialProfile {
  return Object.freeze({
    id: 'flight-sim:architecture-test',
    sourceKey: 'authored:architecture-test',
    aircraftHalfSize: Object.freeze([0.4, 0.4, 0.4] as const),
    spawn: Object.freeze({
      position: Object.freeze([0, 10, 5] as const),
      velocity: Object.freeze([0, 0, -8] as const),
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttle: 0.55,
    }),
    blockers: Object.freeze(withCollisionWall ? [Object.freeze({
      id: 'thin-wall',
      center: Object.freeze([0, 10, 4.45] as const),
      halfSize: Object.freeze([5, 5, 0.05] as const),
    })] : []),
    waypoints: Object.freeze([
      Object.freeze({
        id: 'waypoint-1',
        position: Object.freeze([0, 10, -200] as const),
        radiusMeters: FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
      }),
      Object.freeze({
        id: 'waypoint-2',
        position: Object.freeze([0, 10, -400] as const),
        radiusMeters: FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
      }),
      Object.freeze({
        id: 'waypoint-3',
        position: Object.freeze([0, 10, -600] as const),
        radiusMeters: FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
      }),
    ]),
    landingPad: Object.freeze({
      id: 'landing-pad',
      position: Object.freeze([0, 0, -800] as const),
      radiusMeters: FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
    }),
  })
}

function replayInputs(): readonly FlightSimReplayInput[] {
  return Object.freeze([
    Object.freeze({
      tickIndex: 1,
      controls: Object.freeze({ pitch: 0.2, roll: 0, yaw: 0.1, throttleDelta: 0.1 }),
      throttleSetpoint: null,
    }),
    Object.freeze({
      tickIndex: 2,
      controls: Object.freeze({ pitch: -0.1, roll: 0.3, yaw: 0, throttleDelta: 0 }),
      throttleSetpoint: 0.7,
    }),
    Object.freeze({
      tickIndex: 3,
      controls: Object.freeze({ pitch: 0, roll: -0.2, yaw: -0.25, throttleDelta: 0 }),
      throttleSetpoint: null,
    }),
  ])
}

function disposeReplayMission(result: { mission: FlightSimMission }): void {
  disposeFlightSimMission(result.mission)
}

test('Flight uses four meaningful ordered journal systems with harness-owned logs and post-commit projection', () => {
  assert.deepEqual(FLIGHT_SIM_SYSTEM_NAMES, [
    'InputIntegrationSystem',
    'FlightModelSystem',
    'CollisionResolverSystem',
    'ObjectiveSystem',
  ])
  assert.deepEqual(FLIGHT_SIM_TICK_ARCHITECTURE, {
    transactionalSystems: FLIGHT_SIM_SYSTEM_NAMES,
    costLogOwner: 'AgenticECS.worldTick:post-systems',
    projectionOwner: 'captureFlightSimMission:post-commit',
  })
})

test('a failing CollisionResolverSystem rolls back itself, preserves prior systems, and skips ObjectiveSystem', async () => {
  const mission = createFlightSimMission({
    runId: 1,
    profile: profile(true),
    failureInjection: {
      systemName: 'CollisionResolverSystem',
      errorCode: 'FLIGHT_SIM_TEST_COLLISION_FAILURE',
      message: 'collision rollback sentinel',
    },
  })
  const before = captureFlightSimMission(mission)
  await assert.rejects(
    () => tickFlightSimMission(mission, {
      pitch: 0.4,
      roll: 0.2,
      yaw: 0.1,
      throttleDelta: 0.2,
    }),
    (error) => {
      assert.ok(error instanceof FlightSimWorldTickError)
      assert.equal(error.ecsErrorCode, 'FLIGHT_SIM_TEST_COLLISION_FAILURE')
      assert.equal(error.failingSystemIndex, 2)
      assert.equal(error.failingSystemName, 'CollisionResolverSystem')
      assert.equal(error.systemCause, 'collision rollback sentinel')
      return true
    },
  )
  const after = captureFlightSimMission(mission)
  assert.equal(after.tick, 1)
  assert.equal(after.phase, 'ready')
  assert.equal(after.waypointIndex, 0)
  assert.notDeepEqual(after.aircraft, before.aircraft)
  assert.ok(after.aircraft.position[2] < 4.9)
  disposeFlightSimMission(mission)
})

test('disposed missions and runtime-replaced Worlds fail closed with ECS_INVALID_WORLD', () => {
  const direct = createFlightSimMission({ runId: 1, profile: profile() })
  assert.equal(disposeFlightSimMission(direct), true)
  assert.equal(disposeFlightSimMission(direct), false)
  assert.throws(
    () => captureFlightSimMission(direct),
    (error: Error & { code?: string }) => error.code === 'ECS_INVALID_WORLD',
  )

  const observed: FlightSimMission[] = []
  const runtime = createFlightSimRuntime({
    profile: profile(),
    onMissionCreated: mission => observed.push(mission),
  })
  runtime.start()
  runtime.restart()
  assert.equal(observed.length, 2)
  assert.throws(
    () => captureFlightSimMission(observed[0]!),
    (error: Error & { code?: string }) => error.code === 'ECS_INVALID_WORLD',
  )
  runtime.exit()
  assert.throws(
    () => captureFlightSimMission(observed[1]!),
    (error: Error & { code?: string }) => error.code === 'ECS_INVALID_WORLD',
  )
})

test('gameplay network and inference guards never invoke their executors and retain committed state', async () => {
  const networkMission = createFlightSimMission({ runId: 1, profile: profile() })
  const networkBefore = captureFlightSimMission(networkMission)
  let networkInvoked = false
  assert.throws(
    () => blockFlightSimGameplayNetworkAttempt(
      networkMission,
      'fetch:gameplay',
      () => {
        networkInvoked = true
      },
    ),
    (error) => {
      assert.ok(error instanceof FlightSimExternalCallBlockedError)
      assert.equal(error.code, 'FLIGHT_SIM_GAMEPLAY_NETWORK_BLOCKED')
      assert.equal(error.synchronous, true)
      return true
    },
  )
  assert.equal(networkInvoked, false)
  assert.deepEqual(captureFlightSimMission(networkMission), networkBefore)
  disposeFlightSimMission(networkMission)

  let inferenceInvoked = false
  const inferenceMission = createFlightSimMission({
    runId: 1,
    profile: profile(),
    inferenceExecutor: () => {
      inferenceInvoked = true
    },
  })
  const inferenceBefore = captureFlightSimMission(inferenceMission)
  const blocked = await tickFlightSimMission(
    inferenceMission,
    FLIGHT_SIM_NEUTRAL_INPUT,
    null,
    { attemptInference: true },
  )
  assert.equal(inferenceInvoked, false)
  assert.deepEqual(blocked.capture, inferenceBefore)
  assert.deepEqual(captureFlightSimMission(inferenceMission), inferenceBefore)
  assert.deepEqual(blocked.decisions, [])
  assert.deepEqual(blocked.costLog, FLIGHT_SIM_BLOCKED_INFERENCE_COST_LOG)
  assert.equal(validateCostLog(blocked.costLog).valid, true)
  assert.equal(blocked.costLog.incomplete, true)
  assert.equal(blocked.costLog.error, 'blocked_inference')
  disposeFlightSimMission(inferenceMission)

  const terminalProfile = profile()
  const terminalMission = createFlightSimMission({
    runId: 1,
    profile: terminalProfile,
    inferenceExecutor: () => {
      inferenceInvoked = true
    },
    initialCapture: {
      phase: 'completed',
      aircraft: terminalProfile.spawn,
      waypointIndex: terminalProfile.waypoints.length,
      waypointCount: terminalProfile.waypoints.length,
      currentWaypointId: terminalProfile.landingPad.id,
      tick: 4,
      elapsedSeconds: 4 * FLIGHT_SIM_FIXED_STEP_SECONDS,
      collisionId: null,
    },
  })
  const terminalBefore = captureFlightSimMission(terminalMission)
  const terminalBlocked = await tickFlightSimMission(
    terminalMission,
    FLIGHT_SIM_NEUTRAL_INPUT,
    null,
    { attemptInference: true },
  )
  assert.equal(inferenceInvoked, false)
  assert.deepEqual(terminalBlocked.capture, terminalBefore)
  assert.deepEqual(terminalBlocked.costLog, FLIGHT_SIM_BLOCKED_INFERENCE_COST_LOG)
  disposeFlightSimMission(terminalMission)
})

test('canonical dialogue_outcome Decisions persist generically but do not enter mission replay coherence', () => {
  const dialogue = {
    decisionId: 'dialogue-flight-1',
    decisionType: 'dialogue_outcome',
    entityRef: 'flight-sim:operator',
    payload: {
      accepted: true,
      outcome: 'acknowledged',
      detail: { order: 1 },
    },
    producedAt: '2026-07-24T00:00:00.000Z',
  }
  const admitted = validateFlightSimDecisions([dialogue])
  assert.equal(admitted.length, 1)
  assert.equal(admitted[0]?.decisionType, 'dialogue_outcome')
  assert.deepEqual(validateFlightSimMissionDecisions(profile(), [dialogue]), [])

  const mission = createFlightSimMission({
    runId: 1,
    profile: profile(),
    decisions: [dialogue],
  })
  assert.equal(captureFlightSimMission(mission).tick, 0)
  disposeFlightSimMission(mission)
})

test('replay validates count, order, source, seed, and inputs before mutating an active mission', async () => {
  const spatial = profile()
  const inputs = replayInputs()
  const trace = await recordFlightSimReplayTrace({
    profile: spatial,
    seed: 'mission-seed-1',
    inputs,
  })
  assert.equal(trace.sourceKey, spatial.sourceKey)
  assert.equal(trace.seed, 'mission-seed-1')
  assert.equal(trace.frames.length, inputs.length)

  const countMission = createFlightSimMission({
    runId: 1,
    profile: spatial,
    seed: trace.seed,
  })
  const countBefore = captureFlightSimMission(countMission)
  const countMismatch = await replayFlightSimTrace({
    mission: countMission,
    trace,
    inputs: inputs.slice(0, -1),
  })
  assert.equal(countMismatch.error?.code, 'FLIGHT_SIM_INVALID_REPLAY_INPUTS')
  assert.equal(countMismatch.error?.reason, 'count_mismatch')
  assert.deepEqual(captureFlightSimMission(countMission), countBefore)

  const orderMismatch = await replayFlightSimTrace({
    mission: countMission,
    trace,
    inputs: [
      Object.freeze({ ...inputs[0]!, tickIndex: 2 }),
      Object.freeze({ ...inputs[1]!, tickIndex: 1 }),
      inputs[2]!,
    ],
  })
  assert.equal(orderMismatch.error?.reason, 'order_mismatch')
  assert.deepEqual(captureFlightSimMission(countMission), countBefore)

  const inputMismatch = await replayFlightSimTrace({
    mission: countMission,
    trace,
    inputs: [
      Object.freeze({
        ...inputs[0]!,
        controls: Object.freeze({ ...inputs[0]!.controls, pitch: -0.8 }),
      }),
      ...inputs.slice(1),
    ],
  })
  assert.equal(inputMismatch.error?.reason, 'input_mismatch')
  assert.deepEqual(captureFlightSimMission(countMission), countBefore)

  const seedMission = createFlightSimMission({
    runId: 1,
    profile: spatial,
    seed: 'different-seed',
  })
  const seedBefore = captureFlightSimMission(seedMission)
  const seedMismatch = await replayFlightSimTrace({
    mission: seedMission,
    trace,
    inputs,
  })
  assert.equal(seedMismatch.error?.reason, 'seed_mismatch')
  assert.deepEqual(captureFlightSimMission(seedMission), seedBefore)

  const sourceMismatchTrace: FlightSimReplayTrace = Object.freeze({
    ...trace,
    sourceKey: 'authored:different-source',
  })
  const sourceMismatch = await replayFlightSimTrace({
    mission: countMission,
    trace: sourceMismatchTrace,
    inputs,
  })
  assert.equal(sourceMismatch.error?.reason, 'source_mismatch')
  assert.deepEqual(captureFlightSimMission(countMission), countBefore)
  disposeFlightSimMission(countMission)
  disposeFlightSimMission(seedMission)
})

test('replay returns a new exact World on success and the last byte-matching World on divergence', async () => {
  const spatial = profile()
  const inputs = replayInputs()
  const trace = await recordFlightSimReplayTrace({
    profile: spatial,
    seed: 'mission-seed-2',
    inputs,
  })
  const active = createFlightSimMission({
    runId: 1,
    profile: spatial,
    seed: trace.seed,
  })
  const activeBefore = captureFlightSimMission(active)
  const replayed = await replayFlightSimTrace({ mission: active, trace, inputs })
  assert.equal(replayed.ok, true)
  assert.equal(replayed.error, null)
  assert.equal(replayed.capture.tick, inputs.length)
  assert.deepEqual(captureFlightSimMission(active), activeBefore)
  disposeReplayMission(replayed)

  const divergentTrace: FlightSimReplayTrace = Object.freeze({
    ...trace,
    frames: Object.freeze(trace.frames.map((frame, index) => (
      index === 1
        ? Object.freeze({ ...frame, canonicalCapture: `${frame.canonicalCapture} ` })
        : frame
    ))),
  })
  const divergent = await replayFlightSimTrace({
    mission: active,
    trace: divergentTrace,
    inputs,
  })
  assert.equal(divergent.ok, false)
  assert.equal(divergent.error?.code, 'FLIGHT_SIM_REPLAY_DIVERGENCE')
  assert.equal(divergent.error?.tickIndex, 2)
  assert.equal(divergent.error?.lastMatchingTick, 1)
  assert.equal(divergent.capture.tick, 1)
  assert.deepEqual(captureFlightSimMission(active), activeBefore)
  disposeReplayMission(divergent)
  disposeFlightSimMission(active)
})
