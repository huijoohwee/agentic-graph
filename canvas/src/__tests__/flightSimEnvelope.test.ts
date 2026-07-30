import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FLIGHT_SIM_FULL_CONTROL_SPEED_METERS_PER_SECOND,
  FLIGHT_SIM_MINIMUM_CONTROL_AUTHORITY,
  FLIGHT_SIM_STALL_SPEED_METERS_PER_SECOND,
  flightSimControlAuthority,
  flightSimStallSeverity,
  projectFlightSimEnvelope,
} from '@/features/game-flight-sim/flightSimEnvelope'
import { integrateFlightModel } from '@/features/game-flight-sim/flightModel'
import { FLIGHT_SIM_NEUTRAL_INPUT } from '@/features/game-flight-sim/flightSimModel'

function aircraft(
  airspeed: number,
  attitude: Readonly<{ pitch?: number; roll?: number }> = {},
) {
  return Object.freeze({
    position: Object.freeze([0, 20, 0] as const),
    velocity: Object.freeze([0, 0, -airspeed] as const),
    pitch: attitude.pitch ?? 0,
    roll: attitude.roll ?? 0,
    yaw: 0,
    throttle: 0.62,
  })
}

test('control authority is bounded, monotonic, and full at the authored cruise threshold', () => {
  assert.equal(flightSimControlAuthority(0), FLIGHT_SIM_MINIMUM_CONTROL_AUTHORITY)
  assert.equal(flightSimControlAuthority(FLIGHT_SIM_FULL_CONTROL_SPEED_METERS_PER_SECOND), 1)
  assert.equal(flightSimControlAuthority(48), 1)
  assert.ok(flightSimControlAuthority(6) < flightSimControlAuthority(10))
  assert.equal(flightSimStallSeverity(FLIGHT_SIM_STALL_SPEED_METERS_PER_SECOND), 0)
  assert.equal(flightSimStallSeverity(0), 1)
  assert.throws(() => flightSimControlAuthority(Number.NaN), /finite non-negative/)
})

test('low-speed integration reduces control response and applies a deterministic nose drop', () => {
  const input = Object.freeze({ pitch: 1, roll: 1, yaw: 1, throttleDelta: 0 })
  const lowSpeed = integrateFlightModel(aircraft(4), input)
  const cruise = integrateFlightModel(aircraft(12), input)
  assert.ok(lowSpeed.pitch < cruise.pitch)
  assert.ok(Math.abs(lowSpeed.roll) < Math.abs(cruise.roll))
  assert.ok(Math.abs(lowSpeed.yaw) < Math.abs(cruise.yaw))

  const stalled = integrateFlightModel(aircraft(0), FLIGHT_SIM_NEUTRAL_INPUT)
  assert.ok(stalled.pitch < 0)
  assert.deepEqual(
    integrateFlightModel(aircraft(0), FLIGHT_SIM_NEUTRAL_INPUT),
    stalled,
  )
})

test('flight envelope prioritizes instrument, stall, attitude, and target-speed guidance', () => {
  const projection = (
    airspeed: number,
    options: Readonly<{ reliable?: boolean; pitch?: number; roll?: number }> = {},
  ) => projectFlightSimEnvelope({
    aircraft: aircraft(airspeed, options),
    targetSpeedMetersPerSecond: [8, 22],
    airspeedReliable: options.reliable ?? true,
  })

  assert.equal(projection(12).status, 'on-target')
  assert.equal(projection(7.5).status, 'low-energy')
  assert.equal(projection(6).status, 'stall-risk')
  assert.equal(projection(24).status, 'high-energy')
  assert.equal(projection(12, { pitch: 0.4 }).status, 'pitch-limit')
  assert.equal(projection(12, { roll: 0.5 }).status, 'bank-limit')
  assert.equal(projection(6, { reliable: false }).status, 'instrument-uncertain')
  assert.equal(Object.isFrozen(projection(12)), true)
  assert.deepEqual(projection(12).targetSpeedMetersPerSecond, [8, 22])
})
