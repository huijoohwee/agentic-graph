import assert from 'node:assert/strict'
import test from 'node:test'
import {
  readFlightSimSnapshot,
  reportFlightSimRenderFailure,
  resetFlightSimRuntimeForTests,
} from '../features/game-flight-sim/flightSimRuntime'

test('a render failure stops Flight Sim and publishes the local diagnostic', () => {
  resetFlightSimRuntimeForTests()
  const failed = reportFlightSimRenderFailure(
    new Error('MapLibre presentation sentinel'),
  )

  assert.equal(failed.phase, 'stopped')
  assert.match(failed.runtimeError || '', /MapLibre presentation sentinel/)
  assert.equal(readFlightSimSnapshot(), failed)
})
