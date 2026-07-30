import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
  FLIGHT_SIM_ROUTE_WAYPOINT_COUNT,
} from '@/features/game-flight-sim/flightSimModel'
import {
  createFlightSimSpatialProfile,
  readFlightSimXrSpatialSourceKey,
} from '@/features/game-flight-sim/flightSimSpatialProfile'
import {
  FLIGHT_SIM_METERS_PER_AUTHORED_WORLD_UNIT,
  FLIGHT_SIM_SPATIAL_SCALE_ID,
  flightSimAuthoredWorldUnitsToMeters,
  resolveFlightSimGameplayCoordinateScale,
} from '@/features/game-flight-sim/flightSimSpatialScale'
import { resolveXrCanonicalSceneSpatialSource } from '@/features/three/xrCanonicalSceneSpatialSource'
import { XR_NATIVE_CONTROLLER_DEMO_STAGE_SCALE } from '@/features/three/xrNativeControllerDemoRuntime'

function singaporeProfile() {
  const source = resolveXrCanonicalSceneSpatialSource({
    projection: 'native-controller',
    stageId: 'singapore',
  })
  return {
    source,
    profile: createFlightSimSpatialProfile(source),
  }
}

function distance(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  )
}

test('Flight converts every Singapore authored unit into one fixed mission-meter scale', () => {
  const { source, profile } = singaporeProfile()
  assert.equal(FLIGHT_SIM_METERS_PER_AUTHORED_WORLD_UNIT, 20)
  assert.equal(FLIGHT_SIM_SPATIAL_SCALE_ID, 'flight-meters-20')
  assert.equal(
    profile.id,
    'flight-sim:native-controller:singapore:flight-meters-20',
  )
  assert.equal(
    profile.sourceKey,
    'native-controller:singapore:flight-meters-20',
  )
  assert.match(readFlightSimXrSpatialSourceKey(), /:flight-meters-20$/)
  assert.deepEqual(source.perimeter.centerMeters, [0, 0])
  assert.equal(source.perimeter.halfWidthMeters, 16)
  assert.equal(source.perimeter.halfDepthMeters, 12)

  const sourceBlocker = source.staticColliders.find(
    blocker => blocker.id === 'native-treasure-block',
  )
  const missionBlocker = profile.blockers.find(
    blocker => blocker.id === 'native-treasure-block',
  )
  assert.ok(sourceBlocker)
  assert.ok(missionBlocker)
  assert.deepEqual(
    missionBlocker.center,
    sourceBlocker.center.map(flightSimAuthoredWorldUnitsToMeters),
  )
  assert.deepEqual(
    missionBlocker.halfSize,
    sourceBlocker.sizeMeters.map(size => (
      flightSimAuthoredWorldUnitsToMeters(size / 2)
    )),
  )

  const ceiling = profile.blockers.find(
    blocker => blocker.id === 'flight-sim:boundary-ceiling',
  )
  assert.ok(ceiling)
  const authoredTop = source.staticColliders
    .filter(blocker => !blocker.trigger)
    .reduce((maximum, blocker) => Math.max(
      maximum,
      blocker.center[1] + blocker.sizeMeters[1] / 2,
    ), 0)
  const expectedCeilingHeight = Math.max(
    flightSimAuthoredWorldUnitsToMeters(32),
    flightSimAuthoredWorldUnitsToMeters(authoredTop + 12),
  )
  assert.equal(
    ceiling.center[1] - ceiling.halfSize[1],
    expectedCeilingHeight,
  )
  assert.deepEqual(
    profile.blockers.find(blocker => blocker.id === 'flight-sim:terrain-ground'),
    {
      id: 'flight-sim:terrain-ground',
      center: [0, -10, 0],
      halfSize: [320, 10, 240],
    },
  )
})

test('Flight route starts outside every capture sphere and stays in the scaled envelope', () => {
  const { source, profile } = singaporeProfile()
  const centerX = flightSimAuthoredWorldUnitsToMeters(source.perimeter.centerMeters[0])
  const centerZ = flightSimAuthoredWorldUnitsToMeters(source.perimeter.centerMeters[1])
  const halfWidth = flightSimAuthoredWorldUnitsToMeters(source.perimeter.halfWidthMeters)
  const halfDepth = flightSimAuthoredWorldUnitsToMeters(source.perimeter.halfDepthMeters)
  const route = [...profile.waypoints, profile.landingPad]

  assert.equal(profile.waypoints.length, FLIGHT_SIM_ROUTE_WAYPOINT_COUNT)
  assert.equal(route.length, FLIGHT_SIM_ROUTE_WAYPOINT_COUNT + 1)
  for (const point of route) {
    assert.equal(point.radiusMeters, FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS)
    assert.ok(distance(profile.spawn.position, point.position) > point.radiusMeters)
    assert.ok(
      Math.abs(point.position[0] - centerX) + point.radiusMeters <= halfWidth,
      `${point.id} must fit inside the scaled east-west envelope`,
    )
    assert.ok(
      Math.abs(point.position[2] - centerZ) + point.radiusMeters <= halfDepth,
      `${point.id} must fit inside the scaled north-south envelope`,
    )
  }
})

test('Flight alone applies the inverse meter scale to actors and its shared camera', () => {
  const flightScale = resolveFlightSimGameplayCoordinateScale(
    XR_NATIVE_CONTROLLER_DEMO_STAGE_SCALE,
    true,
  )
  assert.equal(
    flightScale,
    XR_NATIVE_CONTROLLER_DEMO_STAGE_SCALE / FLIGHT_SIM_METERS_PER_AUTHORED_WORLD_UNIT,
  )
  assert.equal(
    flightSimAuthoredWorldUnitsToMeters(7) * flightScale,
    7 * XR_NATIVE_CONTROLLER_DEMO_STAGE_SCALE,
  )
  assert.equal(
    resolveFlightSimGameplayCoordinateScale(XR_NATIVE_CONTROLLER_DEMO_STAGE_SCALE, false),
    XR_NATIVE_CONTROLLER_DEMO_STAGE_SCALE,
  )
})
