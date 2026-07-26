import assert from 'node:assert/strict'
import test from 'node:test'
import { Euler, Vector3 } from 'three'

import {
  FLIGHT_SIM_AIRCRAFT_FORWARD,
  FLIGHT_SIM_AIRCRAFT_MODEL_ROTATION,
  FLIGHT_SIM_PROCEDURAL_AIRCRAFT_FORWARD,
} from '@/features/game-flight-sim/flightSimAircraftPresentation'
import { flightSimForwardVector } from '@/features/game-flight-sim/flightModel'

function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`)
}

test('Flight aircraft presentation aligns the procedural nose with model forward', () => {
  const modelOrientation = new Euler(
    ...FLIGHT_SIM_AIRCRAFT_MODEL_ROTATION,
    'XYZ',
  )
  const presentedForward = new Vector3(
    ...FLIGHT_SIM_PROCEDURAL_AIRCRAFT_FORWARD,
  ).applyEuler(modelOrientation)

  presentedForward.toArray().forEach((value, axis) => {
    near(value, FLIGHT_SIM_AIRCRAFT_FORWARD[axis])
  })

  for (const [pitch, yaw, roll] of [
    [0, 0, 0],
    [0.18, -0.62, 0.31],
    [-0.24, 1.17, -0.48],
  ]) {
    const actorOrientation = new Euler(pitch, yaw, -roll, 'YXZ')
    const visualForward = presentedForward.clone().applyEuler(actorOrientation)
    const simulatedForward = flightSimForwardVector(pitch, yaw)
    visualForward.toArray().forEach((value, axis) => {
      near(value, simulatedForward[axis])
    })
  }
})
