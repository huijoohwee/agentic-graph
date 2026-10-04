import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FLIGHT_SIM_SIMULATION_SPEEDS,
  readFlightSimPresentationSettings,
  resetFlightSimPresentationSettings,
  subscribeFlightSimPresentationSettings,
  updateFlightSimPresentationSettings,
  type FlightSimPresentationSettingsPatch,
} from '../features/game-flight-sim/flightSimPresentationSettings'
import { createFlightSimSimulationClock } from '../features/game-flight-sim/flightSimSimulationClock'
import { FLIGHT_SIM_FIXED_STEP_SECONDS } from '../features/game-flight-sim/flightSimModel'
import {
  createFlightSimMission,
  disposeFlightSimMission,
  tickFlightSimMission,
} from '../features/game-flight-sim/flightSimMission'
import { serializeFlightSimCapture } from '../features/game-flight-sim/flightSimReplay'
import { flightSimPropertyProfile } from './helpers/flightSimSimulationPropertyFixtures'

const intervalMs = FLIGHT_SIM_FIXED_STEP_SECONDS * 1_000
const settle = () => new Promise<void>(resolve => setImmediate(resolve))

function virtualTime() {
  let time = 0
  let nextHandle = 0
  const pending = new Map<number, { at: number; callback: () => void }>()
  return {
    now: () => time,
    schedule(callback: () => void, delayMs: number) {
      const handle = ++nextHandle
      pending.set(handle, { at: time + delayMs, callback })
      return handle
    },
    cancel(handle: unknown) { pending.delete(handle as number) },
    pending: () => pending.size,
    async advanceTo(target: number) {
      for (let calls = 0; calls < 1_000; calls += 1) {
        const next = [...pending].sort((a, b) => a[1].at - b[1].at)[0]
        if (!next || next[1].at > target) { time = target; return }
        pending.delete(next[0])
        time = next[1].at + 1e-7
        next[1].callback()
        await settle()
      }
      assert.fail('Virtual clock failed to settle within its callback bound.')
    },
  }
}

test.afterEach(() => resetFlightSimPresentationSettings())

test('presentation preferences publish one immutable atomic update and keep independent visibility', () => {
  resetFlightSimPresentationSettings()
  const initial = readFlightSimPresentationSettings()
  let notifications = 0
  const unsubscribe = subscribeFlightSimPresentationSettings(() => { notifications += 1 })
  try {
    assert.equal(updateFlightSimPresentationSettings({ simulationSpeed: 1 }), initial)
    const changed = updateFlightSimPresentationSettings({
      simulationSpeed: 0.5, overlaysVisible: false,
    })
    assert.ok(Object.isFrozen(changed))
    assert.equal(changed.navigationVisible, true)
    assert.equal(changed.revision, initial.revision + 1)
    assert.equal(notifications, 1)
    const restored = resetFlightSimPresentationSettings()
    assert.equal(restored.simulationSpeed, 1)
    assert.equal(restored.overlaysVisible, true)
    assert.equal(restored.navigationVisible, true)
    assert.equal(notifications, 2)
  } finally { unsubscribe() }
  updateFlightSimPresentationSettings({ navigationVisible: false })
  assert.equal(notifications, 2)
})

test('invalid rates, visibility, unknown keys and mixed patches preserve the prior settings', () => {
  const before = readFlightSimPresentationSettings()
  for (const patch of [
    null, [], { simulationSpeed: 0 }, { simulationSpeed: 1.5 },
    { simulationSpeed: '2' }, { simulationSpeed: NaN }, { simulationSpeed: undefined },
    { overlaysVisible: 0 }, { navigationVisible: 'false' }, { revision: 99 },
    { overlaysVisible: false, simulationSpeed: 4 }, { unsupported: true },
  ]) {
    assert.throws(() => updateFlightSimPresentationSettings(
      patch as unknown as FlightSimPresentationSettingsPatch,
    ))
    assert.equal(readFlightSimPresentationSettings(), before)
  }
})

test('simulation speeds schedule 30, 60 and 120 serial fixed steps per virtual second', async () => {
  for (const speed of FLIGHT_SIM_SIMULATION_SPEEDS) {
    updateFlightSimPresentationSettings({ simulationSpeed: speed })
    const time = virtualTime()
    const starts: number[] = []
    const clock = createFlightSimSimulationClock({
      minimumStepIntervalMs: intervalMs,
      readMinimumStepIntervalMs: () => (
        intervalMs / readFlightSimPresentationSettings().simulationSpeed
      ),
      now: time.now, schedule: time.schedule, cancelScheduled: time.cancel,
      runStep: async () => { starts.push(time.now()) },
      onStepError: error => assert.fail(String(error)),
    })
    try {
      for (let poll = 0; poll < 120; poll += 1) {
        await time.advanceTo(poll * intervalMs / 2)
        clock.requestStep()
        await settle()
      }
      await time.advanceTo(1_000 - 1e-7)
      assert.equal(starts.length, 60 * speed)
      for (let index = 1; index < starts.length; index += 1) {
        assert.ok(starts[index]! - starts[index - 1]! >= intervalMs / speed - 1e-6)
      }
    } finally { clock.dispose() }
    assert.equal(time.pending(), 0)
  }
})

test('a faster preference replaces a pending slow wake without concurrent steps', async () => {
  const time = virtualTime()
  let interval = intervalMs * 2
  let steps = 0
  let release: () => void = () => {}
  const blocked = new Promise<void>(resolve => { release = resolve })
  const clock = createFlightSimSimulationClock({
    minimumStepIntervalMs: intervalMs,
    readMinimumStepIntervalMs: () => interval,
    now: time.now, schedule: time.schedule, cancelScheduled: time.cancel,
    runStep: async () => { steps += 1; if (steps === 2) await blocked },
    onStepError: error => assert.fail(String(error)),
  })
  try {
    clock.requestStep()
    await settle()
    await time.advanceTo(1)
    clock.requestStep()
    assert.equal(time.pending(), 1)
    interval = intervalMs / 2
    clock.requestStep()
    await time.advanceTo(10)
    assert.equal(steps, 2)
    clock.requestStep()
    clock.requestStep()
    await time.advanceTo(50)
    assert.equal(steps, 2)
    release()
    await settle()
    assert.equal(steps, 3)
    clock.dispose()
    clock.requestStep()
    await time.advanceTo(100)
    assert.equal(steps, 3)
  } finally { release(); clock.dispose() }
})

test('disposal before a queued step starts prevents its callback', async () => {
  let steps = 0
  const clock = createFlightSimSimulationClock({
    minimumStepIntervalMs: 0,
    runStep: async () => { steps += 1 },
    onStepError: error => assert.fail(String(error)),
  })
  clock.requestStep()
  clock.dispose()
  await settle()
  assert.equal(steps, 0)
})

test('different wall speeds retain byte-equivalent state for identical fixed-tick inputs', async () => {
  const captures: string[][] = []
  for (const speed of FLIGHT_SIM_SIMULATION_SPEEDS) {
    const time = virtualTime()
    const mission = createFlightSimMission({
      profile: flightSimPropertyProfile(), runId: 1, seed: 'clock-equivalence',
    })
    const frames: string[] = []
    const clock = createFlightSimSimulationClock({
      minimumStepIntervalMs: intervalMs / speed,
      now: time.now, schedule: time.schedule, cancelScheduled: time.cancel,
      runStep: async () => {
        const result = await tickFlightSimMission(
          mission, { pitch: 0.02, roll: 0, yaw: 0, throttleDelta: 0 }, 0.6,
        )
        frames.push(serializeFlightSimCapture(result.capture))
        assert.equal(result.capture.tick, frames.length)
      },
      onStepError: error => assert.fail(String(error)),
    })
    try {
      for (let tick = 0; tick < 24; tick += 1) {
        await time.advanceTo(time.now() + intervalMs / speed + 1e-5)
        clock.requestStep()
        await settle()
      }
      assert.equal(frames.length, 24)
      captures.push(frames)
    } finally { clock.dispose(); disposeFlightSimMission(mission) }
  }
  assert.deepEqual(captures[0], captures[1])
  assert.deepEqual(captures[1], captures[2])
})
