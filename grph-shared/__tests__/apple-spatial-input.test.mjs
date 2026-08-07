import assert from 'node:assert/strict'
import test from 'node:test'
import {
  APPLE_SPATIAL_INPUT_SCHEMA,
  DEFAULT_APPLE_SPATIAL_INPUT_PROFILE,
  createAppleSpatialInputProfile,
  mapDeviceOrientationDeltaToScreen,
  projectAppleSpatialInput,
  resetAppleSpatialInputState,
  shortestAngleDeltaDegrees,
} from '../dist/spatial-input/appleSpatialInput.js'

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`)
}

test('versioned profile validates every user-configurable shaping bound', () => {
  const profile = createAppleSpatialInputProfile(DEFAULT_APPLE_SPATIAL_INPUT_PROFILE)
  assert.equal(profile.schema, APPLE_SPATIAL_INPUT_SCHEMA)
  assert.throws(() => createAppleSpatialInputProfile({
    ...profile,
    smoothingRatePerSecond: 0,
  }), /smoothingRatePerSecond/)
  assert.throws(() => createAppleSpatialInputProfile({
    ...profile,
    calibrationTimeoutMilliseconds: Number.NaN,
  }), /calibrationTimeoutMilliseconds/)
  assert.throws(() => createAppleSpatialInputProfile({
    ...profile,
    schema: 'unexpected.schema/v1',
  }), /schema/)
  assert.throws(() => createAppleSpatialInputProfile({
    ...profile,
    unexpectedTuning: true,
  }), /unexpectedTuning/)
})

test('screen-relative mapping covers every cardinal device rotation', () => {
  assert.deepEqual(mapDeviceOrientationDeltaToScreen(30, 8, 0), { pitchDegrees: 30, rollDegrees: 8 })
  const left = mapDeviceOrientationDeltaToScreen(30, 8, 90)
  assertClose(left.pitchDegrees, 8)
  assertClose(left.rollDegrees, -30)
  const inverted = mapDeviceOrientationDeltaToScreen(30, 8, 180)
  assertClose(inverted.pitchDegrees, -30)
  assertClose(inverted.rollDegrees, -8)
  const right = mapDeviceOrientationDeltaToScreen(30, 8, 270)
  assertClose(right.pitchDegrees, -8)
  assertClose(right.rollDegrees, 30)
  assert.equal(shortestAngleDeltaDegrees(359), -1)
  assert.equal(shortestAngleDeltaDegrees(-359), 1)
})

test('first sample is neutral and elapsed-time smoothing is refresh-rate independent', () => {
  const profile = DEFAULT_APPLE_SPATIAL_INPUT_PROFILE
  const first = projectAppleSpatialInput(resetAppleSpatialInputState(), {
    betaDegrees: 10,
    gammaDegrees: 3,
    screenAngleDegrees: 0,
    timestampMilliseconds: 0,
  }, profile)
  assert.equal(first.calibratedNow, true)
  assert.deepEqual({ pitch: first.state.pitch, roll: first.state.roll }, { pitch: 0, roll: 0 })

  const run = (stepMilliseconds, steps) => {
    let state = first.state
    for (let index = 1; index <= steps; index += 1) {
      state = projectAppleSpatialInput(state, {
        betaDegrees: 45,
        gammaDegrees: 3,
        screenAngleDegrees: 0,
        timestampMilliseconds: index * stepMilliseconds,
      }, profile).state
    }
    return state.pitch
  }

  assertClose(run(1_000 / 60, 60), run(1_000 / 120, 120), 1e-9)
})

test('jitter suppression and clamping remain deterministic', () => {
  const profile = DEFAULT_APPLE_SPATIAL_INPUT_PROFILE
  const calibrated = projectAppleSpatialInput(resetAppleSpatialInputState(), {
    betaDegrees: 0,
    gammaDegrees: 0,
    screenAngleDegrees: 0,
    timestampMilliseconds: 1_000,
  }, profile).state
  const jitter = projectAppleSpatialInput(calibrated, {
    betaDegrees: 0.5,
    gammaDegrees: -0.5,
    screenAngleDegrees: 0,
    timestampMilliseconds: 1_016,
  }, profile).state
  assert.equal(jitter.pitch, 0)
  assert.equal(jitter.roll, 0)
  const extreme = projectAppleSpatialInput(jitter, {
    betaDegrees: 170,
    gammaDegrees: 170,
    screenAngleDegrees: 0,
    timestampMilliseconds: 2_016,
  }, profile).state
  assert.ok(extreme.pitch <= 1 && extreme.roll <= 1)
})

test('non-finite sensor samples never establish calibration or change axes', () => {
  const state = resetAppleSpatialInputState()
  const projection = projectAppleSpatialInput(state, {
    betaDegrees: Number.NaN,
    gammaDegrees: 0,
    screenAngleDegrees: 0,
    timestampMilliseconds: 1_000,
  }, DEFAULT_APPLE_SPATIAL_INPUT_PROFILE)
  assert.equal(projection.calibratedNow, false)
  assert.equal(projection.state, state)

  const invalidTimestamp = projectAppleSpatialInput(state, {
    betaDegrees: 0,
    gammaDegrees: 0,
    screenAngleDegrees: 0,
    timestampMilliseconds: Number.NaN,
  }, DEFAULT_APPLE_SPATIAL_INPUT_PROFILE)
  assert.equal(invalidTimestamp.calibratedNow, false)
  assert.equal(invalidTimestamp.state, state)

  const calibrated = projectAppleSpatialInput(state, {
    betaDegrees: 0,
    gammaDegrees: 0,
    screenAngleDegrees: 0,
    timestampMilliseconds: 1_000,
  }, DEFAULT_APPLE_SPATIAL_INPUT_PROFILE).state
  const infiniteTimestamp = projectAppleSpatialInput(calibrated, {
    betaDegrees: 20,
    gammaDegrees: 10,
    screenAngleDegrees: 0,
    timestampMilliseconds: Number.POSITIVE_INFINITY,
  }, DEFAULT_APPLE_SPATIAL_INPUT_PROFILE)
  assert.equal(infiniteTimestamp.state, calibrated)
})
