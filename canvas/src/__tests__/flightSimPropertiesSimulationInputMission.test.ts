import assert from 'node:assert/strict'
import test from 'node:test'
import fc from 'fast-check'
import { flightSimPropertyParameters } from './helpers/flightSimPropertyHarness'
import { integrateFlightModel } from '@/features/game-flight-sim/flightModel'
import { mergeFlightSimInputs } from '@/features/game-flight-sim/flightSimInput'
import {
  captureFlightSimMission,
  createFlightSimMission,
  disposeFlightSimMission,
  tickFlightSimMission,
  type FlightSimMission,
  type FlightSimMissionCapture,
} from '@/features/game-flight-sim/flightSimMission'
import {
  FLIGHT_SIM_COLLISION_SEPARATION_METERS,
  FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
  normalizeFlightSimInputFrame,
  type FlightSimAircraftState,
  type FlightSimBlocker,
  type FlightSimInputPatch,
  type FlightSimSpatialProfile,
  type FlightSimTickInput,
} from '@/features/game-flight-sim/flightSimModel'
import { resolveFlightSimAabbMotion } from '@/features/game-flight-sim/flightSimSpatialProfile'

type Vector3 = readonly [number, number, number]
type InputField = keyof FlightSimTickInput

const finiteDouble = (minimum: number, maximum: number) => fc.double({
  min: minimum,
  max: maximum,
  noNaN: true,
  noDefaultInfinity: true,
})
const unitArbitrary = finiteDouble(-1, 1)
const vector = (x: number, y: number, z: number): Vector3 => Object.freeze([x, y, z])
const inputArbitrary = fc.record({
  pitch: unitArbitrary,
  roll: unitArbitrary,
  yaw: unitArbitrary,
  throttleDelta: unitArbitrary,
})
const aircraftArbitrary = fc.record({
  position: fc.tuple(
    finiteDouble(-10_000, 10_000),
    finiteDouble(-10_000, 10_000),
    finiteDouble(-10_000, 10_000),
  ),
  velocity: fc.tuple(
    finiteDouble(-64, 64),
    finiteDouble(-64, 64),
    finiteDouble(-64, 64),
  ),
  pitch: finiteDouble(-Math.PI, Math.PI),
  roll: finiteDouble(-Math.PI, Math.PI),
  yaw: finiteDouble(-Math.PI, Math.PI),
  throttle: finiteDouble(0, 1),
}).map(value => Object.freeze({
  ...value,
  position: Object.freeze(value.position),
  velocity: Object.freeze(value.velocity),
}) as FlightSimAircraftState)

function aircraft(
  position: Vector3,
  velocity: Vector3,
  throttle = 0.5,
): FlightSimAircraftState {
  return Object.freeze({
    position,
    velocity,
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttle,
  })
}

function collisionProfile(
  aircraftHalfSize: Vector3,
  blockers: readonly FlightSimBlocker[],
): Pick<FlightSimSpatialProfile, 'aircraftHalfSize' | 'blockers'> {
  return Object.freeze({ aircraftHalfSize, blockers: Object.freeze([...blockers]) })
}

function maximumMagnitudeValue(
  inputs: readonly FlightSimInputPatch[],
  field: InputField,
): number {
  return inputs.reduce((selected, input) => {
    const candidate = input[field] ?? 0
    return Math.abs(candidate) > Math.abs(selected) ? candidate : selected
  }, 0)
}

function routeProfile(args: Readonly<{
  originX: number
  originZ: number
  altitude: number
  spacing: number
  radius: number
}>): FlightSimSpatialProfile {
  const point = (id: string, index: number) => Object.freeze({
    id,
    position: vector(
      args.originX + index * 7,
      args.altitude,
      args.originZ - args.spacing * index,
    ),
    radiusMeters: args.radius,
  })
  return Object.freeze({
    id: 'flight-sim:property-route',
    sourceKey: 'authored:property-route',
    aircraftHalfSize: vector(0.4, 0.4, 0.4),
    spawn: aircraft(vector(args.originX, args.altitude, args.originZ), vector(0, 0, 0)),
    blockers: Object.freeze([]),
    waypoints: Object.freeze([
      point('property-waypoint-1', 1),
      point('property-waypoint-2', 2),
      point('property-waypoint-3', 3),
    ]),
    landingPad: point('property-landing-pad', 4),
  })
}

function missionAt(
  mission: FlightSimMission,
  capture: FlightSimMissionCapture,
  position: Vector3,
): FlightSimMission {
  const repositioned = createFlightSimMission({
    runId: mission.runId,
    seed: mission.seed,
    profile: mission.profile,
    initialCapture: Object.freeze({
      ...capture,
      aircraft: aircraft(position, vector(0, 0, 0), capture.aircraft.throttle),
    }),
  })
  disposeFlightSimMission(mission)
  return repositioned
}

// Feature: knowgrph-game-flight-sim, Property 13 - Flight integration stays finite and bounded
test('Feature: knowgrph-game-flight-sim, Property 13 - Flight integration stays finite and bounded', () => {
  fc.assert(
    fc.property(aircraftArbitrary, inputArbitrary, (previous, input) => {
      const next = integrateFlightModel(previous, input)
      const repeated = integrateFlightModel(previous, input)
      assert.deepEqual(next, repeated)
      for (const value of [
        ...next.position,
        ...next.velocity,
        next.pitch,
        next.roll,
        next.yaw,
        next.throttle,
      ]) assert.equal(Number.isFinite(value), true)
      assert.ok(Math.abs(next.pitch) <= Math.PI)
      assert.ok(Math.abs(next.roll) <= Math.PI)
      assert.ok(Math.abs(next.yaw) <= Math.PI)
      assert.ok(Math.hypot(...next.velocity) <= 48 + 1e-10)
      assert.ok(next.throttle >= 0 && next.throttle <= 1)
    }),
    flightSimPropertyParameters(13),
  )
})

const outsideUnitArbitrary = fc.oneof(
  finiteDouble(1.000_001, 1_000),
  finiteDouble(-1_000, -1.000_001),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY),
  fc.constant(Number.NaN),
)

// Feature: knowgrph-game-flight-sim, Property 14 - Input clamping to valid ranges
test('Feature: knowgrph-game-flight-sim, Property 14 - Input clamping to valid ranges', () => {
  fc.assert(
    fc.property(
      fc.constantFrom<InputField>('pitch', 'roll', 'yaw', 'throttleDelta'),
      outsideUnitArbitrary,
      inputArbitrary,
      inputArbitrary,
      aircraftArbitrary,
      (field, invalidValue, base, lastValid, previous) => {
        const normalized = normalizeFlightSimInputFrame(
          { ...base, [field]: invalidValue },
          lastValid,
        )
        const expected = Number.isNaN(invalidValue)
          ? lastValid[field]
          : Math.max(-1, Math.min(1, invalidValue))
        assert.equal(normalized.input[field], expected)
        assert.equal(normalized.outOfRange, true)
        assert.equal(normalized.retainedLastValid, Number.isNaN(invalidValue))
        for (const value of Object.values(normalized.input)) {
          assert.ok(value >= -1 && value <= 1)
        }
        const integrated = integrateFlightModel(previous, normalized.input)
        assert.equal([
          ...integrated.position,
          ...integrated.velocity,
          integrated.pitch,
          integrated.roll,
          integrated.yaw,
          integrated.throttle,
        ].every(Number.isFinite), true)
      },
    ),
    flightSimPropertyParameters(14),
  )
})

// Feature: knowgrph-game-flight-sim, Property 15 - Swept AABB collision yields a non-penetrating result
test('Feature: knowgrph-game-flight-sim, Property 15 - Swept AABB collision yields a non-penetrating result', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 2 }),
      fc.constantFrom(-1, 1),
      finiteDouble(0.05, 2),
      finiteDouble(0.1, 3),
      finiteDouble(0.2, 2),
      finiteDouble(0.5, 4),
      fc.tuple(finiteDouble(-20, 20), finiteDouble(-20, 20)),
      (axis, sign, aircraftHalf, gap, blockerHalf, travel, tangentialVelocity) => {
        const halfSize = vector(aircraftHalf, aircraftHalf, aircraftHalf)
        const blocker: FlightSimBlocker = Object.freeze({
          id: 'property-sweep-blocker',
          center: vector(0, 0, 0),
          halfSize: vector(blockerHalf, blockerHalf, blockerHalf),
        })
        const start = [0, 0, 0] as [number, number, number]
        const end = [0, 0, 0] as [number, number, number]
        const velocity = [tangentialVelocity[0], tangentialVelocity[1], 0] as [
          number,
          number,
          number,
        ]
        start[axis] = sign * (aircraftHalf + blockerHalf + gap)
        end[axis] = -sign * (aircraftHalf + blockerHalf + travel)
        velocity[axis] = -sign * 12
        const previous = aircraft(vector(...start), vector(...velocity))
        const proposed = aircraft(vector(...end), vector(...velocity))
        const empty = resolveFlightSimAabbMotion(
          previous,
          proposed,
          collisionProfile(halfSize, []),
        )
        assert.equal(empty.collisionId, null)
        assert.deepEqual(empty.state, proposed)

        const hit = resolveFlightSimAabbMotion(
          previous,
          proposed,
          collisionProfile(halfSize, [blocker]),
        )
        assert.equal(hit.collisionId, blocker.id)
        const separation = Math.abs(hit.state.position[axis])
          - (aircraftHalf + blockerHalf)
        assert.ok(separation >= FLIGHT_SIM_COLLISION_SEPARATION_METERS - 1e-9)
        assert.ok(Math.abs(hit.state.velocity[axis]) <= 0.0001)
        for (const tangentAxis of [0, 1, 2]) {
          if (tangentAxis !== axis) {
            assert.equal(hit.state.velocity[tangentAxis], proposed.velocity[tangentAxis])
          }
        }
      },
    ),
    flightSimPropertyParameters(15),
  )
})

// Feature: knowgrph-game-flight-sim, Property 16 - Earliest-hit selection with stable tie-break
test('Feature: knowgrph-game-flight-sim, Property 16 - Earliest-hit selection with stable tie-break', () => {
  fc.assert(
    fc.property(
      finiteDouble(2, 6),
      finiteDouble(1, 4),
      fc.boolean(),
      fc.boolean(),
      (nearCenter, distance, tie, reverse) => {
        const near: FlightSimBlocker = Object.freeze({
          id: tie ? 'z-tie' : 'z-near',
          center: vector(0, 0, nearCenter),
          halfSize: vector(2, 2, 0.2),
        })
        const other: FlightSimBlocker = Object.freeze({
          id: tie ? 'a-tie' : 'a-far',
          center: vector(0, 0, tie ? nearCenter : nearCenter - distance),
          halfSize: vector(2, 2, 0.2),
        })
        const blockers = reverse ? [other, near] : [near, other]
        const result = resolveFlightSimAabbMotion(
          aircraft(vector(0, 0, 10), vector(0, 0, -20)),
          aircraft(vector(0, 0, -10), vector(0, 0, -20)),
          collisionProfile(vector(0.5, 0.5, 0.5), blockers),
        )
        assert.equal(result.collisionId, tie ? 'a-tie' : 'z-near')
      },
    ),
    flightSimPropertyParameters(16),
  )
})

// Feature: knowgrph-game-flight-sim, Property 17 - Start-of-tick penetration is resolved
test('Feature: knowgrph-game-flight-sim, Property 17 - Start-of-tick penetration is resolved', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 2 }),
      fc.constantFrom(-1, 1),
      finiteDouble(0.01, 0.4),
      finiteDouble(0.1, 20),
      fc.tuple(finiteDouble(-20, 20), finiteDouble(-20, 20)),
      (axis, sign, penetration, inwardSpeed, tangentialVelocity) => {
        const halfSize = vector(0.5, 0.5, 0.5)
        const blocker: FlightSimBlocker = Object.freeze({
          id: 'property-overlap-blocker',
          center: vector(0, 0, 0),
          halfSize: vector(2, 2, 2),
        })
        const position = [0, 0, 0] as [number, number, number]
        const velocity = [tangentialVelocity[0], tangentialVelocity[1], 0] as [
          number,
          number,
          number,
        ]
        position[axis] = sign * (2.5 - penetration)
        velocity[axis] = -sign * inwardSpeed
        const overlapping = aircraft(vector(...position), vector(...velocity))
        const result = resolveFlightSimAabbMotion(
          overlapping,
          overlapping,
          collisionProfile(halfSize, [blocker]),
        )
        assert.equal(result.collisionId, blocker.id)
        const separation = Math.abs(result.state.position[axis]) - 2.5
        assert.ok(separation >= FLIGHT_SIM_COLLISION_SEPARATION_METERS - 1e-9)
        assert.ok(Math.abs(
          Math.abs(result.state.position[axis] - overlapping.position[axis])
            - (penetration + FLIGHT_SIM_COLLISION_SEPARATION_METERS),
        ) <= 1e-9)
        assert.equal(result.state.velocity[axis], 0)
        for (const tangentAxis of [0, 1, 2]) {
          if (tangentAxis !== axis) {
            assert.equal(result.state.velocity[tangentAxis], overlapping.velocity[tangentAxis])
          }
        }
      },
    ),
    flightSimPropertyParameters(17),
  )
})

// Feature: knowgrph-game-flight-sim, Property 27 - Normalized input frame composition
test('Feature: knowgrph-game-flight-sim, Property 27 - Normalized input frame composition', () => {
  fc.assert(
    fc.property(
      fc.tuple(inputArbitrary, inputArbitrary, inputArbitrary, inputArbitrary),
      fc.boolean(),
      finiteDouble(0, 1),
      (generatedInputs, hasInput, priorThrottle) => {
        const inputs: readonly FlightSimInputPatch[] = hasInput
          ? generatedInputs
          : [{}, {}, {}, {}]
        const frame = mergeFlightSimInputs(inputs)
        assert.equal(Object.isFrozen(frame), true)
        assert.deepEqual(Object.keys(frame).sort(), [
          'pitch',
          'roll',
          'throttleDelta',
          'yaw',
        ])
        for (const field of ['pitch', 'roll', 'yaw', 'throttleDelta'] as const) {
          assert.equal(frame[field], maximumMagnitudeValue(inputs, field))
          assert.ok(frame[field] >= -1 && frame[field] <= 1)
        }
        const next = integrateFlightModel(
          aircraft(vector(0, 10, 0), vector(0, 0, -8), priorThrottle),
          frame,
        )
        assert.ok(next.throttle >= 0 && next.throttle <= 1)
        if (!hasInput) {
          assert.deepEqual(frame, { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0 })
          assert.equal(next.throttle, priorThrottle)
        }
      },
    ),
    flightSimPropertyParameters(27),
  )
})

const routeArbitrary = fc.record({
  originX: finiteDouble(-100, 100),
  originZ: finiteDouble(-100, 100),
  altitude: finiteDouble(5, 30),
  spacing: finiteDouble(450, 700),
  radius: finiteDouble(
    FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
    200,
  ),
  outOfOrderIndex: fc.integer({ min: 1, max: 2 }),
})

// Feature: knowgrph-game-flight-sim, Property 29 - Ordered waypoint progression to terminal success
test('Feature: knowgrph-game-flight-sim, Property 29 - Ordered waypoint progression to terminal success', async () => {
  await fc.assert(
    fc.asyncProperty(routeArbitrary, async route => {
      const spatial = routeProfile(route)
      let mission = createFlightSimMission({ runId: 1, profile: spatial })
      try {
        mission = missionAt(
          mission,
          captureFlightSimMission(mission),
          spatial.waypoints[route.outOfOrderIndex]!.position,
        )
        const outOfOrder = await tickFlightSimMission(mission, {
          pitch: 0,
          roll: 0,
          yaw: 0,
          throttleDelta: 0,
        })
        assert.equal(outOfOrder.capture.waypointIndex, 0)
        assert.equal(
          outOfOrder.decisions.some(item => item.payload.event === 'waypoint_reached'),
          false,
        )

        let capture = outOfOrder.capture
        for (let index = 0; index < spatial.waypoints.length; index += 1) {
          mission = missionAt(mission, capture, spatial.waypoints[index]!.position)
          const reached = await tickFlightSimMission(mission, {
            pitch: 0,
            roll: 0,
            yaw: 0,
            throttleDelta: 0,
          })
          capture = reached.capture
          assert.equal(capture.waypointIndex, index + 1)
          assert.equal(capture.phase, 'flying')
          assert.equal(
            reached.decisions.find(item => item.payload.event === 'waypoint_reached')
              ?.payload.waypointId,
            spatial.waypoints[index]!.id,
          )
        }

        mission = missionAt(mission, capture, spatial.landingPad.position)
        const terminal = await tickFlightSimMission(mission, {
          pitch: 0,
          roll: 0,
          yaw: 0,
          throttleDelta: 0,
        })
        assert.equal(terminal.capture.phase, 'completed')
        assert.equal(terminal.capture.waypointIndex, 3)
        const completed = terminal.decisions.find(
          item => item.payload.event === 'mission_completed',
        )
        assert.equal(completed?.payload.status, 'completed')
        assert.equal(completed?.payload.landingPadId, spatial.landingPad.id)
      } finally {
        disposeFlightSimMission(mission)
      }
    }),
    flightSimPropertyParameters(29),
  )
})
