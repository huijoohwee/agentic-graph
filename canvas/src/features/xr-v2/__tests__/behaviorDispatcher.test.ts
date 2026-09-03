import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  BEHAVIOR_GRAPH_SCHEMA,
  BEHAVIOR_DISPATCH_GRAPH_SCHEMA,
  createAgenticOsBehaviorGraphContract,
  createAgenticOsBehaviorGraphBrowserStorage,
  createExactOnceBehaviorDispatcher,
  parseAgenticOsBehaviorGraphContract,
  publishAgenticOsBehaviorGraphContract,
  type AuthoringBehaviorGraph,
} from '../behaviorDispatcher'

const behaviorGraph: AuthoringBehaviorGraph = {
  schema: BEHAVIOR_DISPATCH_GRAPH_SCHEMA,
  actions: [
    { id: 'show-panel', kind: 'set-visible', targetEntityId: 2 },
    { id: 'emit-spark', kind: 'particle-burst', targetEntityId: 3 },
  ],
  behaviors: [
    { id: 'select-a', trigger: 'select', sourceEntityId: 1, actionIds: ['show-panel', 'emit-spark'] },
    { id: 'select-b', trigger: 'select', sourceEntityId: 1, actionIds: ['show-panel'] },
  ],
}

test('behavior dispatcher invokes each matching action exactly once per accepted revision', () => {
  const invocations: string[] = []
  const dispatcher = createExactOnceBehaviorDispatcher(behaviorGraph, ({ action }) => invocations.push(action.id))
  const event = { id: 'event-1', revision: 1, trigger: 'select' as const, sourceEntityId: 1 }

  const accepted = dispatcher.dispatch(event)
  const replay = dispatcher.dispatch(event)

  assert.equal(accepted.status, 'dispatched')
  assert.deepEqual(accepted.invokedActionIds, ['show-panel', 'emit-spark'])
  assert.deepEqual(invocations, ['show-panel', 'emit-spark'])
  assert.equal(replay.status, 'stale')
  assert.equal(dispatcher.getRevision(), 1)
})

test('behavior dispatcher rejects gaps and commits failures without retrying actions', () => {
  let attempts = 0
  const dispatcher = createExactOnceBehaviorDispatcher(behaviorGraph, ({ action }) => {
    attempts += 1
    if (action.id === 'show-panel') throw new Error('owner rejected action')
  })

  assert.equal(dispatcher.dispatch({ id: 'event-2', revision: 2, trigger: 'select', sourceEntityId: 1 }).status, 'out-of-order')
  const accepted = dispatcher.dispatch({ id: 'event-1', revision: 1, trigger: 'select', sourceEntityId: 1 })
  assert.equal(accepted.status, 'dispatched-with-errors')
  assert.equal(accepted.errors.length, 1)
  assert.equal(attempts, 2)
  assert.equal(dispatcher.dispatch({ id: 'event-1', revision: 1, trigger: 'select', sourceEntityId: 1 }).status, 'stale')
  assert.equal(attempts, 2)
})

test('behavior dispatcher accepts entity zero and snapshots bounded parameters', () => {
  const parameters = { nested: { label: 'before' } }
  const entityZeroGraph: AuthoringBehaviorGraph = {
    schema: BEHAVIOR_DISPATCH_GRAPH_SCHEMA,
    actions: [{ id: 'entity-zero-action', kind: 'set-visible', targetEntityId: 0, parameters }],
    behaviors: [{ id: 'entity-zero-behavior', trigger: 'select', sourceEntityId: 0, actionIds: ['entity-zero-action'] }],
  }
  const observed: unknown[] = []
  const dispatcher = createExactOnceBehaviorDispatcher(entityZeroGraph, invocation => observed.push(invocation.action.parameters))
  parameters.nested.label = 'after'

  const accepted = dispatcher.dispatch({ id: 'event-zero', revision: 1, trigger: 'select', sourceEntityId: 0 })
  assert.equal(accepted.status, 'dispatched')
  assert.equal(((observed[0] as { nested: { label: string } }).nested.label), 'before')
  assert.equal(Object.getPrototypeOf(observed[0] as object), null)
  assert.equal(Object.isFrozen((observed[0] as { nested: object }).nested), true)

  const oversized = 'x'.repeat(16_385)
  assert.throws(() => createExactOnceBehaviorDispatcher({
    ...entityZeroGraph,
    actions: [{ id: 'oversized', kind: 'set-visible', targetEntityId: 0, parameters: { oversized } }],
    behaviors: [{ id: 'oversized-behavior', trigger: 'select', sourceEntityId: 0, actionIds: ['oversized'] }],
  }, () => undefined), /encoded bytes/)
})

test('behavior dispatcher snapshots behavior wiring and rejects non-object parameters', () => {
  const mutableGraph = structuredClone(behaviorGraph) as unknown as AuthoringBehaviorGraph
  const invoked: string[] = []
  const dispatcher = createExactOnceBehaviorDispatcher(mutableGraph, ({ action }) => invoked.push(action.id))
  ;(mutableGraph.behaviors[0] as { sourceEntityId: number }).sourceEntityId = 99
  ;(mutableGraph.behaviors[0].actionIds as string[]).splice(0)

  assert.equal(dispatcher.dispatch({ id: 'snapshot-event', revision: 1, trigger: 'select', sourceEntityId: 1 }).status, 'dispatched')
  assert.deepEqual(invoked, ['show-panel', 'emit-spark'])

  for (const parameters of [null, [1, 2]]) {
    assert.throws(() => createExactOnceBehaviorDispatcher({
      schema: BEHAVIOR_DISPATCH_GRAPH_SCHEMA,
      actions: [{ id: 'invalid-parameters', kind: 'set-visible', targetEntityId: 0, parameters }],
      behaviors: [{ id: 'invalid-parameters-behavior', trigger: 'select', sourceEntityId: 0, actionIds: ['invalid-parameters'] }],
    } as unknown as AuthoringBehaviorGraph, () => undefined), /plain object/)
  }
})

test('pinned behavior contract has exact keys and round-trips through storage', async () => {
  assert.equal(BEHAVIOR_GRAPH_SCHEMA, 'agentic-os-behavior-graph/v1')
  assert.notEqual(BEHAVIOR_DISPATCH_GRAPH_SCHEMA, BEHAVIOR_GRAPH_SCHEMA)
  const contract = createAgenticOsBehaviorGraphContract({
    graphId: 'hero-graph',
    nodes: [
      { id: 'select-hero', type: 'trigger', config: { trigger: 'select' } },
      { id: 'show-hero', type: 'action', config: { action: 'set-visible' } },
    ],
    edges: [{ from: 'select-hero', to: 'show-hero' }],
    boundEntity: '0',
  })
  assert.deepEqual(Object.keys(contract), ['graph_id', 'nodes', 'edges', 'bound_entity'])
  assert.deepEqual(Object.keys(contract.nodes[0]), ['id', 'type', 'config'])
  assert.deepEqual(Object.keys(contract.edges[0]), ['from', 'to'])
  assert.deepEqual(parseAgenticOsBehaviorGraphContract(JSON.stringify(contract)), contract)

  const persisted = new Map<string, string>()
  const published = await publishAgenticOsBehaviorGraphContract(contract, {
    put: async (id, serialized) => { persisted.set(id, serialized) },
    get: async id => persisted.get(id) ?? null,
  })
  assert.deepEqual(published, contract)
  const browserValues = new Map<string, string>()
  const browserStorage = createAgenticOsBehaviorGraphBrowserStorage({
    setItem: (key, value) => { browserValues.set(key, value) },
    getItem: key => browserValues.get(key) ?? null,
  } as Storage)
  assert.deepEqual(await publishAgenticOsBehaviorGraphContract(contract, browserStorage), contract)
  assert.throws(
    () => parseAgenticOsBehaviorGraphContract(JSON.stringify({ ...contract, schema: BEHAVIOR_GRAPH_SCHEMA })),
    /malformed agentic-os-behavior-graph/,
  )
})

test('pinned behavior parser rejects wrong field types instead of normalizing them', () => {
  for (const malformed of [
    { graph_id: 'graph', nodes: {}, edges: [], bound_entity: null },
    { graph_id: 'graph', nodes: [], edges: {}, bound_entity: null },
    { graph_id: 1, nodes: [], edges: [], bound_entity: null },
    { graph_id: 'graph', nodes: [], edges: [], bound_entity: 0 },
  ]) {
    assert.throws(
      () => parseAgenticOsBehaviorGraphContract(JSON.stringify(malformed)),
      /malformed agentic-os-behavior-graph\/v1 contract fields/,
    )
  }
})
