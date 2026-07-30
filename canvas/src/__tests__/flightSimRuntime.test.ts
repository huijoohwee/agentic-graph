import assert from 'node:assert/strict'
import test from 'node:test'
import { snapshotWorld } from '../../../ecs/world.js'
import {
  createFlightSimRuntime,
} from '../features/game-flight-sim/flightSimRuntime'
import {
  FLIGHT_SIM_AIRCRAFT_ENTITY_REF,
  FLIGHT_SIM_FIXED_STEP_SECONDS,
  FLIGHT_SIM_MAX_CATCH_UP_TICKS,
  FLIGHT_SIM_MAX_PERSISTED_RUN_ID,
  FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
  canonicalizeFlightSimEcsAircraftState,
  type FlightSimSpatialProfile,
} from '../features/game-flight-sim/flightSimModel'
import { createFlightSimSimulationClock } from '../features/game-flight-sim/flightSimSimulationClock'
import {
  createFlightSimMission,
  disposeFlightSimMission,
  FlightSimWorldTickError,
  tickFlightSimMission,
  type FlightSimMissionTickResult,
} from '../features/game-flight-sim/flightSimMission'
import { validateFlightSimMissionDecisions } from '../features/game-flight-sim/flightSimDecisionAdmission'
import {
  flightSimInputFromStandardGamepad,
} from '../features/game-flight-sim/flightSimInput'

function profile(): FlightSimSpatialProfile {
  return Object.freeze({
    id: 'flight-sim:runtime-test',
    sourceKey: 'authored:runtime-test',
    aircraftHalfSize: Object.freeze([0.4, 0.4, 0.4] as const),
    spawn: Object.freeze({
      position: Object.freeze([0, 10, 5] as const),
      velocity: Object.freeze([0, 0, -8] as const),
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttle: 0.55,
    }),
    blockers: Object.freeze([
      Object.freeze({
        id: 'ground',
        center: Object.freeze([0, -0.5, 0] as const),
        halfSize: Object.freeze([30, 0.5, 30] as const),
      }),
    ]),
    waypoints: Object.freeze([
      Object.freeze({
        id: 'route-1',
        position: Object.freeze([0, 10, -200] as const),
        radiusMeters: FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
      }),
      Object.freeze({
        id: 'route-2',
        position: Object.freeze([0, 10, -400] as const),
        radiusMeters: FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
      }),
      Object.freeze({
        id: 'route-3',
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

function terminalProfile(): FlightSimSpatialProfile {
  const spatial = profile()
  const objectivePoint = (id: string) => Object.freeze({
    id,
    position: spatial.spawn.position,
    radiusMeters: FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
  })
  return Object.freeze({
    ...spatial,
    waypoints: Object.freeze([
      objectivePoint('spawn-waypoint-1'),
      objectivePoint('spawn-waypoint-2'),
      objectivePoint('spawn-waypoint-3'),
    ]),
    landingPad: objectivePoint('spawn-landing-pad'),
  })
}

function lateSystemFailureProfile(): FlightSimSpatialProfile {
  const spatial = profile()
  let failNextCollisionRead = true
  const failingBlocker = Object.freeze({
    id: 'late-system-failure',
    get center(): readonly [number, number, number] {
      if (failNextCollisionRead) {
        failNextCollisionRead = false
        throw new Error('collision catalog sentinel')
      }
      return Object.freeze([25, 25, 25] as const)
    },
    halfSize: Object.freeze([1, 1, 1] as const),
  })
  return Object.freeze({
    ...spatial,
    blockers: Object.freeze([failingBlocker]),
  })
}

test('serialized advances capture immutable input at enqueue time', async () => {
  const runtime = createFlightSimRuntime({ profile: profile() })
  runtime.start()
  runtime.setInput({ roll: 1 })
  const firstAdvance = runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
  runtime.setInput({ roll: -1 })
  const first = await firstAdvance
  assert.ok(first.aircraft.roll > 0)

  const second = await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
  assert.ok(second.aircraft.roll < first.aircraft.roll)
  assert.equal(second.tick, 2)
})

test('queued device input resolves each axis to its largest absolute command', async () => {
  const runtime = createFlightSimRuntime({ profile: profile() })
  runtime.start()
  runtime.setInput({ roll: 0.35, yaw: -0.8 })
  runtime.queueInput({ roll: -0.75, yaw: 0.3 })
  const advanced = await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
  assert.ok(advanced.aircraft.roll < 0)
  assert.ok(advanced.aircraft.yaw < 0)
})

test('public runtime normalizes raw device outliers and retains last valid input across ticks', async () => {
  const runtime = createFlightSimRuntime({ profile: profile() })
  const reference = createFlightSimRuntime({ profile: profile() })
  runtime.start()
  reference.start()

  const validInput = Object.freeze({
    pitch: 0.4,
    roll: -0.25,
    yaw: 0.3,
    throttleDelta: 0.2,
  })
  runtime.setInput(validInput)
  reference.setInput(validInput)
  const first = await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
  const referenceFirst = await reference.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
  assert.deepEqual(first.aircraft, referenceFirst.aircraft)

  const rawDeviceInput = flightSimInputFromStandardGamepad({
    connected: true,
    mapping: 'standard',
    axes: [Number.POSITIVE_INFINITY, Number.NaN],
    buttons: Array.from({ length: 8 }, (_, index) => ({
      value: index === 4
        ? 7
        : index === 6 ? Number.POSITIVE_INFINITY : 0,
    })),
  })
  assert.equal(Number.isNaN(rawDeviceInput.pitch), true)
  assert.equal(rawDeviceInput.roll, Number.POSITIVE_INFINITY)
  assert.equal(rawDeviceInput.yaw, 7)
  assert.equal(rawDeviceInput.throttleDelta, Number.NEGATIVE_INFINITY)

  runtime.setInput(rawDeviceInput)
  reference.setInput({
    pitch: Math.fround(validInput.pitch),
    roll: 1,
    yaw: 1,
    throttleDelta: -1,
  })
  const normalized = await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
  const referenceNormalized = await reference.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
  assert.equal(normalized.tick, 2)
  assert.equal(normalized.runtimeError, null)
  assert.deepEqual(normalized.aircraft, referenceNormalized.aircraft)

  runtime.setInput({
    pitch: Number.NaN,
    roll: Number.NaN,
    yaw: Number.NaN,
    throttleDelta: Number.NaN,
  })
  reference.setInput({
    pitch: Math.fround(validInput.pitch),
    roll: 1,
    yaw: 1,
    throttleDelta: -1,
  })
  const retained = await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
  const referenceRetained = await reference.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
  assert.equal(retained.tick, 3)
  assert.equal(retained.runtimeError, null)
  assert.deepEqual(retained.aircraft, referenceRetained.aircraft)
})

test('InputIntegrationSystem records finite outliers in its internal input frame', async () => {
  const mission = createFlightSimMission({ runId: 1, profile: profile() })
  try {
    await tickFlightSimMission(mission, {
      pitch: 0.4,
      roll: -0.25,
      yaw: 7,
      throttleDelta: 0.2,
    })
    const world = snapshotWorld(mission.world) as {
      entities: readonly Readonly<{
        entityRef: string
        components: Readonly<Record<string, Readonly<Record<string, number>>>>
      }>[]
    }
    const inputFrame = world.entities.find(
      entity => entity.entityRef === FLIGHT_SIM_AIRCRAFT_ENTITY_REF,
    )?.components.InputFrame
    assert.ok(inputFrame)
    assert.equal(inputFrame.pitch, Math.fround(0.4))
    assert.equal(inputFrame.roll, Math.fround(-0.25))
    assert.equal(inputFrame.yaw, 1)
    assert.equal(inputFrame.throttleDelta, Math.fround(0.2))
    assert.equal(inputFrame.outOfRange, 1)
  } finally {
    disposeFlightSimMission(mission)
  }
})

test('invalid absolute throttle setpoints reject without mutating any runtime phase', () => {
  const runtime = createFlightSimRuntime({ profile: profile() })
  const active = runtime.start()
  for (const invalid of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -0.01,
    1.01,
  ]) {
    assert.throws(() => runtime.setThrottle(invalid), /finite number from 0 to 1/)
    assert.equal(runtime.read(), active)
  }

  const stopped = runtime.stop()
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -1, 2]) {
    assert.throws(() => runtime.setThrottle(invalid), /finite number from 0 to 1/)
    assert.equal(runtime.read(), stopped)
  }
})

test('one advance executes no more than five fixed catch-up ticks', async () => {
  const runtime = createFlightSimRuntime({ profile: profile() })
  runtime.start()
  runtime.setInput({ pitch: 0.1 })
  const first = await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS * 20)
  assert.equal(first.tick, FLIGHT_SIM_MAX_CATCH_UP_TICKS)
  const second = await runtime.advanceBy(0)
  assert.equal(second.tick, FLIGHT_SIM_MAX_CATCH_UP_TICKS * 2)
})

test('Stop then Start retains exact state while Restart creates a fresh run', async () => {
  const runtime = createFlightSimRuntime({ profile: profile() })
  const ready = runtime.start()
  runtime.setInput({ pitch: 0.4 })
  const flying = await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS * 3)
  const stopped = runtime.stop()
  assert.equal(stopped.phase, 'stopped')
  assert.equal(stopped.tick, flying.tick)
  assert.deepEqual(stopped.aircraft, flying.aircraft)

  const resumed = runtime.start()
  assert.equal(resumed.tick, flying.tick)
  assert.deepEqual(resumed.aircraft, flying.aircraft)
  assert.equal(resumed.runId, ready.runId)

  const restarted = runtime.restart()
  assert.equal(restarted.phase, 'ready')
  assert.equal(restarted.tick, 0)
  assert.equal(restarted.runId, ready.runId + 1)
  assert.deepEqual(restarted.aircraft, ready.aircraft)
})

test('Stop fences an underway ECS tick without changing the acknowledged state', async () => {
  const runtime = createFlightSimRuntime({ profile: profile() })
  runtime.start()
  runtime.setInput({ pitch: 0.4 })
  const advancing = runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
  await Promise.resolve()
  const stopped = runtime.stop()
  const settled = await advancing

  assert.equal(stopped.phase, 'stopped')
  assert.equal(stopped.tick, 0)
  assert.deepEqual(settled, stopped)
  assert.deepEqual(runtime.read(), stopped)

  runtime.start()
  runtime.setInput({ pitch: 0.4 })
  const resumedTick = await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
  assert.equal(resumedTick.tick, 1)
})

test('control and throttle commands remain staged until a World_Tick commits their projection', async () => {
  const runtime = createFlightSimRuntime({ profile: profile() })
  const ready = runtime.start()
  let notifications = 0
  const unsubscribe = runtime.subscribe(() => {
    notifications += 1
  })
  const stagedControl = runtime.setInput({ pitch: 0.25 })
  const stagedThrottle = runtime.setThrottle(0.8)

  assert.equal(stagedControl, ready)
  assert.equal(stagedThrottle, ready)
  assert.equal(runtime.read().phase, 'ready')
  assert.equal(runtime.read().aircraft.throttle, ready.aircraft.throttle)
  assert.equal(notifications, 0)

  const committed = await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
  assert.equal(committed.phase, 'flying')
  assert.equal(committed.aircraft.throttle, Math.fround(0.8))
  assert.equal(notifications, 1)
  unsubscribe()
})

test('runtime failure retains the last committed projection while adopting prior same-tick system commits', async () => {
  const runtime = createFlightSimRuntime({ profile: lateSystemFailureProfile() })
  const ready = runtime.start()
  const staged = runtime.setInput({ pitch: 0.4 })
  assert.equal(staged, ready)

  await assert.rejects(
    () => runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS),
    (error) => {
      assert.ok(error instanceof FlightSimWorldTickError)
      assert.equal(error.failingSystemName, 'CollisionResolverSystem')
      assert.equal(error.systemCause, 'collision catalog sentinel')
      return true
    },
  )

  const failed = runtime.read()
  assert.equal(failed.phase, 'ready')
  assert.equal(failed.tick, ready.tick)
  assert.deepEqual(failed.aircraft, ready.aircraft)
  assert.match(failed.runtimeError || '', /collision catalog sentinel/)

  runtime.open(true)
  runtime.setInput({ pitch: 0.4 })
  const resumed = await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
  assert.equal(
    resumed.tick,
    2,
    'the next successful tick must continue from the internally retained failed tick',
  )
})

test('throttle cannot mutate a terminal aircraft after its Decisions are captured', async () => {
  const spatial = terminalProfile()
  const runtime = createFlightSimRuntime({ profile: spatial })
  runtime.start()
  runtime.setInput({ pitch: 0.1 })
  const terminal = await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS * 4)
  assert.equal(terminal.phase, 'completed')
  assert.equal(terminal.waypointIndex, 3)
  assert.equal(
    terminal.pendingDecisions.find(item => item.payload.event === 'mission_completed')
      ?.payload.landingPadId,
    spatial.landingPad.id,
  )
  const rejected = runtime.setThrottle(0.1)
  assert.deepEqual(rejected.aircraft, terminal.aircraft)
  assert.deepEqual(rejected.pendingDecisions, terminal.pendingDecisions)
  assert.match(rejected.runtimeError || '', /ready or flying/)
})

test('pending Decisions retain one latest flight state per run and Restart drops an unfinished run', async () => {
  const runtime = createFlightSimRuntime({ profile: profile() })
  runtime.start()
  runtime.setInput({ pitch: 0.1 })
  for (let index = 0; index < 24; index += 1) {
    await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
  }
  const active = runtime.read()
  assert.equal(active.phase, 'flying')
  assert.equal(active.pendingDecisions.length, 1)
  assert.equal(active.pendingDecisions[0].payload.event, 'flight_state')
  assert.equal(active.pendingDecisions[0].payload.tick, active.tick)
  const restarted = runtime.restart()
  assert.equal(restarted.pendingDecisions.length, 0)
  assert.equal(restarted.runId, active.runId + 1)
})

test('hydrated terminal Decisions preserve the terminal mission phase', async () => {
  const spatial = terminalProfile()
  const mission = createFlightSimMission({ runId: 1, profile: spatial })
  const decisions = []
  let terminal: FlightSimMissionTickResult | null = null
  for (let tick = 0; tick < 4; tick += 1) {
    terminal = await tickFlightSimMission(mission, {
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttleDelta: 0,
    })
    decisions.push(...terminal.decisions)
  }
  assert.ok(terminal)
  assert.equal(terminal.capture.phase, 'completed')

  const runtime = createFlightSimRuntime({ profile: spatial })
  runtime.hydrate(decisions)
  const hydrated = runtime.start()
  assert.equal(hydrated.phase, 'completed')
  assert.equal(hydrated.runId, 1)
  assert.equal(hydrated.tick, terminal.capture.tick)
  assert.deepEqual(hydrated.aircraft, terminal.capture.aircraft)
  assert.equal(runtime.restart().runId, 2)
})

test('hydrated waypoint progress continues one coherent persistable run', async () => {
  const spatial = terminalProfile()
  const savedMission = createFlightSimMission({ runId: 7, profile: spatial })
  const savedTick = await tickFlightSimMission(savedMission, {
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttleDelta: 0,
  })
  assert.equal(savedTick.capture.waypointIndex, 1)
  assert.doesNotThrow(() => validateFlightSimMissionDecisions(spatial, savedTick.decisions))

  const runtime = createFlightSimRuntime({ profile: spatial })
  assert.equal(runtime.hydrate(savedTick.decisions).runtimeError, null)
  const hydrated = runtime.start()
  assert.equal(hydrated.runId, 7)
  assert.equal(hydrated.waypointIndex, 1)

  const continued = await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
  assert.equal(continued.runId, 7)
  assert.ok(continued.pendingDecisions.every(item => item.payload.runId === 7))
  assert.doesNotThrow(() => validateFlightSimMissionDecisions(
    spatial,
    [...savedTick.decisions, ...continued.pendingDecisions],
  ))
})

test('maximum persisted run can hydrate but cannot restart into an unpersistable id', async () => {
  const spatial = terminalProfile()
  const savedMission = createFlightSimMission({
    runId: FLIGHT_SIM_MAX_PERSISTED_RUN_ID,
    profile: spatial,
  })
  const savedTick = await tickFlightSimMission(savedMission, {
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttleDelta: 0,
  })
  const runtime = createFlightSimRuntime({ profile: spatial })
  runtime.hydrate(savedTick.decisions)
  assert.equal(runtime.start().runId, FLIGHT_SIM_MAX_PERSISTED_RUN_ID)

  const rejected = runtime.restart()
  assert.equal(rejected.runId, FLIGHT_SIM_MAX_PERSISTED_RUN_ID)
  assert.equal(rejected.phase, 'stopped')
  assert.match(rejected.runtimeError || '', /exhausted its bounded run range/)
})

test('Exit discards the ECS World, pending state, and retained mission progress', async () => {
  const runtime = createFlightSimRuntime({ profile: profile() })
  runtime.start()
  runtime.setInput({ pitch: 0.4 })
  const flying = await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS * 3)
  assert.equal(flying.tick, 3)
  assert.ok(flying.pendingDecisions.length > 0)

  const exited = runtime.exit()
  assert.equal(exited.active, false)
  assert.equal(exited.phase, 'stopped')
  assert.equal(exited.runId, 0)
  assert.equal(exited.tick, 0)
  assert.deepEqual(
    exited.aircraft,
    canonicalizeFlightSimEcsAircraftState(profile().spawn),
  )
  assert.deepEqual(exited.pendingDecisions, [])

  runtime.open(true)
  const restarted = runtime.start()
  assert.equal(restarted.runId, 1)
  assert.equal(restarted.tick, 0)
  assert.deepEqual(restarted.aircraft.position, profile().spawn.position)
  assert.deepEqual(restarted.aircraft.velocity, profile().spawn.velocity)
  assert.equal(restarted.aircraft.throttle, Math.fround(profile().spawn.throttle))
})

test('fixed queued clock coalesces backpressure and disposal fences late requests', async () => {
  let release!: () => void
  const blocked = new Promise<void>(resolve => {
    release = resolve
  })
  let steps = 0
  const clock = createFlightSimSimulationClock({
    minimumStepIntervalMs: 0,
    runStep: async () => {
      steps += 1
      if (steps === 1) await blocked
    },
    onStepError: error => assert.fail(String(error)),
  })
  clock.requestStep()
  await Promise.resolve()
  clock.requestStep()
  clock.requestStep()
  assert.equal(steps, 1)
  release()
  for (let index = 0; index < 5; index += 1) await Promise.resolve()
  assert.equal(steps, 2)
  clock.dispose()
  clock.requestStep()
  for (let index = 0; index < 3; index += 1) await Promise.resolve()
  assert.equal(steps, 2)
})
