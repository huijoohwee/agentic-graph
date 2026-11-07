import assert from 'node:assert/strict'
import test from 'node:test'
import { WAREHOUSE_INSPECTION as plan, WAREHOUSE_INSPECTION_RACKS, WAREHOUSE_INSPECTION_DURATION_SECONDS,
  sampleWarehouseInspection, sampleWarehousePath, warehouseInspectionSegmentIsClear, type WarehouseKeyframe } from '../features/python-learning/warehouseCoverageRoutes'
import { DRONE002_DIMENSIONS } from '../features/python-learning/learningDockAssets'
import { learningSceneDescriptor } from '../features/python-learning/learningLessons'
import { warehouseRackGeometry } from '../features/python-learning/warehouseLayout'

const EPS = 1e-7

test('coverage enumerates actual six-rack geometry at every bay, long face and rendered tier', () => {
  assert.equal(WAREHOUSE_INSPECTION_RACKS.length, 6)
  const rackTargets = plan.targets.filter(t => t.kind === 'rack-face')
  assert.equal(rackTargets.length, 104)
  assert.equal(new Set(plan.targets.map(t => t.id)).size, plan.targets.length)
  for (const rack of WAREHOUSE_INSPECTION_RACKS) {
    const { bays, levels } = warehouseRackGeometry(rack.size[0], rack.size[1])
    const targets = rackTargets.filter(t => t.rackId === rack.id)
    assert.equal(targets.length, bays * levels * 2, rack.id)
    for (const face of ['north', 'south']) for (let bay = 1; bay <= bays; bay++) for (let level = 1; level <= levels; level++)
      assert.equal(targets.filter(t => t.face === face && t.bay === bay && t.level === level).length, 1)
  }
  assert.equal(plan.coverage.aisleTotal, 47)
  assert.equal(plan.excludedAreaSquareMetres, 720)
  assert.deepEqual(plan.exclusions.map(x => x.zoneId), ['vault', 'climate', 'support', 'break', 'office'])
  assert.match(plan.coverage.metric, /not physical/)
})

test('every scheduled segment clears shared racks, pallet, fixtures, walls and excluded rooms', () => {
  let segments = 0
  for (const [actor, path] of Object.entries(plan.paths)) {
    for (let i = 1; i < path.length; i++) {
      assert.ok(path[i].seconds >= path[i - 1].seconds, actor)
      assert.ok(warehouseInspectionSegmentIsClear(path[i - 1].position, path[i].position), `${actor}: segment ${i}`)
      segments++
    }
    assert.equal(path.at(-1)?.seconds, plan.durationSeconds)
  }
  assert.ok(segments > 300)
  assert.deepEqual(plan.unreachableTargets, [])
  assert.ok(!warehouseInspectionSegmentIsClear([-5, 2, -2.4], [9, 2, -2.4]), 'cannot fly through rack envelope')
  assert.ok(!warehouseInspectionSegmentIsClear([0, 2, -12], [-25, 2, -12]), 'cannot enter locked rooms')
  assert.ok(!warehouseInspectionSegmentIsClear([0, 0, 0], [4, 0, 0]), 'ground route cannot pass through pallet')
})

test('station completion requires its scheduled dwell and the denominator does not shrink', () => {
  const initial = sampleWarehouseInspection(0), end = sampleWarehouseInspection(plan.durationSeconds)
  assert.equal(initial.coverage.rackVisited, 0); assert.equal(initial.coverage.aisleVisited, 0)
  assert.deepEqual(end.coverage, { rackVisited: 104, rackTotal: 104, aisleVisited: 47, aisleTotal: 47 })
  assert.equal(new Set(plan.visits.map(v => v.targetId)).size, 151)
  const firstRack = plan.visits.find(v => v.actorId === 'drone001')!
  const viewing = sampleWarehouseInspection(firstRack.startSeconds + 0.1)
  assert.ok(viewing.currentTarget && viewing.cameraTarget)
  assert.ok(Math.abs(Math.hypot(...viewing.currentTarget.position.map((v, i) => v - viewing.cameraTarget!.position[i])) - 0.8) < EPS)
  for (const visit of plan.visits) {
    const before = sampleWarehouseInspection(visit.endSeconds - 0.001), after = sampleWarehouseInspection(visit.endSeconds)
    assert.equal(after.coverage.rackVisited + after.coverage.aisleVisited, before.coverage.rackVisited + before.coverage.aisleVisited + 1)
  }
  assert.deepEqual(sampleWarehouseInspection(123.25), sampleWarehouseInspection(123.25))
  assert.deepEqual(sampleWarehouseInspection(-1), initial)
  assert.deepEqual(sampleWarehouseInspection(plan.durationSeconds + 1), end)
  assert.throws(() => sampleWarehouseInspection(NaN), /finite/)
  assert.ok(WAREHOUSE_INSPECTION_DURATION_SECONDS < 3600)
})

test('truck is stationary for launch/recovery and the lid is open before any bay movement', () => {
  const s = plan.schedule, truck = sampleWarehouseInspection(s.truckStopSeconds).actors.truck
  assert.ok(s.drone001End < s.drone002Start, 'serialized flights')
  assert.ok(s.doorOpenEnd < s.drone002Start)
  assert.ok(s.drone002End < s.doorCloseStart)
  for (let seconds = s.truckStopSeconds; seconds <= plan.durationSeconds; seconds += 0.125) {
    const sample = sampleWarehouseInspection(seconds)
    assert.deepEqual(sample.actors.truck, truck)
    if (seconds > s.drone002Start && seconds < s.drone002End) assert.equal(sample.lidAngleRadians, Math.PI / 2)
  }
  const end = sampleWarehouseInspection(plan.durationSeconds)
  assert.equal(end.lidAngleRadians, 0); assert.equal(end.drone002Docked, true); assert.equal(end.charging, true)
  assert.equal(end.actors.drone002.position[1], DRONE002_DIMENSIONS.dockedBaseY)
  assert.ok(Math.abs(end.actors.drone002.heading - end.actors.truck.heading) < EPS, 'fits bay orientation')
  for (let seconds = 0; seconds < s.truckStopSeconds; seconds += 0.2) {
    const sample = sampleWarehouseInspection(seconds)
    assert.equal(sample.actors.drone002.position[0], sample.actors.truck.position[0])
    assert.equal(sample.actors.drone002.position[2], sample.actors.truck.position[2])
    assert.equal(sample.drone002Docked, true)
  }
})

/** Exact closest approach for each interval of two piecewise-linear position tracks. */
function minSeparation(a: readonly WarehouseKeyframe[], b: readonly WarehouseKeyframe[]) {
  const times = [...new Set([...a, ...b].map(p => p.seconds))].sort((x, y) => x - y)
  let nearest = Infinity
  for (let i = 1; i < times.length; i++) {
    const ap = sampleWarehousePath(a, times[i - 1]).position, bp = sampleWarehousePath(b, times[i - 1]).position
    const aq = sampleWarehousePath(a, times[i]).position, bq = sampleWarehousePath(b, times[i]).position
    const origin = ap.map((v, j) => v - bp[j]), delta = aq.map((v, j) => v - bq[j] - origin[j])
    const squared = delta.reduce((sum, value) => sum + value * value, 0)
    const t = squared <= EPS ? 0 : Math.max(0, Math.min(1, -origin.reduce((sum, value, j) => sum + value * delta[j], 0) / squared))
    nearest = Math.min(nearest, Math.hypot(...origin.map((value, j) => value + delta[j] * t)))
  }
  return nearest
}

test('serialized trajectories preserve separation from the other drone and stationary carrier', () => {
  assert.ok(minSeparation(plan.paths.drone001, plan.paths.drone002) >= 0.5)
  assert.ok(minSeparation(plan.paths.drone001, plan.paths.truck) >= 0.5)
  // drone002 intentionally occupies its carrier bay; all airborne segments leave it vertically at the stop.
  const s = plan.schedule
  for (let seconds = s.drone002Start; seconds < s.drone002End; seconds += 0.1) {
    const sample = sampleWarehouseInspection(seconds), [x, y, z] = sample.actors.drone002.position
    if (Math.hypot(x - 10, z - 9) < 0.25 && y < DRONE002_DIMENSIONS.clearanceBaseY) assert.equal(sample.lidAngleRadians, Math.PI / 2)
  }
})

test('facility rehearsal cannot silently broaden the portable Python lesson contract', () => {
  const descriptor = JSON.parse(learningSceneDescriptor('drone'))
  assert.equal(descriptor.bounds, 8)
  assert.deepEqual(descriptor.altitudeBounds, [0, 4])
  assert.equal(descriptor.model, 'bounded-kinematic-v1')
  assert.ok(plan.paths.truck.some(p => Math.abs(p.position[0]) > 8), 'facility path is distinct')
  assert.equal('samples' in plan, false, 'not a portable flight-path payload')
})
