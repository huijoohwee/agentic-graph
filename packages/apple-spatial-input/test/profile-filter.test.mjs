import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  APPLE_SPATIAL_INPUT_SCHEMA,
  DEFAULT_APPLE_SPATIAL_INPUT_PROFILE,
  createAppleSpatialInputProfile,
  mapDeviceOrientationDeltaToScreen,
  projectAppleSpatialInput,
  resetAppleSpatialInputState,
} from '../dist/src/index.js'

test('profile validation and JSON schema share the canonical bounds', () => {
  const profile = createAppleSpatialInputProfile(DEFAULT_APPLE_SPATIAL_INPUT_PROFILE)
  assert.equal(profile.schema, APPLE_SPATIAL_INPUT_SCHEMA)
  assert.throws(() => createAppleSpatialInputProfile({ ...profile, extra: true }), /Unknown/)
  assert.throws(() => createAppleSpatialInputProfile({ ...profile, controlRangeDegrees: 4 }), /controlRangeDegrees/)
  const schema = JSON.parse(readFileSync(new URL('../schema/apple-spatial-input-profile.v1.schema.json', import.meta.url)))
  assert.equal(schema.properties.schema.const, APPLE_SPATIAL_INPUT_SCHEMA)
  assert.equal(schema.properties.controlRangeDegrees.minimum, 5)
  assert.equal(schema.properties.calibrationTimeoutMilliseconds.maximum, 10_000)
})

test('filter preserves calibration semantics and rejects non-finite timestamps', () => {
  const initial = resetAppleSpatialInputState()
  const rejected = projectAppleSpatialInput(initial, {
    betaDegrees: 10,
    gammaDegrees: 20,
    screenAngleDegrees: 0,
    timestampMilliseconds: Number.NaN,
  }, DEFAULT_APPLE_SPATIAL_INPUT_PROFILE)
  assert.equal(rejected.state, initial)
  assert.equal(rejected.calibratedNow, false)

  const calibrated = projectAppleSpatialInput(initial, {
    betaDegrees: 10,
    gammaDegrees: 20,
    screenAngleDegrees: 0,
    timestampMilliseconds: 1_000,
  }, DEFAULT_APPLE_SPATIAL_INPUT_PROFILE)
  assert.equal(calibrated.calibratedNow, true)
  const moved = projectAppleSpatialInput(calibrated.state, {
    betaDegrees: 30,
    gammaDegrees: 20,
    screenAngleDegrees: 0,
    timestampMilliseconds: 1_100,
  }, DEFAULT_APPLE_SPATIAL_INPUT_PROFILE)
  assert.ok(moved.state.pitch > 0)
  assert.equal(moved.state.roll, 0)
})

test('screen mapping follows the current page orientation', () => {
  const portrait = mapDeviceOrientationDeltaToScreen(10, 4, 0)
  assert.deepEqual(portrait, { pitchDegrees: 10, rollDegrees: 4 })
  const landscape = mapDeviceOrientationDeltaToScreen(10, 4, 90)
  assert.ok(Math.abs(landscape.pitchDegrees - 4) < 1e-10)
  assert.ok(Math.abs(landscape.rollDegrees + 10) < 1e-10)
})
