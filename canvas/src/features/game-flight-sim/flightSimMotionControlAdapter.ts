import type { XrNativeControllerInput } from '@/features/three/xrNativeControllerInput'
import {
  FLIGHT_SIM_NEUTRAL_INPUT,
  stageFlightSimInputPatch,
  type FlightSimTickInput,
} from './flightSimModel'

export function flightSimInputFromMotionController(
  input: XrNativeControllerInput,
  tracked: boolean,
): FlightSimTickInput {
  if (!tracked || input.source !== 'motion') return FLIGHT_SIM_NEUTRAL_INPUT
  return stageFlightSimInputPatch(FLIGHT_SIM_NEUTRAL_INPUT, {
    pitch: -input.moveZ,
    roll: input.moveX,
    yaw: input.modifier ? -input.moveX : 0,
    throttleDelta: input.primary ? 1 : input.modifier && input.moveX === 0 ? -1 : 0,
  })
}
