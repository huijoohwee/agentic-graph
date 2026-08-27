import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import test from 'node:test'
import { SpatialPhysicsEngine } from '../features/physics/spatialPhysicsEngine'
import type {
  SpatialBodySpec,
  SpatialColliderSpec,
  SpatialPhysicsOptions,
} from '../features/physics/spatialPhysicsTypes'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function near(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`)
  }
}

function assertThrows(action: () => void, message: string): void {
  let threw = false
  try { action() } catch { threw = true }
  assert(threw, message)
}

function codeUnitOrder(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function deterministicOptions(reverse = false): SpatialPhysicsOptions {
  const ids = ['zulu', 'älpha', 'Alpha', 'alpha']
  const bodies: SpatialBodySpec[] = ids.map((id, index) => ({
    id,
    motion: 'dynamic',
    position: [index, 0, 0],
    linearVelocity: [1, 0, 0],
    linearDamping: 0,
  }))
  return {
    fixedStepSeconds: 0.01,
    maxSubSteps: 2,
    gravity: [0, 0, 0],
    bodies: reverse ? bodies.reverse() : bodies,
  }
}

function drainBacklog(engine: SpatialPhysicsEngine): void {
  assert(engine.advance(0.05).steps === 2, 'advance must respect maxSubSteps')
  assert(engine.advance(0).steps === 2, 'zero elapsed advance must drain retained backlog')
  assert(engine.advance(0).steps === 1, 'final retained fixed interval must remain drainable')
  assert(engine.advance(0).steps === 0, 'backlog must become idle after every accepted interval')
}

function testDeterministicOrderBacklogAndSnapshot(): void {
  const first = new SpatialPhysicsEngine(deterministicOptions())
  const second = new SpatialPhysicsEngine(deterministicOptions(true))
  drainBacklog(first)
  drainBacklog(second)
  const firstSnapshot = first.captureSnapshot()
  const secondSnapshot = second.captureSnapshot()
  assert(firstSnapshot.tick === 5 && firstSnapshot.remainderSeconds === 0, 'five retained ticks must execute exactly once')
  assert(firstSnapshot.settings.maxSubSteps === 2, 'snapshot must retain the bounded step budget')
  const expectedIds = ['zulu', 'älpha', 'Alpha', 'alpha'].sort(codeUnitOrder)
  assert(
    firstSnapshot.bodies.map(body => body.id).join('|') === expectedIds.join('|'),
    'body snapshots must use locale-independent code-unit order',
  )
  assert(
    JSON.stringify(firstSnapshot.bodies) === JSON.stringify(secondSnapshot.bodies),
    'fixed-step output must not depend on body insertion order',
  )
  for (const body of firstSnapshot.bodies) near(body.position[0], expectedPosition(body.id), 1e-12, 'motion must preserve all accepted elapsed time')
  assert(firstSnapshot.format === 'agenticgraph.spatial-physics-world'
    && firstSnapshot.version === 1
    && firstSnapshot.dimension === '3d', 'snapshot must be explicitly versioned and dimension tagged')
  assert(
    JSON.stringify(SpatialPhysicsEngine.fromSnapshot(firstSnapshot).captureSnapshot()) === JSON.stringify(firstSnapshot),
    'snapshot restore must round-trip all deterministic state',
  )

  const interactionIds = ['é', 'Z', 'a', 'Å']
  const interactionEngine = new SpatialPhysicsEngine({
    fixedStepSeconds: 0.01,
    maxSubSteps: 1,
    gravity: [0, 0, 0],
    bodies: interactionIds.map(id => ({ id: `body-${id}`, motion: 'static' as const, position: [0, 0, 0] })),
    colliders: interactionIds.map(id => ({
      id, bodyId: `body-${id}`, shape: { kind: 'sphere' as const, radius: 1 }, sensor: true,
    })),
  })
  interactionEngine.stepFixed()
  const interactionSnapshot = interactionEngine.captureSnapshot()
  const expectedPairs = ['Z/a', 'Z/Å', 'Z/é', 'a/Å', 'a/é', 'Å/é']
  assert(
    interactionSnapshot.activeInteractions.map(pair => pair.colliderIds.join('/')).join('|') === expectedPairs.join('|'),
    'active interaction snapshots must use explicit code-unit pair order',
  )
  assert(
    interactionSnapshot.pendingEvents.map(event => event.colliderIds.join('/')).join('|') === expectedPairs.join('|'),
    'buffered event snapshots must use explicit code-unit pair order',
  )
  const target = SpatialPhysicsEngine.fromSnapshot(interactionSnapshot)
  const beforeRejectedRestore = JSON.stringify(target.captureSnapshot())
  const wrongOwner = JSON.parse(JSON.stringify(interactionSnapshot))
  wrongOwner.activeInteractions[0].bodyIds[0] = wrongOwner.activeInteractions[0].bodyIds[1]
  assertThrows(() => target.restore(wrongOwner), 'snapshot restore must reject collider/body ownership mismatch')
  assert(JSON.stringify(target.captureSnapshot()) === beforeRejectedRestore, 'rejected restore must leave engine state unchanged')
  const wrongSensor = JSON.parse(JSON.stringify(interactionSnapshot))
  wrongSensor.activeInteractions[0].sensor = false
  assertThrows(() => SpatialPhysicsEngine.fromSnapshot(wrongSensor), 'snapshot restore must reject sensor ownership mismatch')
  const reversedEvent = JSON.parse(JSON.stringify(interactionSnapshot))
  reversedEvent.pendingEvents[0].colliderIds.reverse()
  reversedEvent.pendingEvents[0].bodyIds.reverse()
  assertThrows(() => SpatialPhysicsEngine.fromSnapshot(reversedEvent), 'snapshot restore must reject noncanonical event id order')
  const unknownContact = JSON.parse(JSON.stringify(interactionSnapshot))
  unknownContact.bodies[0].contactIds = ['missing-collider']
  assertThrows(() => SpatialPhysicsEngine.fromSnapshot(unknownContact), 'snapshot restore must reject unknown contact ids')
  assertThrows(() => first.setBodyPose(
    'zulu', [0, 0, 0], [0, 0, 0], { teleport: 'yes' } as unknown as Readonly<{ teleport?: boolean }>,
  ), 'setBodyPose must reject a non-boolean teleport option')
}

function expectedPosition(id: string): number {
  const index = ['zulu', 'älpha', 'Alpha', 'alpha'].indexOf(id)
  return index + 0.05
}

function testPendingSweepSnapshotParity(): void {
  const engine = new SpatialPhysicsEngine({
    fixedStepSeconds: 0.02,
    maxSubSteps: 1,
    gravity: [0, 0, 0],
    bodies: [
      { id: 'sweeper', motion: 'kinematic', position: [-2, 0, 0] },
      { id: 'target', motion: 'dynamic', position: [0, 0, 0], linearDamping: 0 },
    ],
    colliders: [
      { id: 'sweeper-shape', bodyId: 'sweeper', shape: { kind: 'cuboid', halfSize: [0.05, 0.05, 0.05] } },
      { id: 'target-shape', bodyId: 'target', shape: { kind: 'cuboid', halfSize: [0.05, 0.05, 0.05] } },
    ],
  })
  assert(engine.setBodyPose('sweeper', [2, 0, 0], [200, 0, 0]), 'kinematic pose command must be accepted')
  const pendingSnapshot = engine.captureSnapshot()
  assert(
    JSON.stringify(pendingSnapshot.bodies.find(body => body.id === 'sweeper')?.pendingSweepStartPosition)
      === JSON.stringify([-2, 0, 0]),
    'snapshot must retain the pending 3D sweep origin before the next tick',
  )
  const restored = SpatialPhysicsEngine.fromSnapshot(pendingSnapshot)
  engine.stepFixed()
  restored.stepFixed()
  assert(
    JSON.stringify(restored.captureSnapshot()) === JSON.stringify(engine.captureSnapshot()),
    'restored pending sweep must produce the same next-step collision continuation',
  )
  assert(restored.readBody('target')!.linearVelocity[0] > 0, 'restored kinematic sweep must transfer its collision impulse')

  const malformedSweep = JSON.parse(JSON.stringify(pendingSnapshot))
  malformedSweep.bodies.find((body: { id?: string }) => body.id === 'sweeper').pendingSweepStartPosition = [0, 0]
  const unchanged = SpatialPhysicsEngine.fromSnapshot(pendingSnapshot)
  const beforeRejectedRestore = JSON.stringify(unchanged.captureSnapshot())
  assertThrows(() => unchanged.restore(malformedSweep), 'snapshot restore must reject a malformed pending sweep origin')
  assert(JSON.stringify(unchanged.captureSnapshot()) === beforeRejectedRestore, 'rejected pending sweep restore must be atomic')
}

function testSweptCuboidsAndEarliestGroundOrdering(): void {
  const bodies: SpatialBodySpec[] = [
    { id: 'fast', motion: 'dynamic', position: [-2, 2, 0], linearVelocity: [200, 0, 0], linearDamping: 0 },
    { id: 'near-wall', motion: 'static', position: [-0.5, 2, 0] },
    { id: 'far-wall', motion: 'static', position: [0.8, 2, 0] },
    { id: 'falling', motion: 'dynamic', position: [0, 2, 3], linearVelocity: [0, -200, 0], linearDamping: 0 },
    { id: 'platform', motion: 'static', position: [0, 0.5, 3] },
  ]
  const cuboid = (id: string, bodyId: string, halfSize: readonly [number, number, number], restitution = 0): SpatialColliderSpec => ({
    id, bodyId, shape: { kind: 'cuboid', halfSize }, friction: 0, restitution,
  })
  const engine = new SpatialPhysicsEngine({
    fixedStepSeconds: 0.02,
    maxSubSteps: 4,
    gravity: [0, 0, 0],
    ground: { id: 'floor', enabled: true, height: -1, friction: 0, restitution: 1 },
    bodies,
    colliders: [
      cuboid('fast-shape', 'fast', [0.05, 0.05, 0.05]),
      cuboid('z:near-shape', 'near-wall', [0.05, 1, 1]),
      cuboid('a:far-shape', 'far-wall', [0.05, 1, 1], 1),
      cuboid('falling-shape', 'falling', [0.05, 0.05, 0.05]),
      cuboid('platform-shape', 'platform', [1, 0.05, 1]),
    ],
  })
  engine.stepFixed()
  const fast = engine.readBody('fast')!
  assert(fast.contactIds.includes('z:near-shape'), 'swept cuboid must hit a thin nearer static collider')
  assert(!fast.contactIds.includes('a:far-shape'), 'a farther lexical-first collider must remain physically unreached')
  assert(fast.position[0] < -0.5 && fast.linearVelocity[0] === 0, 'earliest thin-wall contact must own response')
  const falling = engine.readBody('falling')!
  assert(falling.contactIds.includes('platform-shape') && !falling.contactIds.includes('floor'), 'near platform TOI must win over the farther infinite ground surface')
  assert(falling.position[1] > 0.5 && falling.linearVelocity[1] === 0, 'platform response must stop the falling body before ground')

  const restingEngine = new SpatialPhysicsEngine({
    fixedStepSeconds: 0.02,
    maxSubSteps: 1,
    gravity: [0, 0, 0],
    ground: { id: 'floor', enabled: true, height: 0, friction: 1, restitution: 0 },
    bodies: [{ id: 'resting', motion: 'dynamic', position: [0, 0.5, 0], linearVelocity: [1, 0, 0] }],
    colliders: [cuboid('resting-shape', 'resting', [0.5, 0.5, 0.5])],
  })
  restingEngine.stepFixed()
  restingEngine.stepFixed()
  const restingEvents = restingEngine.drainEvents()
  assert(restingEngine.readBody('resting')!.grounded, 'touching ground must remain grounded without gravity jitter')
  assert(restingEngine.readBody('resting')!.position[0] > 0.03, 'resting ground response must retain horizontal integration')
  assert(restingEvents.length === 1 && restingEvents[0]!.kind === 'collision-began', 'persistent ground contact must not alternate began and ended events')

  const pushEngine = new SpatialPhysicsEngine({
    fixedStepSeconds: 0.1,
    maxSubSteps: 1,
    gravity: [0, 0, 0],
    bodies: [
      { id: 'pusher', motion: 'dynamic', position: [0, 0, 0], linearVelocity: [1, 0, 0], linearDamping: 0 },
      { id: 'pushed', motion: 'dynamic', position: [1, 0, 0], linearDamping: 0 },
    ],
    colliders: [
      cuboid('pusher-shape', 'pusher', [0.5, 0.5, 0.5]),
      cuboid('pushed-shape', 'pushed', [0.5, 0.5, 0.5]),
    ],
  })
  pushEngine.stepFixed()
  pushEngine.stepFixed()
  assert(pushEngine.readBody('pushed')!.position[0] > 1.04, 'zero-touch dynamic contact must retain integrated pair motion')

  const separatingEngine = new SpatialPhysicsEngine({
    fixedStepSeconds: 0.1,
    maxSubSteps: 1,
    gravity: [0, 0, 0],
    bodies: [
      { id: 'departing', motion: 'dynamic', position: [0, 0, 0], linearVelocity: [-1, 0, 0], linearDamping: 0 },
      { id: 'wall', motion: 'static', position: [1, 0, 0] },
    ],
    colliders: [
      cuboid('departing-shape', 'departing', [0.5, 0.5, 0.5]),
      cuboid('wall-shape', 'wall', [0.5, 0.5, 0.5]),
    ],
  })
  separatingEngine.stepFixed()
  assert(separatingEngine.readBody('departing')!.contactIds.length === 0,
    'a body separating from exact touch must not publish a stale contact')
  assert(separatingEngine.drainEvents().length === 0,
    'a body separating from exact touch must not publish a began event')
}

function testOverlapAccumulationAndSensorGroundLifecycle(): void {
  const cuboid = (id: string, bodyId: string, halfSize: readonly [number, number, number], sensor = false): SpatialColliderSpec => ({
    id, bodyId, shape: { kind: 'cuboid', halfSize }, sensor, friction: 0, restitution: 0,
  })
  const overlapEngine = new SpatialPhysicsEngine({
    fixedStepSeconds: 0.02,
    maxSubSteps: 1,
    gravity: [0, 0, 0],
    bodies: [
      { id: 'mover', motion: 'dynamic', position: [0, 0, 0], linearDamping: 0 },
      { id: 'x-wall', motion: 'static', position: [0.1, 0, 0] },
      { id: 'z-wall', motion: 'static', position: [0, 0, 0.1] },
    ],
    colliders: [
      cuboid('mover-shape', 'mover', [0.2, 0.2, 0.2]),
      cuboid('a:x-wall-shape', 'x-wall', [0.1, 1, 1]),
      cuboid('b:z-wall-shape', 'z-wall', [1, 1, 0.1]),
    ],
  })
  overlapEngine.stepFixed()
  const depenetrated = overlapEngine.readBody('mover')!
  assert(depenetrated.position[0] < -0.15 && depenetrated.position[2] < -0.15, 'simultaneous start overlaps must accumulate depenetration across axes')

  const sensorEngine = new SpatialPhysicsEngine({
    fixedStepSeconds: 0.1,
    maxSubSteps: 1,
    gravity: [0, 0, 0],
    ground: { id: 'ground-surface', enabled: true, height: 0, collisionLayer: 1, collisionMask: 1 },
    bodies: [
      { id: 'sensor-body', motion: 'dynamic', position: [0, 1, 0], linearVelocity: [0, -20, 0], linearDamping: 0 },
      { id: 'masked-body', motion: 'dynamic', position: [2, 1, 0], linearVelocity: [0, -20, 0], linearDamping: 0 },
    ],
    colliders: [
      { ...cuboid('sensor-shape', 'sensor-body', [0.1, 0.1, 0.1], true), collisionLayer: 1, collisionMask: 1 },
      { ...cuboid('masked-shape', 'masked-body', [0.1, 0.1, 0.1]), collisionLayer: 2, collisionMask: 2 },
    ],
  })
  sensorEngine.stepFixed()
  const sensorAfterCrossing = sensorEngine.readBody('sensor-body')!
  assert(sensorAfterCrossing.position[1] === -1 && sensorAfterCrossing.linearVelocity[1] === -20
    && !sensorAfterCrossing.grounded, 'sensor-ground contact must not resolve pose, velocity, or grounded state')
  assert(sensorAfterCrossing.contactIds.includes('ground-surface'), 'sensor crossing must expose the stable ground contact id')
  assert(!sensorEngine.readBody('masked-body')!.contactIds.includes('ground-surface'), 'symmetric filters must suppress masked ground contact')
  assert(sensorEngine.drainEvents()[0]?.kind === 'sensor-began', 'sensor crossing must buffer a began event')
  sensorEngine.stepFixed()
  assert(sensorEngine.drainEvents()[0]?.kind === 'sensor-ended', 'sensor leaving the ground plane must buffer an ended event')
}

function testQueriesAndSortedBufferedEvents(): void {
  const engine = new SpatialPhysicsEngine({
    fixedStepSeconds: 0.1,
    maxSubSteps: 2,
    gravity: [0, 0, 0],
    ground: { id: 'floor', enabled: true, height: 0 },
    bodies: [
      { id: 'sphere-body', motion: 'static', position: [0, 1, 0] },
      { id: 'box-body', motion: 'static', position: [2, 1, 0] },
    ],
    colliders: [
      { id: 'sphere:β', bodyId: 'sphere-body', shape: { kind: 'sphere', radius: 0.5 } },
      { id: 'Alpha-box', bodyId: 'box-body', shape: { kind: 'cuboid', halfSize: [0.5, 0.5, 0.5] }, sensor: true },
    ],
  })
  assert(engine.queryPoint([0, 1, 0]).join('|') === 'sphere:β', 'point query must return containing collider ids')
  assert(engine.queryPoint([0, 0, 0]).includes('floor'), 'point query must expose the horizontal ground surface')
  const overlaps = engine.queryOverlap({ position: [1, 3, 0], shape: { kind: 'sphere', radius: 2 } })
  assert(overlaps.join('|') === ['Alpha-box', 'sphere:β'].sort(codeUnitOrder).join('|'), 'overlap query must return code-unit sorted shape hits')
  assert(engine.queryOverlap({
    position: [1, 3, 0], shape: { kind: 'sphere', radius: 2 }, filter: { includeSensors: false },
  }).join('|') === 'sphere:β', 'query filters must optionally exclude sensors')
  const ray = engine.castRay({ origin: [-3, 1, 0], direction: [1, 0, 0], maxDistance: 10 })
  assert(ray.map(hit => hit.colliderId).join('|') === 'sphere:β|Alpha-box', 'ray hits must be ordered by distance')
  const groundHit = engine.castRay({ origin: [0, 3, 0], direction: [0, -1, 0], maxDistance: 5 })
    .find(hit => hit.colliderId === 'floor')
  assert(groundHit?.bodyId === null && groundHit.distance === 3, 'ray query must report the unbounded ground surface without a synthetic body')
}

function testCleanRoomSourceBoundary(): void {
  const implementationPaths = [
    ['features', 'physics', 'spatialPhysicsTypes.ts'],
    ['features', 'physics', 'spatialPhysicsGeometry.ts'],
    ['features', 'physics', 'spatialPhysicsStep.ts'],
    ['features', 'physics', 'spatialPhysicsEngine.ts'],
  ]
  const canvasRoot = basename(process.cwd()) === 'canvas' ? process.cwd() : resolve(process.cwd(), 'canvas')
  const implementation = implementationPaths.map(parts => (
    readFileSync(resolve(canvasRoot, 'src', ...parts), 'utf8')
  ))
  const forbiddenRuntime = ['@dimforge', 'rapier'].join('/')
  const packageText = readFileSync(resolve(canvasRoot, 'package.json'), 'utf8')
    + readFileSync(resolve(canvasRoot, '..', 'package-lock.json'), 'utf8')
  assert(!packageText.toLowerCase().includes(forbiddenRuntime), 'spatial engine must not add the external reference runtime')
  for (const source of implementation) {
    assert(source.split('\n').length < 600, 'every spatial physics source must remain below the source budget')
    assert(!/from\s+['"](?!\.)[^'"]+['"]/.test(source), 'spatial physics core must use no external runtime imports')
  }
}

export function testSpatialPhysicsEngineIsDeterministicQueryableAndCleanRoom(): void {
  testDeterministicOrderBacklogAndSnapshot()
  testPendingSweepSnapshotParity()
  testSweptCuboidsAndEarliestGroundOrdering()
  testOverlapAccumulationAndSensorGroundLifecycle()
  testQueriesAndSortedBufferedEvents()
  testCleanRoomSourceBoundary()
}

test('spatial engine retains deterministic backlog order and round-trips a tagged snapshot', testDeterministicOrderBacklogAndSnapshot)
test('spatial engine snapshots pending kinematic sweep continuation', testPendingSweepSnapshotParity)
test('spatial engine sweeps cuboids and resolves the earliest collider or ground contact', testSweptCuboidsAndEarliestGroundOrdering)
test('spatial engine accumulates overlaps and buffers filtered sensor-ground events', testOverlapAccumulationAndSensorGroundLifecycle)
test('spatial engine exposes point, overlap, and ordered ray queries', testQueriesAndSortedBufferedEvents)
test('spatial engine remains dependency-free and within source budgets', testCleanRoomSourceBoundary)
