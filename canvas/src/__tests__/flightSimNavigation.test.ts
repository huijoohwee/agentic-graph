import assert from 'node:assert/strict'
import test from 'node:test'

import { FLIGHT_SIM_AIRCRAFT_ASSET_SPEC } from '@/features/game-flight-sim/assetSpec/flightSimAssetSpec'
import {
  cycleFlightSimCameraView,
  FLIGHT_SIM_CAMERA_VIEW_OPTIONS,
  readFlightSimCameraSnapshot,
  resetFlightSimCameraForTests,
  selectFlightSimCameraView,
} from '@/features/game-flight-sim/flightSimCameraRuntime'
import { resolveFlightSimFollowTarget } from '@/features/game-flight-sim/flightSimFollowTarget'
import { isFlightSimCameraCycleCode } from '@/features/game-flight-sim/flightSimInput'
import {
  FLIGHT_SIM_ZERO_COST_LOG,
  type FlightSimSnapshot,
  type FlightSimSpatialProfile,
} from '@/features/game-flight-sim/flightSimModel'
import { projectFlightSimNavigation } from '@/features/game-flight-sim/flightSimNavigationProjection'
import { formatFlightSimCourseDirector } from '@/features/game-flight-sim/flightSimRouteGuidance'

function snapshot(overrides: Partial<FlightSimSnapshot> = {}): FlightSimSnapshot {
  return Object.freeze({
    active: true,
    surfaceMode: 'xr',
    webglSupported: true,
    phase: 'flying',
    runId: 7,
    aircraft: Object.freeze({
      position: Object.freeze([1, 2, 3] as const),
      velocity: Object.freeze([0, 0, -10] as const),
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttle: 0.6,
    }),
    waypointIndex: 0,
    waypointCount: 2,
    currentWaypointId: 'waypoint-1',
    tick: 42,
    elapsedSeconds: 0.7,
    collisionId: null,
    pendingDecisions: Object.freeze([]),
    lastCostLog: FLIGHT_SIM_ZERO_COST_LOG,
    runtimeError: null,
    revision: 1,
    ...overrides,
  })
}

const profile: FlightSimSpatialProfile = Object.freeze({
  id: 'flight-sim:test',
  sourceKey: 'test',
  aircraftHalfSize: Object.freeze([1, 1, 1] as const),
  spawn: Object.freeze({
    position: Object.freeze([0, 10, 20] as const),
    velocity: Object.freeze([0, 0, -10] as const),
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttle: 0.6,
  }),
  blockers: Object.freeze([]),
  waypoints: Object.freeze([
    Object.freeze({ id: 'waypoint-1', position: Object.freeze([0, 10, 0] as const), radiusMeters: 5 }),
    Object.freeze({ id: 'waypoint-2', position: Object.freeze([10, 10, -10] as const), radiusMeters: 5 }),
  ]),
  landingPad: Object.freeze({
    id: 'landing',
    position: Object.freeze([0, 0, 20] as const),
    radiusMeters: 5,
  }),
})

test('Flight camera views cycle deterministically without changing the shared camera source', () => {
  resetFlightSimCameraForTests()
  try {
    assert.deepEqual(
      FLIGHT_SIM_CAMERA_VIEW_OPTIONS.map(option => option.id),
      ['chase', 'cockpit', 'survey'],
    )
    assert.equal(readFlightSimCameraSnapshot().view, 'chase')
    assert.equal(selectFlightSimCameraView('cockpit').view, 'cockpit')
    assert.equal(cycleFlightSimCameraView().view, 'survey')
    assert.equal(cycleFlightSimCameraView().view, 'chase')
    assert.equal(isFlightSimCameraCycleCode('KeyC'), true)
    assert.equal(isFlightSimCameraCycleCode('KeyV'), false)
  } finally {
    resetFlightSimCameraForTests()
  }
})

test('Flight camera views remain pure scaled descriptors for the shared camera owner', () => {
  const flight = snapshot()
  assert.deepEqual(resolveFlightSimFollowTarget(flight, 2, 'chase'), {
    position: [2, 12, 22],
    target: [2, 5.6, 6],
    fovDegrees: 58,
    resetKey: 7,
    sequence: 42,
  })
  const cockpit = resolveFlightSimFollowTarget(flight, 2, 'cockpit')
  assert.deepEqual(cockpit, {
    position: [2, 8.3, -6.1],
    target: [2, 8.3, -42.1],
    fovDegrees: 68,
    resetKey: 7,
    sequence: 42,
  })
  assert.ok(
    Math.abs(cockpit.position[2] - flight.aircraft.position[2] * 2)
      > FLIGHT_SIM_AIRCRAFT_ASSET_SPEC.collisionHalfSizeMeters[2] * 2,
    'cockpit eye must remain beyond the scaled forward collision envelope',
  )
  assert.ok(
    cockpit.position[1] - flight.aircraft.position[1] * 2
      > FLIGHT_SIM_AIRCRAFT_ASSET_SPEC.collisionHalfSizeMeters[1] * 2,
    'cockpit eye must remain above the scaled vertical collision envelope',
  )
  for (const pitch of [-0.28 * Math.PI, -0.1, 0, 0.1, 0.28 * Math.PI]) {
    const pitchedFlight = snapshot({
      aircraft: Object.freeze({
        ...flight.aircraft,
        pitch,
        yaw: 0.37,
      }),
    })
    const pitchedCockpit = resolveFlightSimFollowTarget(
      pitchedFlight,
      2,
      'cockpit',
    )
    const aircraft = pitchedFlight.aircraft.position.map(value => value * 2)
    const yawForward = [-Math.sin(pitchedFlight.aircraft.yaw), 0, -Math.cos(pitchedFlight.aircraft.yaw)]
    const eyeOffset = pitchedCockpit.position.map(
      (value, index) => value - aircraft[index]!,
    )
    const horizontalForwardClearance =
      eyeOffset[0]! * yawForward[0]!
      + eyeOffset[2]! * yawForward[2]!
    assert.ok(
      horizontalForwardClearance
        > FLIGHT_SIM_AIRCRAFT_ASSET_SPEC.collisionHalfSizeMeters[2] * 2,
    )
    assert.ok(
      eyeOffset[1]!
        > FLIGHT_SIM_AIRCRAFT_ASSET_SPEC.collisionHalfSizeMeters[1] * 2,
    )
  }
  assert.deepEqual(resolveFlightSimFollowTarget(flight, 2, 'survey'), {
    position: [2, 40, 14],
    target: [2, 5.6, -4],
    fovDegrees: 64,
    resetKey: 7,
    sequence: 42,
  })
})

test('north-up navigation projects authored route progress and objective guidance', () => {
  const projection = projectFlightSimNavigation(snapshot({
    aircraft: profile.spawn,
  }), profile)
  assert.equal(projection.route.length, 4)
  assert.deepEqual(projection.route.map(point => point.state), [
    'visited',
    'active',
    'pending',
    'pending',
  ])
  assert.equal(projection.objective?.id, 'waypoint-1')
  assert.equal(projection.objective?.distanceMeters, 20)
  assert.equal(projection.objective?.bearingDegrees, 0)
  assert.equal(projection.objective?.headingErrorDegrees, 0)
  assert.equal(projection.objective?.label, 'WP1')
  assert.equal(
    formatFlightSimCourseDirector(projection.objective),
    'WP1 · 20 m · HOLD COURSE',
  )
  assert.equal(projection.aircraft.headingDegrees, 0)
  for (const point of [
    ...projection.route,
    projection.aircraft,
    projection.objective!,
  ]) {
    assert.ok(point.x >= 0.08 && point.x <= 0.92)
    assert.ok(point.y >= 0.08 && point.y <= 0.92)
  }

  const turnLeft = projectFlightSimNavigation(snapshot({
    aircraft: Object.freeze({
      ...profile.spawn,
      yaw: -Math.PI / 2,
    }),
  }), profile)
  assert.equal(turnLeft.objective?.headingErrorDegrees, -90)
  assert.equal(
    formatFlightSimCourseDirector(turnLeft.objective),
    'WP1 · 20 m · TURN L 90°',
  )

  const verticallyAligned = projectFlightSimNavigation(snapshot({
    aircraft: Object.freeze({
      ...profile.spawn,
      position: Object.freeze([0, 0, 0] as const),
      yaw: -Math.PI / 2,
    }),
  }), profile)
  assert.equal(verticallyAligned.objective?.distanceMeters, 10)
  assert.equal(verticallyAligned.objective?.bearingDegrees, 90)
  assert.equal(verticallyAligned.objective?.headingErrorDegrees, 0)
  assert.equal(
    formatFlightSimCourseDirector(verticallyAligned.objective),
    'WP1 · 10 m · HOLD COURSE',
  )

  const complete = projectFlightSimNavigation(snapshot({
    aircraft: profile.spawn,
    phase: 'completed',
    waypointIndex: 2,
    currentWaypointId: null,
  }), profile)
  assert.equal(complete.objective, null)
  assert.equal(formatFlightSimCourseDirector(complete.objective), 'COURSE COMPLETE')
  assert.equal(complete.route.at(-1)?.state, 'visited')
})
