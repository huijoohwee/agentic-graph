import assert from 'node:assert/strict'
import test from 'node:test'
import fc from 'fast-check'
import { JSDOM } from 'jsdom'
import { flightSimPropertyParameters } from './helpers/flightSimPropertyHarness'
import {
  installFlightSimDesktopInput,
} from '@/features/game-flight-sim/flightSimInput'
import {
  FLIGHT_SIM_FIXED_STEP_SECONDS,
  FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
  type FlightSimSnapshot,
  type FlightSimSpatialProfile,
} from '@/features/game-flight-sim/flightSimModel'
import {
  validateFlightSimMissionDecisions,
} from '@/features/game-flight-sim/flightSimDecisionAdmission'
import {
  createFlightSimRuntime,
} from '@/features/game-flight-sim/flightSimRuntime'
import {
  createFlightSimSimulationClock,
} from '@/features/game-flight-sim/flightSimSimulationClock'
import {
  readXrNativeControllerCamera,
  selectXrNativeControllerCameraMode,
} from '@/features/three/xrNativeControllerCameraRuntime'
import type { XrNativeControllerCameraMode } from '@/features/three/xrNativeControllerCameraCatalog'

const PROPERTY_PROFILE: FlightSimSpatialProfile = Object.freeze({
  id: 'flight-sim:lifecycle-properties',
  sourceKey: 'authored:lifecycle-properties',
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

type FocusLossEvent =
  | 'blur'
  | 'hidden'
  | 'fixed-follow-release'
  | 'free-orbit-release'

const missionStateBytes = (snapshot: FlightSimSnapshot): string => JSON.stringify({
  runId: snapshot.runId,
  aircraft: snapshot.aircraft,
  waypointIndex: snapshot.waypointIndex,
  waypointCount: snapshot.waypointCount,
  currentWaypointId: snapshot.currentWaypointId,
  tick: snapshot.tick,
  elapsedSeconds: snapshot.elapsedSeconds,
  collisionId: snapshot.collisionId,
  pendingDecisions: snapshot.pendingDecisions,
  lastCostLog: snapshot.lastCostLog,
})

const settleClockStep = (
  runStep: () => Promise<void>,
  minimumStepIntervalMs = FLIGHT_SIM_FIXED_STEP_SECONDS * 1_000,
) => {
  let resolveStep!: () => void
  const completed = new Promise<void>(resolve => {
    resolveStep = resolve
  })
  const clock = createFlightSimSimulationClock({
    minimumStepIntervalMs,
    now: () => minimumStepIntervalMs,
    runStep: async () => {
      try {
        await runStep()
      } finally {
        resolveStep()
      }
    },
    onStepError: error => assert.fail(String(error)),
  })
  return { clock, completed }
}

// Feature: knowgrph-game-flight-sim, Property 37 - Fail-closed admission keeps mission stopped
test('Feature: knowgrph-game-flight-sim, Property 37 - Fail-closed admission keeps mission stopped', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom('webgl-unavailable', 'unreadable-save'),
      fc.integer({ min: 1, max: 5 }),
      fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
      async (failureKind, priorTicks, invalidDecisionId) => {
        let createdMissionCount = 0
        const runtime = createFlightSimRuntime({
          profile: PROPERTY_PROFILE,
          onMissionCreated: () => {
            createdMissionCount += 1
          },
        })
        try {
          runtime.start()
          runtime.setInput({ pitch: 0.25 })
          await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS * priorTicks)
          const retained = runtime.stop()
          const retainedBytes = missionStateBytes(retained)
          let failed: FlightSimSnapshot
          if (failureKind === 'webgl-unavailable') {
            failed = runtime.open(false)
          } else {
            let admissionError: unknown
            try {
              validateFlightSimMissionDecisions(PROPERTY_PROFILE, [{
                invalidDecisionId,
              }])
            } catch (error) {
              admissionError = error
            }
            assert.ok(admissionError)
            const reason = admissionError instanceof Error
              ? admissionError.message
              : String(admissionError)
            failed = runtime.fail(`Unreadable saved Decisions: ${reason}`)
          }
          assert.equal(failed.phase, 'stopped')
          assert.equal(missionStateBytes(failed), retainedBytes)
          assert.equal(createdMissionCount, 1)
          assert.match(
            failed.runtimeError || '',
            failureKind === 'webgl-unavailable' ? /WebGL is unavailable/ : /Unreadable saved Decisions/,
          )
        } finally {
          runtime.exit()
        }
      },
    ),
    flightSimPropertyParameters(37),
  )
})

// Feature: knowgrph-game-flight-sim, Property 38 - Hold at tick zero until first input
test('Feature: knowgrph-game-flight-sim, Property 38 - Hold at tick zero until first input', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.oneof(
        fc.integer({ min: 0, max: 299 }),
        fc.integer({ min: 300, max: 3_600 }),
      ),
      async durationSeconds => {
        const runtime = createFlightSimRuntime({ profile: PROPERTY_PROFILE })
        const ready = runtime.start()
        const readyBytes = missionStateBytes(ready)
        let requestedSteps = 0
        const { clock, completed } = settleClockStep(async () => {
          requestedSteps += 1
          await runtime.advanceBy(durationSeconds)
        })
        try {
          clock.requestStep()
          await completed
          const held = runtime.read()
          assert.equal(requestedSteps, 1)
          assert.equal(held.phase, 'ready')
          assert.equal(held.tick, 0)
          assert.equal(missionStateBytes(held), readyBytes)
        } finally {
          clock.dispose()
          runtime.exit()
        }
      },
    ),
    flightSimPropertyParameters(38),
  )
})

// Feature: knowgrph-game-flight-sim, Property 39 - Focus-loss pauses the clock; Free_Orbit pointer-lock exit does not
test('Feature: knowgrph-game-flight-sim, Property 39 - Focus-loss pauses the clock; Free_Orbit pointer-lock exit does not', async () => {
  const dom = new JSDOM('<!doctype html><html><body><canvas></canvas></body></html>', {
    url: 'http://localhost',
  })
  const previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLCanvasElement: globalThis.HTMLCanvasElement,
  }
  const previousCameraMode = readXrNativeControllerCamera().mode
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLCanvasElement: dom.window.HTMLCanvasElement,
  })
  try {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<FocusLossEvent>(
          'blur',
          'hidden',
          'fixed-follow-release',
          'free-orbit-release',
        ),
        fc.constantFrom<XrNativeControllerCameraMode>('fixed-follow', 'free-orbit'),
        async (eventKind, ambientCameraMode) => {
          const cameraMode = eventKind === 'fixed-follow-release'
            ? 'fixed-follow'
            : eventKind === 'free-orbit-release'
              ? 'free-orbit'
              : ambientCameraMode
          selectXrNativeControllerCameraMode(cameraMode)
          const runtime = createFlightSimRuntime({ profile: PROPERTY_PROFILE })
          runtime.start()
          runtime.setInput({ pitch: 0.25 })
          await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
          const beforeEvent = runtime.read()
          const beforeEventBytes = missionStateBytes(beforeEvent)
          let pauseCount = 0
          const canvas = dom.window.document.querySelector('canvas')!
          const binding = installFlightSimDesktopInput(canvas, {
            onInput: input => {
              runtime.setInput(input)
            },
            onPause: () => {
              pauseCount += 1
              runtime.stop()
            },
            shouldPauseOnPointerRelease: () => (
              readXrNativeControllerCamera().mode === 'fixed-follow'
            ),
            shouldRequestPointerLock: () => (
              readXrNativeControllerCamera().mode === 'fixed-follow'
            ),
          })
          let stepCount = 0
          const { clock, completed } = settleClockStep(async () => {
            stepCount += 1
            if (runtime.read().phase === 'flying') {
              await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
            }
          })
          try {
            if (eventKind === 'blur') {
              dom.window.dispatchEvent(new dom.window.Event('blur'))
            } else if (eventKind === 'hidden') {
              Object.defineProperty(dom.window.document, 'visibilityState', {
                configurable: true,
                value: 'hidden',
              })
              dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'))
            } else {
              Object.defineProperty(dom.window.document, 'pointerLockElement', {
                configurable: true,
                value: canvas,
              })
              dom.window.document.dispatchEvent(new dom.window.Event('pointerlockchange'))
              Object.defineProperty(dom.window.document, 'pointerLockElement', {
                configurable: true,
                value: null,
              })
              dom.window.document.dispatchEvent(new dom.window.Event('pointerlockchange'))
            }
            const afterEvent = runtime.read()
            assert.equal(missionStateBytes(afterEvent), beforeEventBytes)
            if (eventKind === 'free-orbit-release') {
              assert.equal(pauseCount, 0)
              assert.equal(afterEvent.phase, 'flying')
            } else {
              assert.equal(pauseCount, 1)
              assert.equal(afterEvent.phase, 'stopped')
            }

            clock.requestStep()
            await completed
            const afterClock = runtime.read()
            assert.equal(stepCount, 1)
            if (eventKind === 'free-orbit-release') {
              assert.equal(afterClock.tick, beforeEvent.tick + 1)
            } else {
              assert.equal(afterClock.tick, beforeEvent.tick)
              assert.equal(missionStateBytes(afterClock), beforeEventBytes)
            }
          } finally {
            Object.defineProperty(dom.window.document, 'visibilityState', {
              configurable: true,
              value: 'visible',
            })
            binding.dispose()
            clock.dispose()
            runtime.exit()
          }
        },
      ),
      flightSimPropertyParameters(39),
    )
  } finally {
    selectXrNativeControllerCameraMode(previousCameraMode)
    Object.assign(globalThis, previousGlobals)
    dom.window.close()
  }
})

// Feature: knowgrph-game-flight-sim, Property 40 - Stop-then-Start resumes exact state
test('Feature: knowgrph-game-flight-sim, Property 40 - Stop-then-Start resumes exact state', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: -100, max: 100 }).filter(value => value !== 0),
      fc.integer({ min: -100, max: 100 }),
      fc.integer({ min: -100, max: 100 }),
      async (ticks, pitchPercent, rollPercent, yawPercent) => {
        const runtime = createFlightSimRuntime({ profile: PROPERTY_PROFILE })
        try {
          runtime.start()
          runtime.setInput({
            pitch: pitchPercent / 100,
            roll: rollPercent / 100,
            yaw: yawPercent / 100,
          })
          const flying = await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS * ticks)
          const heldBytes = missionStateBytes(flying)
          const stopped = runtime.stop()
          assert.equal(stopped.phase, 'stopped')
          assert.equal(missionStateBytes(stopped), heldBytes)
          const resumed = runtime.start()
          assert.equal(resumed.phase, flying.phase)
          assert.equal(resumed.tick, flying.tick)
          assert.equal(JSON.stringify(resumed.aircraft), JSON.stringify(flying.aircraft))
          assert.equal(missionStateBytes(resumed), heldBytes)
        } finally {
          runtime.exit()
        }
      },
    ),
    flightSimPropertyParameters(40),
  )
})
