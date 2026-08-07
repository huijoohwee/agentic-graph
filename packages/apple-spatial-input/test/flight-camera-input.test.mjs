import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FLIGHT_SIM_NEUTRAL_INPUT,
  arbitrateSpatialInput,
  createFlightSimCameraProfile,
  createFlightSimModelProfile,
  integrateFlightModel,
  mergeFlightSimInputs,
  normalizeFlightSimInputFrame,
  projectFlightSimEnvelope,
  resolveFlightSimFollowTarget,
  SpatialInputError,
} from '../dist/src/index.js'

const aircraft = Object.freeze({
  position: Object.freeze([0, 0, 0]),
  velocity: Object.freeze([0, 0, -10]),
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttle: 0.5,
})

test('input arbitration is deterministic and flight merge preserves invalid frames', () => {
  assert.deepEqual(arbitrateSpatialInput([
    { pitch: 0.2, roll: -0.8 },
    { pitch: -0.7, roll: 0.4 },
  ]), { pitch: -0.7, roll: -0.8, yaw: 0, throttleDelta: 0 })
  assert.equal(mergeFlightSimInputs([{ yaw: 0.5 }, { yaw: -0.5 }]).yaw, 0.5)
  const merged = mergeFlightSimInputs([{ pitch: 0.4 }, { pitch: Number.NaN }])
  assert.equal(Number.isNaN(merged.pitch), true)
  const normalized = normalizeFlightSimInputFrame(merged, FLIGHT_SIM_NEUTRAL_INPUT)
  assert.equal(normalized.outOfRange, true)
  assert.equal(normalized.retainedLastValid, true)
  assert.equal(normalized.input.pitch, 0)
  assert.deepEqual(normalized.failures, [{ axis: 'pitch', reason: 'nan' }])
  assert.throws(
    () => arbitrateSpatialInput([{ pitch: 0.4 }, { pitch: Number.NaN }]),
    error => error instanceof SpatialInputError
      && error.code === 'nonFiniteControl'
      && error.axis === 'pitch'
      && error.sourceIndex === 1,
  )
})

test('flight model and envelope are configurable without renderer dependencies', () => {
  const baseline = integrateFlightModel(aircraft, { ...FLIGHT_SIM_NEUTRAL_INPUT, throttleDelta: 1 })
  const powerfulProfile = createFlightSimModelProfile({ thrustAcceleration: 20 })
  const powerful = integrateFlightModel(
    aircraft,
    { ...FLIGHT_SIM_NEUTRAL_INPUT, throttleDelta: 1 },
    1 / 60,
    powerfulProfile,
  )
  assert.ok(Math.hypot(...powerful.velocity) > Math.hypot(...baseline.velocity))
  assert.throws(() => createFlightSimModelProfile({ minimumControlAuthority: 2 }), /minimumControlAuthority/)
  assert.throws(() => createFlightSimModelProfile({ stallSpeedMetersPerSecond: 0 }), /stallSpeedMetersPerSecond/)
  assert.equal(projectFlightSimEnvelope({
    aircraft,
    targetSpeedMetersPerSecond: [8, 14],
    airspeedReliable: true,
  }).status, 'on-target')
})

test('camera resolver preserves canonical chase framing and accepts a visual profile', () => {
  const snapshot = { aircraft, runId: 7, tick: 11 }
  const target = resolveFlightSimFollowTarget(snapshot, 1)
  assert.deepEqual(target.target, [0, 1.7, 0])
  assert.deepEqual(target.position, [0, 4.9, 17.5])
  assert.equal(target.resetKey, 7)
  assert.equal(target.sequence, 11)
  const profile = createFlightSimCameraProfile({ chaseFovDegrees: 72 })
  assert.equal(resolveFlightSimFollowTarget(snapshot, 1, 'chase', profile).fovDegrees, 72)
  assert.throws(() => createFlightSimCameraProfile({ cockpitFovDegrees: 180 }), /cockpitFovDegrees/)
})
