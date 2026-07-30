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
    new Error('optional beacon GLB parse sentinel'),
  )

  assert.equal(failed.phase, 'stopped')
  assert.match(failed.runtimeError || '', /optional beacon GLB parse sentinel/)
  assert.equal(readFlightSimSnapshot(), failed)
})
