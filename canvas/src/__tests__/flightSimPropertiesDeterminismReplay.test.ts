import assert from 'node:assert/strict'
import test from 'node:test'
import fc from 'fast-check'
import { stableStringifyJson } from '../../../ecs/kgcNodeContract.js'
import { snapshotWorld } from '../../../ecs/world.js'
import {
  captureFlightSimMission,
  createFlightSimMission,
  disposeFlightSimMission,
  tickFlightSimMission,
  type FlightSimMission,
} from '../features/game-flight-sim/flightSimMission'
import {
  FLIGHT_SIM_FIXED_STEP_SECONDS,
  type FlightSimSnapshot,
  type FlightSimTickInput,
} from '../features/game-flight-sim/flightSimModel'
import {
  recordFlightSimReplayTrace,
  replayFlightSimTrace,
  serializeFlightSimCapture,
  type FlightSimReplayInput,
  type FlightSimReplayTrace,
} from '../features/game-flight-sim/flightSimReplay'
import {
  createFlightSimRuntime,
  type FlightSimRuntime,
} from '../features/game-flight-sim/flightSimRuntime'
import {
  FLIGHT_SIM_SAVE_PATH,
  type FlightSimDecisionStoreSnapshot,
} from '../features/game-flight-sim/flightSimDecisionStore'
import { projectFlightSimHud } from '../features/game-flight-sim/flightSimHudProjection'
import { flightSimPropertyParameters } from './helpers/flightSimPropertyHarness'
import {
  asFlightSimReplayInputs,
  flightSimActiveInputArbitrary,
  flightSimPropertyProfile,
  flightSimSeedArbitrary,
  flightSimThrottleSetpointArbitrary,
} from './helpers/flightSimSimulationPropertyFixtures'

type GeneratedReplayFrame = Readonly<{
  controls: FlightSimTickInput
  throttleSetpoint: number | null
}>

type ScheduledInputSegment = Readonly<{
  input: FlightSimTickInput
  tickCount: number
}>

const PROPERTY_SAVE_SNAPSHOT: FlightSimDecisionStoreSnapshot = Object.freeze({
  status: 'idle',
  errorKind: null,
  hydrationBlocked: false,
  retainedCount: 0,
  savedCount: 0,
  error: null,
  revision: 0,
})

const replayFrameArbitrary: fc.Arbitrary<GeneratedReplayFrame> = fc.record({
  controls: flightSimActiveInputArbitrary,
  throttleSetpoint: flightSimThrottleSetpointArbitrary,
})

const scheduledSegmentArbitrary: fc.Arbitrary<ScheduledInputSegment> = fc.record({
  input: flightSimActiveInputArbitrary,
  tickCount: fc.integer({ min: 1, max: 8 }),
})

function missionResultBytes(snapshot: FlightSimSnapshot): string {
  return stableStringifyJson({
    active: snapshot.active,
    aircraft: snapshot.aircraft,
    collisionId: snapshot.collisionId,
    currentWaypointId: snapshot.currentWaypointId,
    elapsedSeconds: snapshot.elapsedSeconds,
    lastCostLog: snapshot.lastCostLog,
    pendingDecisions: snapshot.pendingDecisions,
    phase: snapshot.phase,
    runId: snapshot.runId,
    runtimeError: snapshot.runtimeError,
    tick: snapshot.tick,
    waypointCount: snapshot.waypointCount,
    waypointIndex: snapshot.waypointIndex,
    webglSupported: snapshot.webglSupported,
  })
}

async function applyReplayFrame(
  runtime: FlightSimRuntime,
  frame: GeneratedReplayFrame,
): Promise<FlightSimSnapshot> {
  runtime.setInput(frame.controls)
  if (frame.throttleSetpoint !== null) runtime.setThrottle(frame.throttleSetpoint)
  return runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
}

// Feature: knowgrph-game-flight-sim, Property 8 - Deterministic byte-equivalent replay
test('Feature: knowgrph-game-flight-sim, Property 8 - Deterministic byte-equivalent replay', async () => {
  await fc.assert(
    fc.asyncProperty(
      flightSimSeedArbitrary,
      fc.array(replayFrameArbitrary, { minLength: 1, maxLength: 5 }),
      async (seed, generatedFrames) => {
        const profile = flightSimPropertyProfile()
        const inputs = asFlightSimReplayInputs(generatedFrames)
        const firstMission = createFlightSimMission({ runId: 1, profile, seed })
        const secondMission = createFlightSimMission({ runId: 1, profile, seed })
        const firstRuntime = createFlightSimRuntime({ profile })
        const secondRuntime = createFlightSimRuntime({ profile })
        const replayMission = createFlightSimMission({ runId: 1, profile, seed })
        let replayedMission: FlightSimMission | null = null
        try {
          firstRuntime.start()
          secondRuntime.start()
          for (let index = 0; index < generatedFrames.length; index += 1) {
            const frame = generatedFrames[index]!
            const input = inputs[index]!
            const [firstTick, secondTick, firstSnapshot, secondSnapshot] = await Promise.all([
              tickFlightSimMission(
                firstMission,
                input.controls,
                input.throttleSetpoint,
              ),
              tickFlightSimMission(
                secondMission,
                input.controls,
                input.throttleSetpoint,
              ),
              applyReplayFrame(firstRuntime, frame),
              applyReplayFrame(secondRuntime, frame),
            ])
            assert.equal(
              stableStringifyJson(firstTick),
              stableStringifyJson(secondTick),
            )
            assert.equal(
              stableStringifyJson(snapshotWorld(firstMission.world)),
              stableStringifyJson(snapshotWorld(secondMission.world)),
            )
            assert.equal(
              stableStringifyJson(firstSnapshot),
              stableStringifyJson(secondSnapshot),
            )
          }

          const firstProjection = projectFlightSimHud({
            flight: firstRuntime.read(),
            save: PROPERTY_SAVE_SNAPSHOT,
            savePath: FLIGHT_SIM_SAVE_PATH,
            hydrationPending: false,
          })
          const secondProjection = projectFlightSimHud({
            flight: secondRuntime.read(),
            save: PROPERTY_SAVE_SNAPSHOT,
            savePath: FLIGHT_SIM_SAVE_PATH,
            hydrationPending: false,
          })
          assert.equal(
            stableStringifyJson(firstProjection),
            stableStringifyJson(secondProjection),
          )

          const trace = await recordFlightSimReplayTrace({ profile, seed, inputs })
          const replay = await replayFlightSimTrace({
            mission: replayMission,
            trace,
            inputs,
          })
          assert.equal(replay.ok, true)
          assert.equal(replay.error, null)
          assert.equal(
            serializeFlightSimCapture(replay.capture),
            trace.frames.at(-1)!.canonicalCapture,
          )
          replayedMission = replay.mission
        } finally {
          firstRuntime.exit()
          secondRuntime.exit()
          disposeFlightSimMission(firstMission)
          disposeFlightSimMission(secondMission)
          disposeFlightSimMission(replayMission)
          if (replayedMission) disposeFlightSimMission(replayedMission)
        }
      },
    ),
    flightSimPropertyParameters(8),
  )
})

async function advanceScheduledRuntime(args: Readonly<{
  runtime: FlightSimRuntime
  segments: readonly ScheduledInputSegment[]
  framesPerSecond: number
  coalescedFrameCount: number
}>): Promise<Readonly<{
  snapshot: FlightSimSnapshot
  maximumCatchUpTicks: number
}>> {
  args.runtime.start()
  let maximumCatchUpTicks = 0
  for (const segment of args.segments) {
    args.runtime.setInput(segment.input)
    const targetTick = args.runtime.read().tick + segment.tickCount
    let remainingSeconds = segment.tickCount * FLIGHT_SIM_FIXED_STEP_SECONDS
    const firstDelta = Math.min(
      remainingSeconds,
      args.coalescedFrameCount / args.framesPerSecond,
    )
    const frameDeltas = [firstDelta]
    remainingSeconds -= firstDelta
    while (remainingSeconds > 1e-12) {
      const delta = Math.min(remainingSeconds, 1 / args.framesPerSecond)
      frameDeltas.push(delta)
      remainingSeconds -= delta
    }
    for (const deltaSeconds of frameDeltas) {
      const priorTick = args.runtime.read().tick
      const advanced = await args.runtime.advanceBy(deltaSeconds)
      const catchUpTicks = advanced.tick - priorTick
      assert.ok(catchUpTicks >= 0 && catchUpTicks <= 5)
      maximumCatchUpTicks = Math.max(maximumCatchUpTicks, catchUpTicks)
    }
    for (let drainCount = 0; args.runtime.read().tick < targetTick; drainCount += 1) {
      assert.ok(drainCount < 4)
      const priorTick = args.runtime.read().tick
      const advanced = await args.runtime.advanceBy(0)
      const catchUpTicks = advanced.tick - priorTick
      assert.ok(catchUpTicks >= 0 && catchUpTicks <= 5)
      maximumCatchUpTicks = Math.max(maximumCatchUpTicks, catchUpTicks)
    }
    assert.equal(args.runtime.read().tick, targetTick)
  }
  return Object.freeze({
    snapshot: args.runtime.read(),
    maximumCatchUpTicks,
  })
}

async function advanceReferenceRuntime(
  runtime: FlightSimRuntime,
  segments: readonly ScheduledInputSegment[],
): Promise<FlightSimSnapshot> {
  runtime.start()
  for (const segment of segments) {
    runtime.setInput(segment.input)
    for (let tick = 0; tick < segment.tickCount; tick += 1) {
      await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
    }
  }
  return runtime.read()
}

// Feature: knowgrph-game-flight-sim, Property 9 - Frame-derived, refresh-independent, bounded-accumulator advance
test('Feature: knowgrph-game-flight-sim, Property 9 - Frame-derived, refresh-independent, bounded-accumulator advance', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(scheduledSegmentArbitrary, { minLength: 1, maxLength: 3 }),
      fc.integer({ min: 24, max: 240 }),
      fc.integer({ min: 24, max: 240 }),
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: 1, max: 5 }),
      async (
        segments,
        firstFramesPerSecond,
        secondFramesPerSecond,
        firstCoalescedFrames,
        secondCoalescedFrames,
      ) => {
        const profile = flightSimPropertyProfile()
        const first = createFlightSimRuntime({ profile })
        const second = createFlightSimRuntime({ profile })
        const reference = createFlightSimRuntime({ profile })
        try {
          const [firstResult, secondResult, referenceSnapshot] = await Promise.all([
            advanceScheduledRuntime({
              runtime: first,
              segments,
              framesPerSecond: firstFramesPerSecond,
              coalescedFrameCount: firstCoalescedFrames,
            }),
            advanceScheduledRuntime({
              runtime: second,
              segments,
              framesPerSecond: secondFramesPerSecond,
              coalescedFrameCount: secondCoalescedFrames,
            }),
            advanceReferenceRuntime(reference, segments),
          ])
          assert.ok(firstResult.maximumCatchUpTicks <= 5)
          assert.ok(secondResult.maximumCatchUpTicks <= 5)
          assert.equal(
            missionResultBytes(firstResult.snapshot),
            missionResultBytes(referenceSnapshot),
          )
          assert.equal(
            missionResultBytes(secondResult.snapshot),
            missionResultBytes(referenceSnapshot),
          )
        } finally {
          first.exit()
          second.exit()
          reference.exit()
        }
      },
    ),
    flightSimPropertyParameters(9),
  )
})

// Feature: knowgrph-game-flight-sim, Property 10 - Projection is read-only and post-commit
test('Feature: knowgrph-game-flight-sim, Property 10 - Projection is read-only and post-commit', async () => {
  await fc.assert(
    fc.asyncProperty(
      flightSimActiveInputArbitrary,
      async input => {
        const runtime = createFlightSimRuntime({ profile: flightSimPropertyProfile() })
        try {
          runtime.start()
          runtime.setInput(input)
          const committed = await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
          assert.equal(committed.tick, 1)
          const beforeProjection = stableStringifyJson(runtime.read())
          const firstProjection = projectFlightSimHud({
            flight: runtime.read(),
            save: PROPERTY_SAVE_SNAPSHOT,
            savePath: FLIGHT_SIM_SAVE_PATH,
            hydrationPending: false,
          })
          const secondProjection = projectFlightSimHud({
            flight: runtime.read(),
            save: PROPERTY_SAVE_SNAPSHOT,
            savePath: FLIGHT_SIM_SAVE_PATH,
            hydrationPending: false,
          })
          assert.equal(stableStringifyJson(runtime.read()), beforeProjection)
          assert.equal(
            stableStringifyJson(firstProjection),
            stableStringifyJson(secondProjection),
          )
          assert.equal(Object.isFrozen(firstProjection), true)
          assert.equal(Object.isFrozen(firstProjection.waypoint), true)
          assert.equal(Object.isFrozen(firstProjection.save), true)
          assert.equal(firstProjection.altitude, committed.aircraft.position[1])
          assert.equal(firstProjection.pitchRadians, committed.aircraft.pitch)
          assert.equal(firstProjection.rollRadians, committed.aircraft.roll)
          assert.equal(firstProjection.throttle, committed.aircraft.throttle)
        } finally {
          runtime.exit()
        }
      },
    ),
    flightSimPropertyParameters(10),
  )
})

const replayMismatchArbitrary = fc.constantFrom(
  'count' as const,
  'order' as const,
  'seed' as const,
)

// Feature: knowgrph-game-flight-sim, Property 11 - Replay rejects mismatched inputs without mutation
test('Feature: knowgrph-game-flight-sim, Property 11 - Replay rejects mismatched inputs without mutation', async () => {
  await fc.assert(
    fc.asyncProperty(
      flightSimSeedArbitrary,
      fc.array(replayFrameArbitrary, { minLength: 2, maxLength: 6 }),
      replayMismatchArbitrary,
      async (seed, generatedFrames, mismatch) => {
        const profile = flightSimPropertyProfile()
        const inputs = asFlightSimReplayInputs(generatedFrames)
        const trace = await recordFlightSimReplayTrace({ profile, seed, inputs })
        const mission = createFlightSimMission({ runId: 1, profile, seed })
        try {
          const before = captureFlightSimMission(mission)
          let replayTrace: FlightSimReplayTrace = trace
          let replayInputs: readonly FlightSimReplayInput[] = inputs
          if (mismatch === 'count') {
            replayInputs = inputs.slice(0, -1)
          } else if (mismatch === 'order') {
            replayInputs = Object.freeze([
              inputs[1]!,
              inputs[0]!,
              ...inputs.slice(2),
            ])
          } else {
            replayTrace = Object.freeze({
              ...trace,
              seed: `${trace.seed}:mismatch`,
            })
          }
          const rejected = await replayFlightSimTrace({
            mission,
            trace: replayTrace,
            inputs: replayInputs,
          })
          assert.equal(rejected.ok, false)
          assert.equal(rejected.mission, mission)
          assert.equal(rejected.error?.code, 'FLIGHT_SIM_INVALID_REPLAY_INPUTS')
          assert.equal(
            rejected.error?.reason,
            mismatch === 'count'
              ? 'count_mismatch'
              : mismatch === 'order' ? 'order_mismatch' : 'seed_mismatch',
          )
          assert.deepEqual(rejected.capture, before)
          assert.deepEqual(captureFlightSimMission(mission), before)
        } finally {
          disposeFlightSimMission(mission)
        }
      },
    ),
    flightSimPropertyParameters(11),
  )
})

// Feature: knowgrph-game-flight-sim, Property 12 - Replay halts on determinism divergence
test('Feature: knowgrph-game-flight-sim, Property 12 - Replay halts on determinism divergence', async () => {
  await fc.assert(
    fc.asyncProperty(
      flightSimSeedArbitrary,
      fc.array(replayFrameArbitrary, { minLength: 1, maxLength: 6 }),
      fc.nat(),
      fc.integer({ min: 1, max: 100 }),
      async (seed, generatedFrames, divergenceSelector, positionDelta) => {
        const profile = flightSimPropertyProfile()
        const inputs = asFlightSimReplayInputs(generatedFrames)
        const trace = await recordFlightSimReplayTrace({ profile, seed, inputs })
        const divergenceIndex = divergenceSelector % trace.frames.length
        const divergentCapture = JSON.parse(
          trace.frames[divergenceIndex]!.canonicalCapture,
        ) as { aircraft: { position: [number, number, number] } }
        divergentCapture.aircraft.position[0] += positionDelta
        const divergentFrames = trace.frames.map((frame, index) => (
          index === divergenceIndex
            ? Object.freeze({
                ...frame,
                canonicalCapture: stableStringifyJson(divergentCapture),
              })
            : frame
        ))
        const divergentTrace: FlightSimReplayTrace = Object.freeze({
          ...trace,
          frames: Object.freeze(divergentFrames),
        })
        const mission = createFlightSimMission({ runId: 1, profile, seed })
        let lastGoodMission: FlightSimMission | null = null
        try {
          const initial = captureFlightSimMission(mission)
          const replay = await replayFlightSimTrace({
            mission,
            trace: divergentTrace,
            inputs,
          })
          assert.equal(replay.ok, false)
          assert.equal(replay.error?.code, 'FLIGHT_SIM_REPLAY_DIVERGENCE')
          assert.equal(replay.error?.tickIndex, divergenceIndex + 1)
          assert.equal(replay.error?.lastMatchingTick, divergenceIndex)
          assert.equal(
            serializeFlightSimCapture(replay.capture),
            divergenceIndex === 0
              ? serializeFlightSimCapture(initial)
              : trace.frames[divergenceIndex - 1]!.canonicalCapture,
          )
          assert.deepEqual(captureFlightSimMission(mission), initial)
          assert.notEqual(replay.mission, mission)
          lastGoodMission = replay.mission
        } finally {
          disposeFlightSimMission(mission)
          if (lastGoodMission) disposeFlightSimMission(lastGoodMission)
        }
      },
    ),
    flightSimPropertyParameters(12),
  )
})
