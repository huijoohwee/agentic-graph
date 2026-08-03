import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  BEHAVIOR_GRAPH_SCHEMA,
  createExactOnceBehaviorDispatcher,
  type AuthoringBehaviorGraph,
} from '../behaviorDispatcher'

const behaviorGraph: AuthoringBehaviorGraph = {
  schema: BEHAVIOR_GRAPH_SCHEMA,
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
