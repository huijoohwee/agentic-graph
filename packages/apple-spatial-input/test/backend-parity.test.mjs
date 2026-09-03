import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  DEFAULT_FLIGHT_SIM_CAMERA_PROFILE,
  DEFAULT_FLIGHT_SIM_MODEL_PROFILE,
  FLIGHT_SIM_NEUTRAL_INPUT,
  SpatialInputError,
  arbitrateSpatialInput,
  integrateFlightModel,
  mergeFlightSimInputs,
  normalizeFlightSimInputFrame,
  resolveFlightSimFollowTarget,
} from '../dist/src/index.js'

const fixture = JSON.parse(readFileSync(new URL(
  '../../apple-spatial-input-swift/Tests/Fixtures/backend-parity.v1.json',
  import.meta.url,
)))

test('TypeScript and Swift share exact backend defaults and flight golden values', () => {
  assert.equal(fixture.schema, 'agentic-graph.apple-spatial-input-backend-parity/v1')
  assert.deepEqual(DEFAULT_FLIGHT_SIM_MODEL_PROFILE, fixture.flight.defaultProfile)
  assert.deepEqual(DEFAULT_FLIGHT_SIM_CAMERA_PROFILE, fixture.camera.defaultProfile)
  assert.deepEqual(integrateFlightModel(
    fixture.flight.previous,
    fixture.flight.input,
    fixture.flight.fixedStepSeconds,
    fixture.flight.defaultProfile,
  ), fixture.flight.expectedNext)
})

test('TypeScript and Swift share arbitration and explicit non-finite failures', () => {
  assert.deepEqual(
    mergeFlightSimInputs(fixture.arbitration.tieInputs),
    fixture.arbitration.expectedTie,
  )
  const invalidInputs = [{ pitch: 0.4 }, { pitch: Number.NaN }]
  assert.throws(
    () => arbitrateSpatialInput(invalidInputs),
    error => error instanceof SpatialInputError
      && error.code === fixture.arbitration.strictNonFiniteFailure.error
      && error.axis === fixture.arbitration.strictNonFiniteFailure.axis
      && error.sourceIndex === fixture.arbitration.strictNonFiniteFailure.sourceIndex,
  )
  const merged = mergeFlightSimInputs(invalidInputs)
  assert.equal(Number.isNaN(merged.pitch), true)
  const normalized = normalizeFlightSimInputFrame(merged, FLIGHT_SIM_NEUTRAL_INPUT)
  assert.equal(
    normalized.retainedLastValid,
    fixture.arbitration.mergeNanNormalization.retainedLastValid,
  )
  assert.deepEqual(normalized.failures, [{
    axis: fixture.arbitration.mergeNanNormalization.axis,
    reason: fixture.arbitration.mergeNanNormalization.reason,
  }])
})

test('TypeScript and Swift share every camera-mode golden target', () => {
  for (const view of ['chase', 'cockpit', 'survey']) {
    assert.deepEqual(resolveFlightSimFollowTarget(
      fixture.camera.snapshot,
      fixture.camera.coordinateScale,
      view,
      fixture.camera.defaultProfile,
    ), fixture.camera.expectedByView[view])
  }
})
