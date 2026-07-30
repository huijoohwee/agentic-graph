import assert from 'node:assert/strict'
import test from 'node:test'
import fc from 'fast-check'
import { flightSimPropertyParameters } from './helpers/flightSimPropertyHarness'
import { flightSimInputFromMotionController } from '@/features/game-flight-sim/flightSimMotionControlAdapter'
import { FLIGHT_SIM_NEUTRAL_INPUT } from '@/features/game-flight-sim/flightSimModel'
import {
  createXrNativeControllerInput,
  type XrNativeControllerInputSource,
} from '@/features/three/xrNativeControllerInput'

// Feature: knowgrph-game-flight-sim, Property 28 - Motion_Control is optional input only
test('Feature: knowgrph-game-flight-sim, Property 28 - Motion_Control is optional input only', () => {
  fc.assert(
    fc.property(
      fc.double({ min: -2, max: 2, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: -2, max: 2, noNaN: true, noDefaultInfinity: true }),
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      fc.constantFrom<XrNativeControllerInputSource>(
        'motion',
        'keyboard',
        'gamepad',
        'none',
      ),
      (moveX, moveZ, primary, modifier, tracked, source) => {
        const controller = createXrNativeControllerInput({
          moveX,
          moveZ,
          primary,
          modifier,
          source,
        })
        const frame = flightSimInputFromMotionController(controller, tracked)
        assert.deepEqual(Object.keys(frame).sort(), [
          'pitch',
          'roll',
          'throttleDelta',
          'yaw',
        ])
        if (!tracked || source !== 'motion') {
          assert.deepEqual(frame, FLIGHT_SIM_NEUTRAL_INPUT)
          return
        }
        for (const value of [
          frame.pitch,
          frame.roll,
          frame.yaw,
          frame.throttleDelta,
        ]) {
          assert.ok(Number.isFinite(value))
          assert.ok(value >= -1 && value <= 1)
        }
        assert.equal(frame.pitch, -controller.moveZ)
        assert.equal(frame.roll, controller.moveX)
        assert.equal(frame.yaw, modifier ? -controller.moveX : 0)
        assert.equal(
          frame.throttleDelta,
          primary ? 1 : modifier && controller.moveX === 0 ? -1 : 0,
        )
      },
    ),
    flightSimPropertyParameters(28),
  )
})
