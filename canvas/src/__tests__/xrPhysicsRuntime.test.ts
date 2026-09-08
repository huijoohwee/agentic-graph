import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  XR_PHYSICS_GRAPH_METADATA_KEY,
  XR_PHYSICS_WORLD_SCHEMA,
  buildXrPhysicsStructureColliders,
  readXrPhysicsStaticColliders,
  readXrPhysicsWorld,
  serializeXrPhysicsWorld,
  type XrPhysicsSubjectSeed,
} from '@/features/three/xrPhysicsModel'
import {
  captureXrPhysicsSimulation,
  createXrPhysicsSimulation,
  stepXrPhysicsSimulation,
} from '@/features/three/xrSpatialPhysicsAdapter'
import {
  applyXrPhysicsImpulse,
  attachXrPhysicsBody,
  configureXrPhysicsBody,
  hydrateXrPhysicsRuntime,
  pauseXrPhysicsRuntime,
  playXrPhysicsRuntime,
  readXrPhysicsBodyState,
  readXrPhysicsRuntime,
  readXrPhysicsRuntimeFrame,
  resetXrPhysicsRuntime,
  restoreXrPhysicsRuntimeSnapshot,
  serializeXrPhysicsRuntimeWorld,
  setXrPhysicsKinematicPose,
  stepXrPhysicsRuntime,
  stepXrPhysicsRuntimeTicks,
  stopXrPhysicsRuntime,
  subscribeXrPhysicsRuntime,
} from '@/features/three/xrPhysicsRuntime'
import { normalizeXrSceneControl } from '@/features/three/xrSceneMcpRuntime'
import {
  normalizeXrPhysicsControl,
  parseXrInteractiveInvocation,
} from '@/features/three/xrSceneInteractiveInvocation'
import { assertCollisionBitfieldDomainMatchesUiAndMcp } from '@/__tests__/helpers/xrPhysicsRuntimeAssertions'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function near(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`)
  }
}

function source(...parts: string[]): string { return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8') }

function arbitrarySubjects(): readonly XrPhysicsSubjectSeed[] {
  return [
    { subjectId: 'renamed.subject/zeta', position: [0, 3, 0], sizeMeters: [1, 1, 1] },
    { subjectId: '42-alpha object', position: [2, 1, -3], sizeMeters: [0.5, 2, 0.75] },
    { subjectId: 'sensor:any-value', position: [-4, 0, 2], sizeMeters: [3, 2, 3] },
  ]
}

function persistedWorldWithOrder(order: readonly string[]): Record<string, unknown> {
  const records: Record<string, Record<string, unknown>> = {
    'renamed.subject/zeta': {
      mode: 'dynamic',
      sizeMeters: [1, 1, 1],
      spawnPosition: [0, 3, 0],
      mass: 2,
      friction: 0.4,
      restitution: 0.2,
      collisionGroup: 2,
      collisionMask: 7,
    },
    '42-alpha object': {
      mode: 'kinematic',
      sizeMeters: [0.5, 2, 0.75],
      spawnPosition: [2, 1, -3],
      collisionGroup: 4,
      collisionMask: 3,
    },
    'sensor:any-value': {
      mode: 'trigger',
      sizeMeters: [3, 2, 3],
      spawnPosition: [-4, 0, 2],
      collisionGroup: 1,
      collisionMask: 2,
    },
  }
  return {
    schema: XR_PHYSICS_WORLD_SCHEMA,
    gravity: [0, -9.81, 0],
    fixedStepSeconds: 1 / 120,
    maxSubSteps: 8,
    bodies: Object.fromEntries(order.map(subjectId => [subjectId, records[subjectId]])),
  }
}

function testStableArbitraryIdSerialization(): void {
  const subjects = arbitrarySubjects()
  const first = readXrPhysicsWorld(persistedWorldWithOrder(subjects.map(subject => subject.subjectId)), subjects)
  const second = readXrPhysicsWorld(persistedWorldWithOrder([...subjects].reverse().map(subject => subject.subjectId)), [...subjects].reverse())
  const firstText = JSON.stringify(serializeXrPhysicsWorld(first))
  const secondText = JSON.stringify(serializeXrPhysicsWorld(second))
  assert(firstText === secondText, 'physics serialization must be independent of input and subject order')
  const serialized = serializeXrPhysicsWorld(first) as { bodies?: Record<string, unknown> }
  assert(serialized.bodies && Object.keys(serialized.bodies).join('|') === [...Object.keys(serialized.bodies)].sort().join('|'), 'body map must be stable and keyed by subject id')
  assert(first.bodies.every(body => !/^actor-|^body-|^player-/i.test(body.subjectId)), 'test ids must prove generic subject binding')
  const filtered = readXrPhysicsWorld(serializeXrPhysicsWorld(first), subjects.slice(0, 1))
  assert(filtered.bodies.length === 1 && filtered.bodies[0]!.subjectId === subjects[0]!.subjectId, 'missing scene subjects must be pruned without remapping ids')

  const localeSensitiveIds = ['zulu', 'älpha', 'Alpha', 'alpha']
  const localeIndependent = readXrPhysicsWorld({
    bodies: Object.fromEntries(localeSensitiveIds.map(subjectId => [subjectId, { mode: 'static' }])),
  })
  const expectedOrder = [...localeSensitiveIds].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
  assert(
    localeIndependent.bodies.map(body => body.subjectId).join('|') === expectedOrder.join('|'),
    'physics ids must use locale-independent code-unit ordering',
  )
}

function testDeterministicFixedStepAndCollisions(): void {
  const world = readXrPhysicsWorld({
    gravity: [0, -9.81, 0],
    fixedStepSeconds: 1 / 120,
    floor: { enabled: true, height: -10 },
    bodies: {
      'falling:any': {
        mode: 'dynamic',
        sizeMeters: [1, 1, 1],
        spawnPosition: [0, 4, 0],
        mass: 1,
        friction: 0.5,
        restitution: 0,
      },
      'masked-out': {
        mode: 'dynamic',
        sizeMeters: [0.5, 0.5, 0.5],
        spawnPosition: [8, 3, 0],
        collisionGroup: 8,
        collisionMask: 8,
      },
      'trigger:zone': {
        mode: 'trigger',
        sizeMeters: [4, 2, 4],
        spawnPosition: [0, 0.5, 0],
      },
    },
  })
  const colliders = buildXrPhysicsStructureColliders([
    { id: 'deck-with-any-name', position: [0, 0.5, 0], size: [5, 1, 5] },
    { id: 'masked-platform', position: [8, 0.5, 0], size: [4, 1, 4] },
  ]).map(collider => collider.id === 'stage:masked-platform'
    ? { ...collider, collisionGroup: 1, collisionMask: 1 }
    : collider)
  const first = createXrPhysicsSimulation(world)
  const second = createXrPhysicsSimulation(world)
  for (let index = 0; index < 180; index += 1) {
    stepXrPhysicsSimulation({ simulation: first, world, staticColliders: colliders })
  }
  for (let index = 0; index < 90; index += 1) {
    stepXrPhysicsSimulation({ simulation: second, world, staticColliders: colliders, stepSeconds: world.fixedStepSeconds })
    stepXrPhysicsSimulation({ simulation: second, world, staticColliders: [...colliders].reverse(), stepSeconds: world.fixedStepSeconds })
  }
  const firstBodies = captureXrPhysicsSimulation(first)
  const secondBodies = captureXrPhysicsSimulation(second)
  assert(JSON.stringify(firstBodies) === JSON.stringify(secondBodies), 'fixed steps and collider order must replay identically')
  const falling = firstBodies.find(body => body.subjectId === 'falling:any')!
  near(falling.position[1], 1, 0.02, 'dynamic body must settle on a stage structure')
  assert(falling.contacts.includes('stage:deck-with-any-name'), 'stage collider contact must use the authored structure id')
  const masked = firstBodies.find(body => body.subjectId === 'masked-out')!
  assert(masked.position[1] < -5 && !masked.contacts.includes('stage:masked-platform'), 'collision masks must suppress unrelated structure response')
  const trigger = firstBodies.find(body => body.subjectId === 'trigger:zone')!
  assert(trigger.position[1] === 0.5, 'trigger bodies must remain non-responsive')
}

function testSweptHighSpeedCollisions(): void {
  const world = readXrPhysicsWorld({
    gravity: [0, 0, 0],
    fixedStepSeconds: 0.02,
    floor: { enabled: false },
    bodies: {
      'fast:wall': {
        mode: 'dynamic',
        sizeMeters: [0.1, 0.1, 0.1],
        spawnPosition: [-2, 0, 0],
        initialVelocity: [200, 0, 0],
        friction: 0,
        restitution: 0,
        linearDamping: 0,
      },
      'fast:body': {
        mode: 'dynamic',
        sizeMeters: [0.1, 0.1, 0.1],
        spawnPosition: [-2, 2, 0],
        initialVelocity: [200, 0, 0],
        friction: 0,
        restitution: 0,
        linearDamping: 0,
      },
      'thin:blocker': {
        mode: 'static',
        sizeMeters: [0.1, 0.1, 0.1],
        spawnPosition: [0, 2, 0],
        restitution: 0,
      },
      'fast:trigger-collider': {
        mode: 'dynamic',
        sizeMeters: [0.1, 0.1, 0.1],
        spawnPosition: [-2, 4, 0],
        initialVelocity: [200, 0, 0],
        friction: 0,
        restitution: 0,
        linearDamping: 0,
      },
      'fast:trigger-body': {
        mode: 'dynamic',
        sizeMeters: [0.1, 0.1, 0.1],
        spawnPosition: [-2, 6, 0],
        initialVelocity: [200, 0, 0],
        friction: 0,
        restitution: 0,
        linearDamping: 0,
      },
      'thin:trigger-body': {
        mode: 'trigger',
        sizeMeters: [0.1, 0.1, 0.1],
        spawnPosition: [0, 6, 0],
      },
      'fast:dynamic-left': {
        mode: 'dynamic',
        sizeMeters: [0.1, 0.1, 0.1],
        spawnPosition: [-2, 8, 0],
        initialVelocity: [200, 0, 0],
        friction: 0,
        restitution: 0,
        linearDamping: 0,
      },
      'fast:dynamic-right': {
        mode: 'dynamic',
        sizeMeters: [0.1, 0.1, 0.1],
        spawnPosition: [2, 8, 0],
        initialVelocity: [-200, 0, 0],
        friction: 0,
        restitution: 0,
        linearDamping: 0,
      },
    },
  })
  const colliders = readXrPhysicsStaticColliders([
    { id: 'thin:wall', center: [0, 0.05, 0], sizeMeters: [0.1, 0.1, 1], restitution: 0 },
    { id: 'thin:trigger-collider', center: [0, 4.05, 0], sizeMeters: [0.1, 0.1, 1], trigger: true },
  ])
  const simulation = createXrPhysicsSimulation(world)
  stepXrPhysicsSimulation({ simulation, world, staticColliders: colliders })
  const bodies = captureXrPhysicsSimulation(simulation)
  const wallBody = bodies.find(body => body.subjectId === 'fast:wall')!
  assert(wallBody.contacts.includes('thin:wall'), 'swept static collision must record a thin wall crossed within one step')
  assert(wallBody.position[0] < 0 && wallBody.velocity[0] === 0, 'swept static collision must stop a fast dynamic body on the entry side')
  const bodyBody = bodies.find(body => body.subjectId === 'fast:body')!
  const blocker = bodies.find(body => body.subjectId === 'thin:blocker')!
  assert(bodyBody.contacts.includes('thin:blocker') && blocker.contacts.includes('fast:body'), 'swept body collision must record contacts on both bodies')
  assert(bodyBody.position[0] < 0 && bodyBody.velocity[0] === 0, 'swept body collision must stop a fast dynamic body before a thin static body')
  const colliderTrigger = bodies.find(body => body.subjectId === 'fast:trigger-collider')!
  assert(colliderTrigger.contacts.includes('thin:trigger-collider'), 'swept trigger collider must record a crossing contact')
  near(colliderTrigger.position[0], 2, 1e-9, 'trigger collider must not alter high-speed body motion')
  const bodyTrigger = bodies.find(body => body.subjectId === 'fast:trigger-body')!
  const trigger = bodies.find(body => body.subjectId === 'thin:trigger-body')!
  assert(bodyTrigger.contacts.includes('thin:trigger-body') && trigger.contacts.includes('fast:trigger-body'), 'swept trigger body must record contacts on both bodies')
  near(bodyTrigger.position[0], 2, 1e-9, 'trigger body must not alter high-speed body motion')
  const dynamicLeft = bodies.find(body => body.subjectId === 'fast:dynamic-left')!
  const dynamicRight = bodies.find(body => body.subjectId === 'fast:dynamic-right')!
  assert(dynamicLeft.contacts.includes('fast:dynamic-right') && dynamicRight.contacts.includes('fast:dynamic-left'), 'swept dynamic body collision must record contacts on both bodies')
  assert(dynamicLeft.position[0] < dynamicRight.position[0], 'swept dynamic bodies must not pass through and exchange sides')
  assert(dynamicLeft.velocity[0] === 0 && dynamicRight.velocity[0] === 0, 'swept dynamic body collision must apply the contact impulse')
}

function testEarliestTimeOfImpactWins(): void {
  const world = readXrPhysicsWorld({
    gravity: [0, 0, 0],
    fixedStepSeconds: 0.02,
    floor: { enabled: false },
    bodies: {
      'static:mover': {
        mode: 'dynamic', sizeMeters: [0.1, 0.1, 0.1], spawnPosition: [-2, 0, 0],
        initialVelocity: [200, 0, 0], friction: 0, restitution: 0, linearDamping: 0,
      },
      'a:far-body': {
        mode: 'static', sizeMeters: [0.1, 0.1, 0.1], spawnPosition: [0.8, 2, 0], restitution: 1,
      },
      'pair:mover': {
        mode: 'dynamic', sizeMeters: [0.1, 0.1, 0.1], spawnPosition: [-2, 2, 0],
        initialVelocity: [200, 0, 0], friction: 0, restitution: 0, linearDamping: 0,
      },
      'z:near-body': {
        mode: 'static', sizeMeters: [0.1, 0.1, 0.1], spawnPosition: [-0.5, 2, 0], restitution: 0,
      },
      'cross:mover': {
        mode: 'dynamic', sizeMeters: [0.1, 0.1, 0.1], spawnPosition: [-2, 4, 0],
        initialVelocity: [200, 0, 0], friction: 0, restitution: 0, linearDamping: 0,
      },
      'z:near-cross-body': {
        mode: 'static', sizeMeters: [0.1, 0.1, 0.1], spawnPosition: [-0.5, 4, 0], restitution: 0,
      },
    },
  })
  const colliders = readXrPhysicsStaticColliders([
    { id: 'a:far-collider', center: [0.8, 0.05, 0], sizeMeters: [0.1, 0.1, 1], restitution: 1 },
    { id: 'z:near-collider', center: [-0.5, 0.05, 0], sizeMeters: [0.1, 0.1, 1], restitution: 0 },
    { id: 'a:far-cross-wall', center: [1, 4.05, 0], sizeMeters: [0.1, 0.1, 1], restitution: 1 },
  ])
  const simulation = createXrPhysicsSimulation(world)
  stepXrPhysicsSimulation({ simulation, world, staticColliders: colliders })
  const bodies = captureXrPhysicsSimulation(simulation)
  const staticMover = bodies.find(body => body.subjectId === 'static:mover')!
  assert(staticMover.contacts.includes('z:near-collider'), 'earliest swept collider must record the reached contact')
  assert(!staticMover.contacts.includes('a:far-collider'), 'farther lexically earlier collider must remain physically unreached')
  assert(staticMover.velocity[0] === 0 && staticMover.position[0] < -0.5, 'near zero-restitution collider must own response')
  const pairMover = bodies.find(body => body.subjectId === 'pair:mover')!
  assert(pairMover.contacts.includes('z:near-body'), 'earliest swept body pair must record the reached contact')
  assert(!pairMover.contacts.includes('a:far-body'), 'farther lexically earlier body pair must remain physically unreached')
  assert(pairMover.velocity[0] === 0 && pairMover.position[0] < -0.5, 'near zero-restitution body must own pair response')
  const crossMover = bodies.find(body => body.subjectId === 'cross:mover')!
  assert(crossMover.contacts.includes('z:near-cross-body'), 'global event ordering must reach a nearer body before a farther collider')
  assert(!crossMover.contacts.includes('a:far-cross-wall'), 'far static collider must not respond before a nearer body-pair TOI')
  assert(crossMover.velocity[0] === 0, 'near cross-kind zero-restitution contact must own response')

  const floorWorld = readXrPhysicsWorld({
    gravity: [0, 0, 0], fixedStepSeconds: 0.02,
    floor: { enabled: true, height: -1, restitution: 1, friction: 0 },
    bodies: {
      'falling:body': {
        mode: 'dynamic', sizeMeters: [0.1, 0.1, 0.1], spawnPosition: [0, 2, 0],
        initialVelocity: [0, -200, 0], restitution: 0, friction: 0, linearDamping: 0,
      },
      'near:body': {
        mode: 'static', sizeMeters: [0.1, 0.1, 0.1], spawnPosition: [0, 0.5, 0], restitution: 0,
      },
    },
  })
  const floorSimulation = createXrPhysicsSimulation(floorWorld)
  stepXrPhysicsSimulation({ simulation: floorSimulation, world: floorWorld })
  const fallingBody = captureXrPhysicsSimulation(floorSimulation)
    .find(body => body.subjectId === 'falling:body')!
  assert(fallingBody.contacts.includes('near:body'), 'nearer body TOI must resolve before the infinite floor plane')
  assert(!fallingBody.contacts.includes('floor'), 'farther floor must remain unreachable after nearer body response')
  assert(fallingBody.velocity[1] === 0 && fallingBody.position[1] > 0.5, 'near zero-restitution body must suppress the later floor bounce')
}

function testStartOverlapAndKinematicSweeps(): void {
  const overlapWorld = readXrPhysicsWorld({
    gravity: [0, 0, 0], fixedStepSeconds: 0.02, floor: { enabled: false },
    bodies: {
      'escape:collider': {
        mode: 'dynamic', sizeMeters: [0.1, 0.1, 0.1], spawnPosition: [-0.05, 0, 0],
        initialVelocity: [200, 0, 0], restitution: 0, friction: 0, linearDamping: 0,
      },
      'escape:pair': {
        mode: 'dynamic', sizeMeters: [0.1, 0.1, 0.1], spawnPosition: [-0.05, 2, 0],
        initialVelocity: [200, 0, 0], restitution: 0, friction: 0, linearDamping: 0,
      },
      'overlap:blocker': {
        mode: 'static', sizeMeters: [0.1, 0.1, 0.1], spawnPosition: [0, 2, 0], restitution: 0,
      },
      'multi:escape': {
        mode: 'dynamic', sizeMeters: [0.2, 0.2, 0.2], spawnPosition: [0, 4, 0],
        initialVelocity: [200, 0, 200], restitution: 0, friction: 0, linearDamping: 0,
      },
    },
  })
  const overlapSimulation = createXrPhysicsSimulation(overlapWorld)
  stepXrPhysicsSimulation({
    simulation: overlapSimulation,
    world: overlapWorld,
    staticColliders: readXrPhysicsStaticColliders([
      { id: 'overlap:collider', center: [0, 0.05, 0], sizeMeters: [0.1, 0.1, 1], restitution: 0 },
      { id: 'a:x-wall', center: [0, 4.1, 0], sizeMeters: [0.1, 1, 2], restitution: 0 },
      { id: 'b:z-wall', center: [0, 4.1, 0], sizeMeters: [2, 1, 0.1], restitution: 0 },
    ]),
  })
  const escapedCollider = captureXrPhysicsSimulation(overlapSimulation)
    .find(body => body.subjectId === 'escape:collider')!
  assert(escapedCollider.contacts.includes('overlap:collider'), 'start-overlap collider escape must remain a t=0 contact')
  assert(escapedCollider.position[0] < 0 && escapedCollider.velocity[0] === 0, 'start-overlap collider must depenetrate and respond before escape')
  const escapedPair = captureXrPhysicsSimulation(overlapSimulation)
    .find(body => body.subjectId === 'escape:pair')!
  assert(escapedPair.contacts.includes('overlap:blocker'), 'start-overlap body escape must remain a t=0 contact')
  assert(escapedPair.position[0] < 0 && escapedPair.velocity[0] === 0, 'start-overlap body pair must depenetrate and respond before escape')
  const multiEscape = captureXrPhysicsSimulation(overlapSimulation)
    .find(body => body.subjectId === 'multi:escape')!
  assert(multiEscape.contacts.includes('a:x-wall') && multiEscape.contacts.includes('b:z-wall'), 'simultaneous t=0 overlaps must both record contacts')
  assert(multiEscape.position[0] < -0.1 && multiEscape.position[2] < -0.1, 't=0 depenetrations must accumulate across collision axes')
  assert(multiEscape.velocity[0] === 0 && multiEscape.velocity[2] === 0, 'each accumulated t=0 overlap must apply its response')

  hydrateXrPhysicsRuntime({
    sceneKey: 'scene:kinematic-sweep',
    subjects: [
      { subjectId: 'dynamic:target', position: [0, 4, 0], sizeMeters: [0.1, 0.1, 0.1] },
      { subjectId: 'kinematic:sweeper', position: [-2, 4, 0], sizeMeters: [0.1, 0.1, 0.1] },
    ],
    persistedValue: {
      gravity: [0, 0, 0], fixedStepSeconds: 0.02, floor: { enabled: false },
      bodies: {
        'dynamic:target': { mode: 'dynamic', restitution: 0, friction: 0, linearDamping: 0 },
        'kinematic:sweeper': { mode: 'kinematic', restitution: 0, friction: 0 },
      },
    },
  })
  playXrPhysicsRuntime()
  assert(setXrPhysicsKinematicPose('kinematic:sweeper', [2, 4, 0], [200, 0, 0]), 'kinematic pose update must accept derived velocity')
  assert(stepXrPhysicsRuntimeTicks(1).subSteps === 1, 'one exact tick must process retained kinematic motion')
  const dynamicTarget = readXrPhysicsBodyState('dynamic:target')!
  const kinematicSweeper = readXrPhysicsBodyState('kinematic:sweeper')!
  assert(dynamicTarget.contacts.includes('kinematic:sweeper') && kinematicSweeper.contacts.includes('dynamic:target'), 'retained kinematic sweep must contact a crossed dynamic body')
  assert(dynamicTarget.velocity[0] > 0, 'kinematic sweep velocity must transfer an impact impulse')
  near(kinematicSweeper.position[0], 2, 1e-9, 'kinematic body must remain at its authored endpoint after contact')
  stopXrPhysicsRuntime()
}

function testLosslessRuntimeBacklogAndExactTicks(): void {
  const subjects: readonly XrPhysicsSubjectSeed[] = [
    { subjectId: 'catch-up', position: [0, 1, 0], sizeMeters: [0.5, 0.5, 0.5] },
  ]
  hydrateXrPhysicsRuntime({
    sceneKey: 'scene:bounded-catch-up',
    subjects,
    persistedValue: {
      gravity: [0, 0, 0],
      fixedStepSeconds: 0.01,
      maxSubSteps: 5,
      floor: { enabled: false },
      bodies: {
        'catch-up': {
          mode: 'dynamic',
          initialVelocity: [1, 0, 0],
          linearDamping: 0,
        },
      },
    },
  })
  playXrPhysicsRuntime()
  const firstBatch = stepXrPhysicsRuntime(0.1)
  assert(firstBatch.subSteps === 5 && firstBatch.stepCount === 5, 'one frame must respect the configured substep budget')
  near(readXrPhysicsBodyState('catch-up')!.position[0], 0.05, 1e-9, 'first substep batch must advance only its processed time')
  const catchUpBatch = stepXrPhysicsRuntime(0)
  assert(catchUpBatch.subSteps === 5 && catchUpBatch.stepCount === 10, 'step(0) must process retained fixed-step backlog')
  near(readXrPhysicsBodyState('catch-up')!.position[0], 0.1, 1e-9, 'retained backlog must preserve accepted elapsed time')
  stopXrPhysicsRuntime()

  hydrateXrPhysicsRuntime({
    sceneKey: 'scene:sustained-backlog',
    subjects,
    persistedValue: {
      gravity: [0, 0, 0], fixedStepSeconds: 0.01, maxSubSteps: 1, floor: { enabled: false },
      bodies: { 'catch-up': { mode: 'dynamic', initialVelocity: [1, 0, 0], linearDamping: 0 } },
    },
  })
  playXrPhysicsRuntime()
  for (let frame = 0; frame < 8; frame += 1) {
    assert(stepXrPhysicsRuntime(0.25).subSteps === 1, 'sustained frames must remain bounded by maxSubSteps')
  }
  for (let tick = 0; tick < 192; tick += 1) {
    assert(stepXrPhysicsRuntime(0).subSteps === 1, 'all sustained elapsed time must remain drainable')
  }
  assert(stepXrPhysicsRuntime(0).subSteps === 0, 'backlog must become idle only after every accepted tick drains')
  assert(readXrPhysicsRuntimeFrame().stepCount === 200, 'eight quarter-second frames must preserve two full simulated seconds')
  near(readXrPhysicsBodyState('catch-up')!.position[0], 2, 1e-9, 'sustained backlog must preserve full elapsed motion')
  stopXrPhysicsRuntime()

  hydrateXrPhysicsRuntime({
    sceneKey: 'scene:unclamped-elapsed',
    subjects,
    persistedValue: {
      gravity: [0, 0, 0], fixedStepSeconds: 0.01, maxSubSteps: 1, floor: { enabled: false },
      bodies: { 'catch-up': { mode: 'dynamic', initialVelocity: [1, 0, 0], linearDamping: 0 } },
    },
  })
  playXrPhysicsRuntime()
  assert(stepXrPhysicsRuntime(0.5).subSteps === 1, 'one large frame must still obey its substep budget')
  for (let tick = 0; tick < 49; tick += 1) stepXrPhysicsRuntime(0)
  assert(readXrPhysicsRuntimeFrame().stepCount === 50, 'finite elapsed input must not be clipped to a quarter second')
  stopXrPhysicsRuntime()

  hydrateXrPhysicsRuntime({
    sceneKey: 'scene:exact-ticks',
    subjects,
    persistedValue: {
      gravity: [0, 0, 0], fixedStepSeconds: 0.01, maxSubSteps: 1, floor: { enabled: false },
      bodies: { 'catch-up': { mode: 'dynamic', initialVelocity: [1, 0, 0], linearDamping: 0 } },
    },
  })
  playXrPhysicsRuntime()
  assert(stepXrPhysicsRuntime(0.07).stepCount === 1, 'ordinary frame must queue excess fixed time')
  pauseXrPhysicsRuntime()
  const exact = stepXrPhysicsRuntimeTicks(3)
  assert(exact.subSteps === 3 && exact.stepCount === 4, 'manual step must advance exactly requested ticks beyond maxSubSteps')
  assert(readXrPhysicsRuntime().phase === 'paused', 'manual exact stepping must preserve paused transport')
  playXrPhysicsRuntime()
  for (let tick = 0; tick < 3; tick += 1) assert(stepXrPhysicsRuntime(0).subSteps === 1, 'manual ticks must consume only their queued fixed intervals')
  assert(stepXrPhysicsRuntime(0).subSteps === 0 && readXrPhysicsRuntimeFrame().stepCount === 7, 'queued elapsed time must drain exactly once')
  near(readXrPhysicsBodyState('catch-up')!.position[0], 0.07, 1e-9, 'exact ticks and queued ticks must not duplicate elapsed motion')
  stopXrPhysicsRuntime()
}

function testRuntimeTransportIsolationAndFailClosedMutations(): void {
  const subjects = arbitrarySubjects()
  hydrateXrPhysicsRuntime({
    sceneKey: 'scene:arbitrary-runtime',
    persistedValue: persistedWorldWithOrder(subjects.map(subject => subject.subjectId)),
    subjects,
  })
  resetXrPhysicsRuntime()
  const rollbackPoint = readXrPhysicsRuntime()
  configureXrPhysicsBody('renamed.subject/zeta', { mass: 9 })
  assert(readXrPhysicsRuntime().world.bodies.find(body => body.subjectId === 'renamed.subject/zeta')?.mass === 9, 'valid config mutation must apply')
  restoreXrPhysicsRuntimeSnapshot(rollbackPoint)
  assert(readXrPhysicsRuntime().world.bodies.find(body => body.subjectId === 'renamed.subject/zeta')?.mass === 2, 'runtime rollback must restore persistent config and reset transport')
  let notifications = 0
  const unsubscribe = subscribeXrPhysicsRuntime(() => { notifications += 1 })
  playXrPhysicsRuntime()
  const playNotifications = notifications
  const persistentBefore = JSON.stringify(serializeXrPhysicsRuntimeWorld())
  assert(applyXrPhysicsImpulse('renamed.subject/zeta', [2, 4, 0]), 'dynamic bodies must accept finite impulses while active')
  for (let index = 0; index < 60; index += 1) stepXrPhysicsRuntime(1 / 60)
  assert(notifications === playNotifications, 'per-frame stepping must not publish to runtime subscribers')
  const moved = readXrPhysicsBodyState('renamed.subject/zeta')!
  assert(moved.position[1] !== 3 && moved.velocity.every(Number.isFinite), 'runtime stepping must update a finite transient pose')
  assert(JSON.stringify(serializeXrPhysicsRuntimeWorld()) === persistentBefore, 'transient simulation must never leak into persisted world config')
  pauseXrPhysicsRuntime()
  const paused = readXrPhysicsBodyState('renamed.subject/zeta')!
  stepXrPhysicsRuntime(0.2)
  assert(JSON.stringify(readXrPhysicsBodyState('renamed.subject/zeta')) === JSON.stringify(paused), 'paused transport must not advance')
  stopXrPhysicsRuntime()
  const stopped = readXrPhysicsBodyState('renamed.subject/zeta')!
  assert(JSON.stringify(stopped.position) === JSON.stringify([0, 3, 0]), 'stop must restore the authored spawn pose')
  assert(!applyXrPhysicsImpulse('renamed.subject/zeta', [1, 0, 0]), 'stopped transport must reject transient impulses')
  const revision = readXrPhysicsRuntime().revision
  configureXrPhysicsBody('renamed.subject/zeta', { mass: Number.NaN })
  assert(readXrPhysicsRuntime().revision === revision, 'non-finite body mutation must fail closed without a revision')
  configureXrPhysicsBody('not-a-real-subject', { mass: Number.NaN })
  assert(readXrPhysicsRuntime().revision === revision, 'unknown body mutation must fail closed without a revision')
  attachXrPhysicsBody({ subjectId: 'not-a-real-subject' })
  assert(readXrPhysicsRuntime().revision === revision, 'unknown attachment must fail closed without synthesizing a subject')
  unsubscribe()
}

function testImplementationBoundary(): void {
  assert(XR_PHYSICS_GRAPH_METADATA_KEY === 'kgXrPhysicsWorld', 'physics must use its versioned graph metadata owner')
  const implementation = [
    source('features', 'three', 'xrPhysicsModel.ts'),
    source('features', 'three', 'xrSpatialPhysicsAdapter.ts'),
    source('features', 'physics', 'spatialPhysicsEngine.ts'),
    source('features', 'physics', 'spatialPhysicsStep.ts'),
    source('features', 'three', 'xrPhysicsRuntime.ts'),
    readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    readFileSync(resolve(process.cwd(), '..', 'package-lock.json'), 'utf8'),
  ].join('\n').toLowerCase()
  const forbidden = [
    ['8th', 'wall'].join(''),
    ['studio', 'physics', 'playground', 'example'].join('-'),
    ['@', '8th', 'wall', '/', 'ecs'].join(''),
  ]
  for (const marker of forbidden) {
    assert(!implementation.includes(marker), `native physics implementation must not contain forbidden external marker ${marker}`)
  }
  for (const implementationSource of [
    source('features', 'three', 'xrPhysicsModel.ts'),
    source('features', 'three', 'xrSpatialPhysicsAdapter.ts'),
    source('features', 'physics', 'spatialPhysicsEngine.ts'),
    source('features', 'physics', 'spatialPhysicsStep.ts'),
    source('features', 'three', 'xrPhysicsRuntime.ts'),
  ]) {
    assert(implementationSource.split('\n').length < 600, 'new physics source files must remain below the source budget')
    assert(!/from\s+['"](?!\.)[^'"]+['"]/.test(implementationSource), 'native physics core must not import an external runtime')
  }
}

function testStrictSceneInvocationGrammar(): void {
  const subjectId = 'xr-subject:arbitrary-asset:19'
  const attach = parseXrInteractiveInvocation(`/xr.physics @canvas #body operation=attach subject=${subjectId} mode=dynamic mass=2`)
  assert(attach?.action === 'physics' && attach.physics.subjectId === subjectId, 'body grammar must preserve arbitrary ids through a typed subject field')
  const play = parseXrInteractiveInvocation('/xr.physics @canvas #world operation=play')
  assert(play?.action === 'physics' && play.physics.operation === 'play', 'world grammar must normalize slash, binding, and semantic tokens')
  const present = parseXrInteractiveInvocation('/xr.present @scene #reticle')
  assert(present?.action === 'present', 'AR placement grammar must require the scene binding and reticle semantic')
  for (const invalid of [
    '/xr.physics @canvas @scene #world operation=play',
    '/xr.physics @canvas #world #body operation=play',
    '/xr.physics @canvas #body operation=attach subject=x mode=dynamic mass=2 mass=3',
    '/xr.physics @canvas #impulse operation=impulse subject=x vector=0,not-a-number,1',
    '/xr.present @canvas #reticle',
  ]) {
    assert(parseXrInteractiveInvocation(invalid) === null, `interactive grammar must fail closed for ${invalid}`)
  }
  assert(normalizeXrPhysicsControl({ scope: 'impulse', operation: 'impulse', subjectId, impulse: [0, 4, -1] })?.subjectId === subjectId, 'structured MCP physics must share the normalized control contract')
  assert(normalizeXrPhysicsControl({ scope: 'world', operation: 'play', gravity: [0, -9.81, 0] }) === null, 'Play must reject world-configuration fields')
  assert(normalizeXrPhysicsControl({ scope: 'body', operation: 'detach', subjectId, massKg: 3 }) === null, 'Detach must reject body-configuration fields')
  assert(normalizeXrPhysicsControl({ scope: 'world', operation: 'play', subjectId }) === null, 'World transport must reject subject fields')
  assert(normalizeXrPhysicsControl({ scope: 'world', operation: 'play', vendorExtension: true }) === null, 'Structured physics must reject unknown fields')
  assert(normalizeXrPhysicsControl({ scope: 'body', operation: 'detach', subjectId: '100% authored' })?.subjectId === '100% authored', 'Structured subject ids must not be URI-decoded')
  assert(normalizeXrPhysicsControl({ scope: 'body', operation: 'attach', subjectId, bodyMode: 'dynamic', massKg: '2' }) === null, 'Structured physics must reject numeric string coercion that its schema rejects')
  assert(normalizeXrPhysicsControl({ scope: 'world ', operation: 'play' }) === null, 'Structured physics must enforce exact schema enum values')
  assert(normalizeXrPhysicsControl({ scope: 'world', operation: 'configure', gravity: '0,-9.81,0' }) === null, 'Structured physics must reject vector string coercion that its schema rejects')
  assert(normalizeXrPhysicsControl({ scope: 'body', operation: 'detach', subjectId: '🙂'.repeat(160) })?.subjectId === '🙂'.repeat(160), 'Structured subject limits must count Unicode code points')
  assert(normalizeXrPhysicsControl({ scope: 'body', operation: 'detach', subjectId: '🙂'.repeat(161) }) === null, 'Structured physics must reject overlong subject ids instead of truncating them')
  assert(normalizeXrPhysicsControl({ scope: 'body', operation: 'detach', subjectId: ` ${'x'.repeat(160)} ` }) === null, 'Structured physics must apply schema length limits before trimming subject ids')
  assert(normalizeXrSceneControl({ action: 'present' })?.action === 'present', 'structured UI scene controls must remain valid')
  assert(normalizeXrSceneControl({ action: 'label', subjectId, label: '🙂'.repeat(80) })?.label === '🙂'.repeat(80), 'Structured scene label limits must count Unicode code points')
  assert(normalizeXrSceneControl({ action: 'label', subjectId, label: '🙂'.repeat(81) }) === null, 'Structured scene controls must reject overlong labels instead of truncating them')
  assert(normalizeXrSceneControl({ invocation: 123 } as never) === null, 'Structured scene controls must reject non-string invocations')
  assert(normalizeXrSceneControl({
    invocation: '/xr.present @scene #reticle',
    action: 'present',
  }) === null, 'invocation scene controls must reject contradictory structured fields')
  assert(normalizeXrSceneControl({
    action: 'physics',
    physics: { scope: 'world', operation: 'play' },
    subjectId,
  }) === null, 'structured scene controls must reject fields from another action shape')
}

export function testXrPhysicsRuntimeIsNativeDeterministicAndDataDriven(): void {
  testStableArbitraryIdSerialization()
  assertCollisionBitfieldDomainMatchesUiAndMcp()
  testDeterministicFixedStepAndCollisions()
  testSweptHighSpeedCollisions()
  testEarliestTimeOfImpactWins()
  testStartOverlapAndKinematicSweeps()
  testLosslessRuntimeBacklogAndExactTicks()
  testRuntimeTransportIsolationAndFailClosedMutations()
  testImplementationBoundary()
  testStrictSceneInvocationGrammar()
}
