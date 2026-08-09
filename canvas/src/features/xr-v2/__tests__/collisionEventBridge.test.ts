import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { SpatialPhysicsEvent, SpatialPhysicsEventKind } from '../../physics/spatialPhysicsTypes'
import {
  createXrPhysicsSimulation,
  stepXrPhysicsSimulation,
} from '../../three/xrSpatialPhysicsAdapter'
import {
  readXrPhysicsWorld,
  serializeXrPhysicsWorld,
} from '../../three/xrPhysicsModel'
import {
  hydrateXrPhysicsRuntime,
  playXrPhysicsRuntime,
  stepXrPhysicsRuntimeTicks,
  stopXrPhysicsRuntime,
} from '../../three/xrPhysicsRuntime'
import {
  BEHAVIOR_DISPATCH_GRAPH_SCHEMA,
  createExactOnceBehaviorDispatcher,
  type AuthoringBehaviorGraph,
} from '../behaviorDispatcher'
import { createXrV2CollisionEventBridge } from '../collisionEventBridge'

const collisionGraph: AuthoringBehaviorGraph = {
  schema: BEHAVIOR_DISPATCH_GRAPH_SCHEMA,
  actions: [
    { id: 'begin-action', kind: 'set-visible', targetEntityId: 8 },
    { id: 'end-action', kind: 'set-visible', targetEntityId: 8 },
  ],
  behaviors: [
    { id: 'begin-behavior', trigger: 'collision-begin', sourceEntityId: 7, actionIds: ['begin-action'] },
    { id: 'end-behavior', trigger: 'collision-end', sourceEntityId: 7, actionIds: ['end-action'] },
  ],
}

function contactEvent(
  kind: SpatialPhysicsEventKind,
  tick: number,
  colliderIds: readonly [string, string] = ['collider-b', 'collider-a'],
): SpatialPhysicsEvent {
  return {
    kind,
    tick,
    colliderIds,
    bodyIds: ['body-b', 'body-a'],
  }
}

test('collision bridge routes one normalized begin and end per native contact event', () => {
  const invoked: string[] = []
  const dispatcher = createExactOnceBehaviorDispatcher(collisionGraph, ({ action }) => invoked.push(action.id))
  const bridge = createXrV2CollisionEventBridge({
    dispatcher,
    bindings: [{ colliderIds: ['collider-a', 'collider-b'], sourceEntityId: 7 }],
  })

  const [began] = bridge.route([contactEvent('collision-began', 4)])
  const [ended] = bridge.route([contactEvent('collision-ended', 9)])

  assert.match(began!.eventId, /^contact:[0-9a-f]{16}$/)
  assert.match(ended!.eventId, /^contact:[0-9a-f]{16}$/)
  assert.notEqual(began!.eventId, ended!.eventId)
  assert.deepEqual({ ...began, eventId: 'compact' }, {
    eventId: 'compact',
    kind: 'collision-begin',
    colliderIds: ['collider-a', 'collider-b'],
    status: 'dispatched',
    invokedActionIds: ['begin-action'],
  })
  assert.deepEqual({ ...ended, eventId: 'compact' }, {
    eventId: 'compact',
    kind: 'collision-end',
    colliderIds: ['collider-a', 'collider-b'],
    status: 'dispatched',
    invokedActionIds: ['end-action'],
  })
  assert.deepEqual(invoked, ['begin-action', 'end-action'])
})

test('collision bridge records an unbound native event without consuming dispatcher revision', () => {
  const dispatcher = createExactOnceBehaviorDispatcher(collisionGraph, () => {
    throw new Error('unbound contact must not invoke an action')
  })
  const bridge = createXrV2CollisionEventBridge({ dispatcher, bindings: [] })

  const [unbound] = bridge.route([contactEvent('collision-began', 1)])

  assert.equal(unbound?.status, 'unbound')
  assert.deepEqual(unbound?.invokedActionIds, [])
  assert.equal(dispatcher.getRevision(), 0)
  assert.deepEqual(bridge.seenEventIds(), [unbound?.eventId])
})

test('collision bridge replays the consumed revision as stale and invokes its action exactly once', () => {
  let invocationCount = 0
  const dispatcher = createExactOnceBehaviorDispatcher(collisionGraph, () => { invocationCount += 1 })
  const bridge = createXrV2CollisionEventBridge({
    dispatcher,
    bindings: [{ colliderIds: ['collider-b', 'collider-a'], sourceEntityId: 7 }],
  })
  const event = contactEvent('collision-began', 12)

  const [accepted] = bridge.route([event])
  const [replay] = bridge.route([event])

  assert.equal(accepted?.status, 'dispatched')
  assert.deepEqual(accepted?.invokedActionIds, ['begin-action'])
  assert.equal(replay?.status, 'stale')
  assert.deepEqual(replay?.invokedActionIds, [])
  assert.equal(invocationCount, 1)
  assert.equal(dispatcher.getRevision(), 1)
})

test('a reset starts a new replay epoch only by constructing a new bridge', () => {
  let invocationCount = 0
  const dispatcher = createExactOnceBehaviorDispatcher(collisionGraph, () => { invocationCount += 1 })
  const binding = [{ colliderIds: ['collider-a', 'collider-b'] as const, sourceEntityId: 7 }]
  const event = contactEvent('collision-began', 3)
  const firstEpoch = createXrV2CollisionEventBridge({ dispatcher, bindings: binding })

  assert.equal(firstEpoch.route([event])[0]?.status, 'dispatched')
  assert.equal(firstEpoch.route([event])[0]?.status, 'stale')

  const resetEpoch = createXrV2CollisionEventBridge({ dispatcher, bindings: binding })
  assert.equal(resetEpoch.route([event])[0]?.status, 'dispatched')
  assert.equal(invocationCount, 2)
  assert.equal(dispatcher.getRevision(), 2)
})

test('collision bridge keeps delimiter-bearing collider pairs distinct', () => {
  let invocationCount = 0
  const dispatcher = createExactOnceBehaviorDispatcher(collisionGraph, () => { invocationCount += 1 })
  const bridge = createXrV2CollisionEventBridge({
    dispatcher,
    bindings: [
      { colliderIds: ['a', 'b|c'], sourceEntityId: 7 },
      { colliderIds: ['a|b', 'c'], sourceEntityId: 7 },
    ],
  })

  const [first, second] = bridge.route([
    contactEvent('collision-began', 1, ['a', 'b|c']),
    contactEvent('collision-began', 1, ['a|b', 'c']),
  ])

  assert.equal(first?.status, 'dispatched')
  assert.equal(second?.status, 'dispatched')
  assert.notEqual(first?.eventId, second?.eventId)
  assert.equal(invocationCount, 2)
})

test('collision bridge ignores preserved sensor events without consuming replay capacity', () => {
  const dispatcher = createExactOnceBehaviorDispatcher(collisionGraph, () => {
    throw new Error('sensor contacts must not enter the collision behavior bridge')
  })
  const bridge = createXrV2CollisionEventBridge({
    dispatcher,
    bindings: [{ colliderIds: ['collider-a', 'collider-b'], sourceEntityId: 7 }],
    maxSeenEvents: 1,
  })

  const dispatches = bridge.route([
    contactEvent('sensor-began', 1),
    contactEvent('sensor-ended', 2),
  ])

  assert.deepEqual(dispatches, [])
  assert.deepEqual(bridge.seenEventIds(), [])
  assert.equal(dispatcher.getRevision(), 0)
})

test('collision bridge reports capacity exhaustion without action invocation or ledger eviction', () => {
  let invocationCount = 0
  const dispatcher = createExactOnceBehaviorDispatcher(collisionGraph, () => { invocationCount += 1 })
  const bridge = createXrV2CollisionEventBridge({
    dispatcher,
    bindings: [{ colliderIds: ['collider-a', 'collider-b'], sourceEntityId: 7 }],
    maxSeenEvents: 1,
  })

  const [accepted] = bridge.route([contactEvent('collision-began', 1)])
  const [exhausted] = bridge.route([contactEvent('collision-began', 2)])
  const [replay] = bridge.route([contactEvent('collision-began', 1)])
  const [stillExhausted] = bridge.route([contactEvent('collision-began', 2)])

  assert.equal(accepted?.status, 'dispatched')
  assert.equal(exhausted?.status, 'capacity-exhausted')
  assert.deepEqual(exhausted?.invokedActionIds, [])
  assert.equal(replay?.status, 'stale')
  assert.equal(stillExhausted?.status, 'capacity-exhausted')
  assert.equal(invocationCount, 1)
  assert.deepEqual(bridge.seenEventIds(), [accepted?.eventId])
})

test('collision bridge fails reentrant dispatch closed and admits one later retry', () => {
  let nestedStatus: string | undefined
  let invocationCount = 0
  let bridge: ReturnType<typeof createXrV2CollisionEventBridge>
  const dispatcher = createExactOnceBehaviorDispatcher(collisionGraph, () => {
    invocationCount += 1
    nestedStatus = bridge.route([contactEvent('collision-began', 2)])[0]?.status
  })
  bridge = createXrV2CollisionEventBridge({
    dispatcher,
    bindings: [{ colliderIds: ['collider-a', 'collider-b'], sourceEntityId: 7 }],
  })

  assert.equal(bridge.route([contactEvent('collision-began', 1)])[0]?.status, 'dispatched')
  assert.equal(nestedStatus, 'reentrant')
  assert.equal(bridge.route([contactEvent('collision-began', 2)])[0]?.status, 'dispatched')
  assert.equal(invocationCount, 2)
  assert.equal(dispatcher.getRevision(), 2)
})

test('collision bridge rejects malformed events and invalid replay capacities with TypeError', () => {
  let invocationCount = 0
  const dispatcher = createExactOnceBehaviorDispatcher(collisionGraph, () => { invocationCount += 1 })
  const bridge = createXrV2CollisionEventBridge({
    dispatcher,
    bindings: [{ colliderIds: ['collider-a', 'collider-b'], sourceEntityId: 7 }],
  })
  const invalidKind = { ...contactEvent('collision-began', 1), kind: 'collision-started' }
  const invalidBodies = { ...contactEvent('collision-began', 1), bodyIds: ['body-a', ' '] }

  assert.throws(
    () => bridge.route([invalidKind as unknown as SpatialPhysicsEvent]),
    TypeError,
  )
  assert.throws(
    () => bridge.route([
      contactEvent('collision-began', 1),
      invalidBodies as unknown as SpatialPhysicsEvent,
    ]),
    TypeError,
  )
  assert.equal(invocationCount, 0)
  assert.equal(dispatcher.getRevision(), 0)
  assert.deepEqual(bridge.seenEventIds(), [])
  for (const maxSeenEvents of [0, 4_097]) {
    assert.throws(
      () => createXrV2CollisionEventBridge({ dispatcher, bindings: [], maxSeenEvents }),
      TypeError,
    )
  }
})

test('XR adapter and runtime step results preserve native spatial physics events', () => {
  const world = readXrPhysicsWorld({
    gravity: [0, 0, 0],
    fixedStepSeconds: 0.02,
    floor: { enabled: false },
    bodies: {
      mover: {
        mode: 'dynamic', sizeMeters: [1, 1, 1], spawnPosition: [0, 2, 0], linearDamping: 0,
      },
      blocker: {
        mode: 'trigger', sizeMeters: [1, 1, 1], spawnPosition: [0, 2, 0],
      },
    },
  })
  const adapterResult = stepXrPhysicsSimulation({
    simulation: createXrPhysicsSimulation(world),
    world,
  })
  assert.deepEqual(adapterResult.events.map(event => event.kind), ['sensor-began'])
  assert.equal(Object.isFrozen(adapterResult.events), true)
  assert.equal(Object.isFrozen(adapterResult.events[0]?.colliderIds), true)

  hydrateXrPhysicsRuntime({
    sceneKey: 'collision-event-preservation-test',
    persistedValue: serializeXrPhysicsWorld(world),
    subjects: [
      { subjectId: 'mover', position: [0, 2, 0], sizeMeters: [1, 1, 1] },
      { subjectId: 'blocker', position: [0, 2, 0], sizeMeters: [1, 1, 1] },
    ],
  })
  playXrPhysicsRuntime()
  const runtimeResult = stepXrPhysicsRuntimeTicks(1)
  stopXrPhysicsRuntime()
  const stoppedResult = stepXrPhysicsRuntimeTicks(1)

  assert.deepEqual(runtimeResult.events, adapterResult.events)
  assert.equal(Object.isFrozen(runtimeResult.events), true)
  assert.deepEqual(stoppedResult.events, [])
  assert.equal(Object.isFrozen(stoppedResult.events), true)
})
