import {
  captureXrPhysicsSimulation,
  createXrPhysicsSimulation,
  resetXrPhysicsSimulation,
  setXrPhysicsSimulationBodyPose,
  stepXrPhysicsSimulation,
} from '@/features/three/xrSpatialPhysicsAdapter'
import {
  readXrPhysicsStaticColliders,
  readXrPhysicsWorld,
} from '@/features/three/xrPhysicsModel'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function near(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`)
  }
}

function testTriggerSensorsAndStaticInteractionAccounting(): void {
  const world = readXrPhysicsWorld({
    gravity: [0, 0, 0],
    fixedStepSeconds: 0.02,
    floor: { enabled: true, height: 0 },
    bodies: {
      mover: {
        mode: 'dynamic', spawnPosition: [10, 10, 0], initialVelocity: [1, 0, 0],
        linearDamping: 0,
      },
      sensor: {
        mode: 'trigger', sizeMeters: [1, 1, 1], spawnPosition: [0, -0.25, 0],
      },
    },
  })
  const staticColliders = readXrPhysicsStaticColliders([
    { id: 'static:a', center: [100, 10, 0], sizeMeters: [2, 2, 2] },
    { id: 'static:b', center: [100, 10, 0], sizeMeters: [2, 2, 2] },
  ])
  const simulation = createXrPhysicsSimulation(world, staticColliders)
  const result = stepXrPhysicsSimulation({ simulation, world, stepSeconds: 0.01 })
  const bodies = captureXrPhysicsSimulation(simulation)
  const mover = bodies.find(body => body.subjectId === 'mover')!
  const sensor = bodies.find(body => body.subjectId === 'sensor')!
  near(mover.position[0], 10.01, 1e-12, 'optional step seconds must own integration and elapsed accounting')
  near(result.elapsedSeconds, 0.01, 1e-12, 'optional step seconds must advance elapsed time once')
  assert(sensor.contacts.includes('floor') && sensor.position[1] === -0.25,
    'moving-capable trigger bodies must report ground sensor contact without a solid response')
  assert(simulation.engine.captureSnapshot().activeInteractions.length === 2,
    'fixture must include one XR sensor interaction and one engine-only static pair')
  assert(result.contactCount === 1, 'XR contact count must exclude engine-only static pairs')
  const eventKinds = result.events.map(event => event.kind)
  assert(eventKinds.length === 2
    && eventKinds.includes('collision-began') && eventKinds.includes('sensor-began'),
    'adapter step results must preserve native spatial collision and sensor events')
  assert(Object.isFrozen(result.events) && result.events.every(event => Object.isFrozen(event.colliderIds)),
    'adapter step results must expose an immutable event snapshot')
  resetXrPhysicsSimulation(simulation, world, staticColliders)
  assert(simulation.stepCount === 0 && simulation.engine.captureSnapshot().colliders.length === 4,
    'reset must restore bodies and accepted static colliders together')
}

function testChangedStepRetainsQueuedKinematicSweep(): void {
  const world = readXrPhysicsWorld({
    gravity: [0, 0, 0], fixedStepSeconds: 0.02, floor: { enabled: false },
    bodies: {
      target: {
        mode: 'dynamic', sizeMeters: [0.1, 0.1, 0.1], spawnPosition: [0, 2, 0],
        linearDamping: 0,
      },
      sweeper: {
        mode: 'kinematic', sizeMeters: [0.1, 0.1, 0.1], spawnPosition: [-2, 2, 0],
      },
    },
  })
  const simulation = createXrPhysicsSimulation(world)
  assert(setXrPhysicsSimulationBodyPose(simulation, 'sweeper', [2, 2, 0], [400, 0, 0]),
    'kinematic pose must queue its original sweep')
  stepXrPhysicsSimulation({ simulation, world, stepSeconds: 0.01 })
  const bodies = captureXrPhysicsSimulation(simulation)
  const target = bodies.find(body => body.subjectId === 'target')!
  assert(target.contacts.includes('sweeper'),
    'changing the accepted fixed step must preserve a queued kinematic sweep')
}

function testDirectWorldChangesReconfigureTheEngine(): void {
  const initialWorld = readXrPhysicsWorld({
    gravity: [0, 0, 0], fixedStepSeconds: 0.02, floor: { enabled: false },
    bodies: {
      falling: {
        mode: 'dynamic', sizeMeters: [1, 1, 1], spawnPosition: [0, 2, 0],
        linearDamping: 0,
      },
    },
  })
  const simulation = createXrPhysicsSimulation(initialWorld)
  stepXrPhysicsSimulation({ simulation, world: initialWorld, stepSeconds: 0.01 })
  const changedWorld = readXrPhysicsWorld({
    gravity: [0, -10, 0], fixedStepSeconds: 0.02, floor: { enabled: false },
    bodies: {
      falling: {
        mode: 'dynamic', sizeMeters: [1, 2, 1], spawnPosition: [0, 2, 0],
        linearDamping: 0,
      },
    },
  })
  stepXrPhysicsSimulation({ simulation, world: changedWorld, stepSeconds: 0.01 })
  const falling = captureXrPhysicsSimulation(simulation)[0]!
  near(falling.position[1], 1.999, 1e-12,
    'world rebuild must preserve the bottom-anchored pose while accepting a changed collider height')
  near(falling.velocity[1], -0.1, 1e-12,
    'direct world gravity changes must reconfigure the spatial engine before the next step')
}

export function testXrSpatialPhysicsAdapterPreservesXrContracts(): void {
  testTriggerSensorsAndStaticInteractionAccounting()
  testChangedStepRetainsQueuedKinematicSweep()
  testDirectWorldChangesReconfigureTheEngine()
}
