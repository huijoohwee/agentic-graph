import fc from 'fast-check'
import {
  FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
  normalizeFlightSimInput,
  type FlightSimSpatialProfile,
  type FlightSimTickInput,
} from '../../features/game-flight-sim/flightSimModel'
import type { FlightSimReplayInput } from '../../features/game-flight-sim/flightSimReplay'

const finiteUnitDouble = fc.double({
  min: -1,
  max: 1,
  noNaN: true,
  noDefaultInfinity: true,
})

const nonZeroUnitDouble = fc.oneof(
  fc.double({
    min: -1,
    max: -0.001,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  fc.double({
    min: 0.001,
    max: 1,
    noNaN: true,
    noDefaultInfinity: true,
  }),
)

export const flightSimNormalizedInputArbitrary: fc.Arbitrary<FlightSimTickInput> = fc.record({
  pitch: finiteUnitDouble,
  roll: finiteUnitDouble,
  yaw: finiteUnitDouble,
  throttleDelta: finiteUnitDouble,
}).map(normalizeFlightSimInput)

export const flightSimActiveInputArbitrary: fc.Arbitrary<FlightSimTickInput> = fc.record({
  pitch: nonZeroUnitDouble,
  roll: finiteUnitDouble,
  yaw: finiteUnitDouble,
  throttleDelta: finiteUnitDouble,
}).map(normalizeFlightSimInput)

export const flightSimThrottleSetpointArbitrary = fc.option(
  fc.double({
    min: 0,
    max: 1,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  { nil: null },
)

export const flightSimSeedArbitrary = fc.integer({
  min: 1,
  max: 1_000_000_000,
}).map(value => `flight-sim:property-seed:${value}`)

export function flightSimPropertyProfile(
  withCollisionWall = false,
): FlightSimSpatialProfile {
  return Object.freeze({
    id: 'flight-sim:simulation-property',
    sourceKey: 'authored:simulation-property',
    aircraftHalfSize: Object.freeze([0.4, 0.4, 0.4] as const),
    spawn: Object.freeze({
      position: Object.freeze([0, 10, 5] as const),
      velocity: Object.freeze([0, 0, -8] as const),
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttle: 0.55,
    }),
    blockers: Object.freeze(withCollisionWall ? [Object.freeze({
      id: 'property-collision-wall',
      center: Object.freeze([0, 10, 4.45] as const),
      halfSize: Object.freeze([5, 5, 0.05] as const),
    })] : []),
    waypoints: Object.freeze([
      Object.freeze({
        id: 'property-waypoint-1',
        position: Object.freeze([0, 10, -1_000] as const),
        radiusMeters: FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
      }),
      Object.freeze({
        id: 'property-waypoint-2',
        position: Object.freeze([0, 10, -2_000] as const),
        radiusMeters: FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
      }),
      Object.freeze({
        id: 'property-waypoint-3',
        position: Object.freeze([0, 10, -3_000] as const),
        radiusMeters: FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
      }),
    ]),
    landingPad: Object.freeze({
      id: 'property-landing-pad',
      position: Object.freeze([0, 0, -4_000] as const),
      radiusMeters: FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
    }),
  })
}

export function asFlightSimReplayInputs(
  frames: readonly Readonly<{
    controls: FlightSimTickInput
    throttleSetpoint: number | null
  }>[],
): readonly FlightSimReplayInput[] {
  return Object.freeze(frames.map((frame, index) => Object.freeze({
    tickIndex: index + 1,
    controls: frame.controls,
    throttleSetpoint: frame.throttleSetpoint,
  })))
}
